import { Platform } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';

/**
 * CLI integration utilities for detecting SimpleToken CLI availability
 * Focuses on detection and status only - no direct CLI execution
 */
export class CLIIntegration {
    private static readonly SIMPLE_TOKEN_SCRIPT = 'scripts/simple-token.js';

    /**
     * Detect if SimpleToken CLI script exists in the project
     */
    static detectSimpleTokenCLI(): {
        available: boolean;
        location?: string;
        method: 'npm_script' | 'node_script' | 'none';
    } {
        try {
            // Check for npm script in package.json
            const npmScriptResult = this.checkNpmScript();
            if (npmScriptResult.available) {
                return npmScriptResult;
            }

            // Check for direct script file
            const directScriptResult = this.checkDirectScript();
            if (directScriptResult.available) {
                return directScriptResult;
            }

            return {
                available: false,
                method: 'none'
            };

        } catch (error) {
            console.warn('CLI Detection failed:', error.message);
            return {
                available: false,
                method: 'none'
            };
        }
    }

    /**
     * Check if SimpleToken is available via npm scripts
     */
    private static checkNpmScript(): {
        available: boolean;
        location?: string;
        method: 'npm_script' | 'none';
    } {
        try {
            const packageJsonPath = path.resolve('package.json');
            if (!fs.existsSync(packageJsonPath)) {
                return { available: false, method: 'none' };
            }

            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            if (packageJson.scripts?.['simple-token']) {
                return {
                    available: true,
                    method: 'npm_script',
                    location: 'npm run simple-token'
                };
            }

            return { available: false, method: 'none' };

        } catch (error) {
            return { available: false, method: 'none' };
        }
    }

    /**
     * Check if SimpleToken script exists as a file
     */
    private static checkDirectScript(): {
        available: boolean;
        location?: string;
        method: 'node_script' | 'none';
    } {
        try {
            const scriptPath = path.resolve(this.SIMPLE_TOKEN_SCRIPT);
            if (fs.existsSync(scriptPath)) {
                return {
                    available: true,
                    method: 'node_script',
                    location: scriptPath
                };
            }

            return { available: false, method: 'none' };

        } catch (error) {
            return { available: false, method: 'none' };
        }
    }

    /**
     * Get setup instructions for SimpleToken CLI
     */
    static getSetupInstructions(): {
        available: boolean;
        command?: string;
        instructions: string[];
    } {
        const detection = this.detectSimpleTokenCLI();

        if (!detection.available) {
            return {
                available: false,
                instructions: [
                    'SimpleToken CLI not found',
                    'Ensure the CLI is properly installed in the project',
                    'Check that scripts/simple-token.js exists or npm run simple-token is configured'
                ]
            };
        }

        let command: string;
        if (detection.method === 'npm_script') {
            command = 'npm run simple-token';
        } else {
            command = `node "${detection.location}"`;
        }

        return {
            available: true,
            command,
            instructions: [
                `To set up SimpleToken CLI, run: ${command}`,
                'Follow the interactive setup to generate credentials',
                'The plugin will automatically detect and use the generated tokens'
            ]
        };
    }

    /**
     * Get platform-specific command examples
     */
    static getCommandExamples(): {
        platform: string;
        setupCommand: string;
        statusCommand: string;
        resetCommand: string;
    } {
        const platform = Platform.isMacOS ? 'macOS' : Platform.isWin ? 'Windows' : 'Linux';

        return {
            platform,
            setupCommand: 'npm run simple-token',
            statusCommand: 'npm run simple-token -- --status',
            resetCommand: 'npm run simple-token -- --reset'
        };
    }

    /**
     * Basic environment validation for SimpleToken CLI
     */
    static validateEnvironment(): {
        valid: boolean;
        issues: string[];
        suggestions: string[];
    } {
        const issues: string[] = [];
        const suggestions: string[] = [];

        try {
            // Check SimpleToken CLI availability
            const detection = this.detectSimpleTokenCLI();
            if (!detection.available) {
                issues.push('SimpleToken CLI not found');
                suggestions.push('Ensure SimpleToken CLI is properly installed');
            }

            // Check package.json for scripts
            try {
                const packageJsonPath = path.resolve('package.json');
                if (fs.existsSync(packageJsonPath)) {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                    if (!packageJson.scripts?.['simple-token']) {
                        issues.push('simple-token npm script not found in package.json');
                        suggestions.push('Add simple-token script to package.json');
                    }
                } else {
                    issues.push('package.json not found');
                    suggestions.push('Ensure you are in the correct project directory');
                }
            } catch (error) {
                issues.push('Failed to read package.json');
                suggestions.push('Check package.json format and permissions');
            }

        } catch (error) {
            issues.push(`Environment validation failed: ${error.message}`);
            suggestions.push('Check your development environment setup');
        }

        return {
            valid: issues.length === 0,
            issues,
            suggestions
        };
    }
}