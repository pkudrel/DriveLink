/**
 * Centralized logging utility for DriveLink plugin debugging
 */

import { redact } from './redact';

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

/**
 * Log entry kept in memory for the log window
 */
export interface LogEntry {
    time: string; // ISO timestamp
    level: LogLevel;
    component: string;
    message: string; // Already redacted, context included
    syncId?: number; // Set for entries written during a sync
}

export class Logger {
    private static level: LogLevel = LogLevel.INFO;
    private static readonly PREFIX = '[DriveLink]';
    private static readonly MAX_ENTRIES = 500;
    private static entries: LogEntry[] = [];
    private static currentSyncId: number | undefined;
    private static lastSyncId = 0;
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
     * Mark the start of a sync; entries until endSync() belong to it.
     * The marker is recorded regardless of the log level.
     */
    static startSync(message: string, context?: LogContext): void {
        Logger.lastSyncId++;
        Logger.currentSyncId = Logger.lastSyncId;
        Logger.log(LogLevel.INFO, 'Sync', message, context);
    }

    /**
     * Mark the end of the current sync (recorded regardless of the log level)
     */
    static endSync(message: string, context?: LogContext, failed = false): void {
        Logger.log(failed ? LogLevel.ERROR : LogLevel.INFO, 'Sync', message, context);
        Logger.currentSyncId = undefined;
    }

    /**
     * All buffered entries, oldest first
     */
    static getEntries(): LogEntry[] {
        return [...Logger.entries];
    }

    /**
     * Entries of the most recent sync (still buffered), oldest first
     */
    static getLastSyncEntries(): LogEntry[] {
        if (Logger.lastSyncId === 0) {
            return [];
        }
        return Logger.entries.filter(entry => entry.syncId === Logger.lastSyncId);
    }

    /**
     * Drop all buffered entries
     */
    static clearEntries(): void {
        Logger.entries = [];
    }

    /**
     * Format entries as plain text, one entry per line (context may span lines)
     */
    static formatEntries(entries: LogEntry[]): string {
        return entries
            .map(entry => `${entry.time} ${LogLevel[entry.level].padEnd(5)} [${entry.component}] ${entry.message}`)
            .join('\n');
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

        // Message with context, without secrets; used for the console and the buffer
        const body = redact(context && Object.keys(context).length > 0
            ? `${message} ${JSON.stringify(context, null, 2)}`
            : message);
        const logOutput = `${logPrefix} ${body}`;

        Logger.entries.push({
            time: new Date().toISOString(),
            level,
            component,
            message: body,
            syncId: Logger.currentSyncId
        });
        if (Logger.entries.length > Logger.MAX_ENTRIES) {
            Logger.entries.splice(0, Logger.entries.length - Logger.MAX_ENTRIES);
        }

        // Use console methods but also force immediate output using multiple techniques
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(logOutput);
                break;
            case LogLevel.INFO:
                console.log(logOutput);
                break;
            case LogLevel.WARN:
                console.warn(logOutput);
                break;
            case LogLevel.ERROR:
                console.error(logOutput);
                break;
        }

        // Force immediate console output by accessing the console object directly
        // and using multiple synchronous operations to break any buffering
        try {
            // Force console flush by accessing console properties
            const _ = console.Console || console.info || console.log;

            // Force immediate execution by creating a microtask
            Promise.resolve().then(() => {
                // This creates a microtask boundary that helps flush console output
            });

            // Alternative: Use console.clear() very rarely to force buffer flush
            if (level === LogLevel.ERROR && Math.random() < 0.01) {
                // Very rarely clear console to force flush (only on errors, 1% chance)
                setTimeout(() => console.log(''), 1);
            }

        } catch (e) {
            // Ignore any errors from flush attempts
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