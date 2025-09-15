/**
 * Centralized logging utility for DriveLink plugin debugging
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export interface LogContext {
    operation?: string;
    component?: string;
    duration?: number;
    metadata?: Record<string, any>;
    [key: string]: any; // Allow any additional properties
}

export class Logger {
    private static level: LogLevel = LogLevel.INFO;
    private static readonly PREFIX = '[DriveLink]';
    private static readonly COLORS = {
        DEBUG: '#8B949E', // Gray
        INFO: '#58A6FF',  // Blue
        WARN: '#F7CC47',  // Yellow
        ERROR: '#F85149' // Red
    };

    /**
     * Set the global log level
     */
    static setLevel(level: LogLevel): void {
        Logger.level = level;
        Logger.info('Logger', `Log level set to ${LogLevel[level]}`, { level });
    }

    /**
     * Get current log level
     */
    static getLevel(): LogLevel {
        return Logger.level;
    }

    /**
     * Log debug information (development only)
     */
    static debug(component: string, message: string, context?: LogContext): void {
        if (Logger.level <= LogLevel.DEBUG) {
            Logger.log(LogLevel.DEBUG, component, message, context);
        }
    }

    /**
     * Log general information
     */
    static info(component: string, message: string, context?: LogContext): void {
        if (Logger.level <= LogLevel.INFO) {
            Logger.log(LogLevel.INFO, component, message, context);
        }
    }

    /**
     * Log warnings
     */
    static warn(component: string, message: string, context?: LogContext): void {
        if (Logger.level <= LogLevel.WARN) {
            Logger.log(LogLevel.WARN, component, message, context);
        }
    }

    /**
     * Log errors with optional Error object
     */
    static error(component: string, message: string, error?: Error, context?: LogContext): void {
        if (Logger.level <= LogLevel.ERROR) {
            const errorContext: LogContext = {
                ...context,
                error: error ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } : undefined
            };
            Logger.log(LogLevel.ERROR, component, message, errorContext);
        }
    }

    /**
     * Start timing an operation
     */
    static startTiming(operation: string): () => void {
        const startTime = Date.now();
        return () => {
            const duration = Date.now() - startTime;
            Logger.debug('Timer', `${operation} completed`, { operation, duration });
        };
    }

    /**
     * Log with performance timing
     */
    static timed<T>(component: string, operation: string, fn: () => T): T {
        const endTiming = Logger.startTiming(operation);
        try {
            Logger.debug(component, `Starting ${operation}`);
            const result = fn();
            endTiming();
            return result;
        } catch (error) {
            endTiming();
            Logger.error(component, `${operation} failed`, error as Error);
            throw error;
        }
    }

    /**
     * Log async operations with performance timing
     */
    static async timedAsync<T>(component: string, operation: string, fn: () => Promise<T>): Promise<T> {
        const endTiming = Logger.startTiming(operation);
        try {
            Logger.debug(component, `Starting ${operation}`);
            const result = await fn();
            endTiming();
            return result;
        } catch (error) {
            endTiming();
            Logger.error(component, `${operation} failed`, error as Error);
            throw error;
        }
    }

    /**
     * Core logging implementation
     */
    private static log(level: LogLevel, component: string, message: string, context?: LogContext): void {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const levelText = LogLevel[level].padEnd(5);
        const componentText = component.padEnd(12);

        const logPrefix = `${Logger.PREFIX} ${timestamp} ${levelText} [${componentText}]`;
        const fullMessage = `${logPrefix} ${message}`;

        // Use appropriate console method
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(fullMessage, context || '');
                break;
            case LogLevel.INFO:
                console.log(fullMessage, context || '');
                break;
            case LogLevel.WARN:
                console.warn(fullMessage, context || '');
                break;
            case LogLevel.ERROR:
                console.error(fullMessage, context || '');
                break;
        }
    }

    /**
     * Create a component-specific logger
     */
    static createComponentLogger(componentName: string) {
        return {
            debug: (message: string, context?: LogContext) =>
                Logger.debug(componentName, message, context),
            info: (message: string, context?: LogContext) =>
                Logger.info(componentName, message, context),
            warn: (message: string, context?: LogContext) =>
                Logger.warn(componentName, message, context),
            error: (message: string, error?: Error, context?: LogContext) =>
                Logger.error(componentName, message, error, context),
            timed: <T>(operation: string, fn: () => T) =>
                Logger.timed(componentName, operation, fn),
            timedAsync: <T>(operation: string, fn: () => Promise<T>) =>
                Logger.timedAsync(componentName, operation, fn)
        };
    }
}