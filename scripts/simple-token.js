#!/usr/bin/env node

/**
 * SimpleToken CLI Tool for DriveLink Obsidian Plugin
 * Simplified Google Drive API token acquisition similar to chrome-webstore-upload-keys
 *
 * Provides interactive token generation with step-by-step guidance for users
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Color output utilities (matching DriveLink pattern)
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(msg, color = colors.reset) {
    console.log(`${color}${msg}${colors.reset}`);
}

function logStep(step, msg) {
    log(`[${step}] ${msg}`, colors.cyan);
}

function logSuccess(msg) {
    log(`✅ ${msg}`, colors.green);
}

function logError(msg) {
    log(`❌ ${msg}`, colors.red);
}

function logWarning(msg) {
    log(`⚠️  ${msg}`, colors.yellow);
}

function logInfo(msg) {
    log(`ℹ️  ${msg}`, colors.blue);
}

// CLI Header
function showHeader() {
    log(`\n${colors.bright}🔐 SimpleToken - DriveLink Google Drive API Token Generator${colors.reset}`);
    log(`${colors.cyan}Similar to chrome-webstore-upload-keys, but for Google Drive API${colors.reset}\n`);
}

// Help text
function showHelp() {
    showHeader();
    console.log(`Usage: npm run simple-token [command]

Commands:
  (no args)        Interactive token generation wizard
  --help, -h       Show this help message
  --verify         Verify existing credentials
  --reset          Reset saved credentials
  --status         Show current setup status
  --guide          Show setup guide only (no token generation)
  --troubleshoot   Troubleshoot common issues

Examples:
  npm run simple-token              # Start interactive setup
  npm run simple-token -- --verify  # Verify existing setup
  npm run simple-token -- --reset   # Reset configuration

This tool helps you generate Google Drive API tokens with minimal technical knowledge,
following the same user-friendly approach as chrome-webstore-upload-keys.`);
}

// Show current status
function showStatus() {
    logStep('STATUS', 'Checking SimpleToken setup...');

    // Check for lib modules
    const libDir = path.join(__dirname, 'lib');
    const requiredModules = [
        'oauth-helper.js',
        'credential-manager.js',
        'gcp-guide.js',
        'templates.js'
    ];

    let setupComplete = fs.existsSync(libDir);
    const missingModules = [];

    if (setupComplete) {
        for (const module of requiredModules) {
            const modulePath = path.join(libDir, module);
            if (!fs.existsSync(modulePath)) {
                setupComplete = false;
                missingModules.push(module);
            }
        }
    }

    if (setupComplete) {
        logSuccess('SimpleToken setup is complete');
        logInfo('All required modules are available');
    } else {
        logWarning('SimpleToken setup is incomplete');
        if (!fs.existsSync(libDir)) {
            logError('Missing lib directory');
        }
        if (missingModules.length > 0) {
            logError(`Missing modules: ${missingModules.join(', ')}`);
        }
        logInfo('Run the development setup to complete installation');
    }

    return setupComplete;
}

// Main interactive workflow
async function startInteractiveSetup() {
    showHeader();

    logStep('1', 'Welcome to SimpleToken Setup!');
    log('This tool will guide you through generating Google Drive API tokens.');
    log('The process is similar to chrome-webstore-upload-keys but for Google Drive.\n');

    // Check if setup is complete
    if (!showStatus()) {
        log('\n❌ SimpleToken is not fully set up yet.');
        log('Please complete the development setup first.\n');
        return false;
    }

    try {
        // Load required modules
        const credentialManager = require('./lib/credential-manager');
        const oauthHelper = require('./lib/oauth-helper');

        logStep('2', 'Checking for existing credentials...');

        // Try to load existing credentials
        let credentials = credentialManager.loadCredentials();

        if (!credentials) {
            log('📝 No existing credentials found. Let\'s set them up!\n');

            // Guide user to get credentials
            const gcpGuide = require('./lib/gcp-guide');
            await gcpGuide.showInteractiveGuide();

            log('\n📝 Please enter your Google Cloud OAuth credentials:');

            // Interactive credential input
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const promptUser = (question) => {
                return new Promise((resolve) => {
                    rl.question(question, (answer) => {
                        resolve(answer.trim());
                    });
                });
            };

            try {
                const clientId = await promptUser(`${colors.cyan}Client ID: ${colors.reset}`);
                if (!clientId) {
                    rl.close();
                    logWarning('Client ID is required');
                    return false;
                }

                const clientSecret = await promptUser(`${colors.cyan}Client Secret: ${colors.reset}`);
                if (!clientSecret) {
                    rl.close();
                    logWarning('Client Secret is required');
                    return false;
                }

                rl.close();

                // Validate the credentials format
                const credentialManager = require('./lib/credential-manager');
                const oauthHelper = require('./lib/oauth-helper');

                if (!oauthHelper.validateCredentials(clientId, clientSecret)) {
                    logError('Invalid credential format');
                    logInfo('Please check your credentials and try again');
                    return false;
                }

                // Save the credentials
                const saveSuccess = credentialManager.saveCredentials(clientId, clientSecret);
                if (!saveSuccess) {
                    logError('Failed to save credentials');
                    return false;
                }

                logSuccess('Credentials saved successfully!');
                credentials = { clientId, clientSecret }; // Use the new credentials

            } catch (error) {
                rl.close();
                logError(`Credential input failed: ${error.message}`);
                return false;
            }
        }

        if (credentials.savedAt) {
            logSuccess(`Using existing credentials (saved: ${credentials.savedAt})`);
        } else {
            logSuccess('Using newly entered credentials');
        }

        logStep('3', 'Starting OAuth token generation...');

        // Start the OAuth flow
        const tokenResult = await oauthHelper.completeOAuthFlow(
            credentials.clientId,
            credentials.clientSecret
        );

        if (tokenResult.success) {
            logStep('4', 'Saving tokens securely...');

            // Save the tokens
            const saveSuccess = credentialManager.saveTokens(tokenResult.tokens);

            if (saveSuccess) {
                logSuccess('🎉 SimpleToken setup completed successfully!');
                log('\n📋 Your tokens have been generated and saved securely.');
                log('You can now copy the following JSON to your DriveLink plugin settings:\n');

                // Format tokens for plugin use
                const formattedTokens = credentialManager.formatTokensForPlugin(tokenResult.tokens);
                log(formattedTokens, colors.green);

                log('\n📝 Next steps:');
                logInfo('1. Copy the JSON above');
                logInfo('2. Open DriveLink plugin settings in Obsidian');
                logInfo('3. Paste the tokens in the SimpleToken section');
                logInfo('4. Click "Import Tokens"');

                return true;
            } else {
                logError('Failed to save tokens');
                return false;
            }
        } else {
            logError('OAuth flow failed');
            return false;
        }

    } catch (error) {
        logError(`Setup failed: ${error.message}`);
        logInfo('You can try running this again or use --reset to start over');
        return false;
    }
}

// Verify existing credentials
function verifyCredentials() {
    showHeader();
    logStep('VERIFY', 'Checking existing credentials...');

    try {
        const credentialManager = require('./lib/credential-manager');

        // Check storage status
        const status = credentialManager.getStorageStatus();

        if (!status.credentialsExist && !status.tokensExist) {
            logWarning('No credentials or tokens found');
            logInfo('Run SimpleToken without arguments to set up credentials');
            return;
        }

        // Verify credentials
        if (status.credentialsExist) {
            const credentials = credentialManager.loadCredentials();
            if (credentials) {
                logSuccess(`Credentials found (saved: ${credentials.savedAt})`);
            }
        }

        // Verify tokens
        if (status.tokensExist) {
            const tokens = credentialManager.loadTokens();
            if (tokens) {
                const isValid = credentialManager.validateTokens(tokens);
                if (isValid) {
                    logSuccess('Tokens are valid and not expired');
                } else {
                    logWarning('Tokens exist but may be expired');
                }
            }
        }

    } catch (error) {
        logError(`Verification failed: ${error.message}`);
    }
}

// Reset credentials
function resetCredentials() {
    showHeader();
    logStep('RESET', 'Resetting stored credentials...');

    try {
        const credentialManager = require('./lib/credential-manager');

        // Check if anything exists to delete
        const status = credentialManager.getStorageStatus();

        if (!status.credentialsExist && !status.tokensExist) {
            logInfo('No credentials or tokens found to reset');
            return;
        }

        // Delete all stored data
        const deleteSuccess = credentialManager.deleteCredentials();

        if (deleteSuccess) {
            logSuccess('All credentials and tokens have been reset');
            logInfo('You can now run SimpleToken to set up fresh credentials');
        } else {
            logError('Failed to reset credentials');
        }

    } catch (error) {
        logError(`Reset failed: ${error.message}`);
    }
}

// Show setup guide only
async function showGuide() {
    showHeader();

    try {
        const gcpGuide = require('./lib/gcp-guide');
        await gcpGuide.showInteractiveGuide();
    } catch (error) {
        logStep('GUIDE', 'Google Cloud Console Setup Guide');
        logWarning('Interactive setup guide module not found');
        logInfo('Please ensure all SimpleToken modules are installed');
    }
}

// Troubleshooting guide
function showTroubleshooting() {
    showHeader();
    logStep('TROUBLESHOOT', 'Common Issues and Solutions');

    log(`\n${colors.bright}🚫 "Access blocked: DriveLink Plugin has not completed the Google verification process"${colors.reset}`);

    log(`\n${colors.green}✅ SOLUTION 1: Add Test Users (Recommended)${colors.reset}`);
    log(`1. Go to: ${colors.blue}https://console.cloud.google.com/${colors.reset}`);
    log(`2. Navigate to: APIs & Services → OAuth consent screen`);
    log(`3. Scroll to "Test users" section`);
    log(`4. Click "+ ADD USERS"`);
    log(`5. Add your email address`);
    log(`6. Click "SAVE"`);
    log(`7. Try SimpleToken again\n`);

    log(`${colors.green}✅ SOLUTION 2: Use "Advanced" Option${colors.reset}`);
    log(`1. When you see the blocked screen`);
    log(`2. Look for small "Advanced" link at bottom`);
    log(`3. Click "Advanced"`);
    log(`4. Click "Go to DriveLink Plugin (unsafe)"`);
    log(`5. Continue with OAuth flow\n`);

    log(`${colors.green}✅ SOLUTION 3: Change to Internal App (Google Workspace only)${colors.reset}`);
    log(`1. Go to: OAuth consent screen`);
    log(`2. Change "User Type" from "External" to "Internal"`);
    log(`3. Note: Only works with Google Workspace accounts\n`);

    log(`\n${colors.bright}❌ "OAuth error" or "Invalid credentials"${colors.reset}`);
    log(`${colors.cyan}• Check Client ID format: 123456789-abc...xyz.apps.googleusercontent.com${colors.reset}`);
    log(`${colors.cyan}• Verify Client Secret is correct (long alphanumeric string)${colors.reset}`);
    log(`${colors.cyan}• Ensure redirect URI in Google Cloud matches: http://localhost:8080/callback${colors.reset}`);

    log(`\n${colors.bright}🔄 "Port already in use"${colors.reset}`);
    log(`${colors.cyan}• Close other applications using port 8080${colors.reset}`);
    log(`${colors.cyan}• Wait a few minutes and try again${colors.reset}`);
    log(`${colors.cyan}• Restart your terminal/command prompt${colors.reset}`);

    log(`\n${colors.bright}🌐 Browser doesn't open automatically${colors.reset}`);
    log(`${colors.cyan}• Copy the OAuth URL and paste it manually in your browser${colors.reset}`);
    log(`${colors.cyan}• Make sure you have a default browser set${colors.reset}`);

    log(`\n${colors.magenta}🆘 Still having issues?${colors.reset}`);
    log(`${colors.cyan}• Run: npm run simple-token -- --reset${colors.reset}`);
    log(`${colors.cyan}• Start fresh with: npm run simple-token -- --guide${colors.reset}`);
    log(`${colors.cyan}• Check setup: npm run simple-token -- --status${colors.reset}`);
}

// Main function
async function main() {
    const args = process.argv.slice(2);

    try {
        if (args.includes('--help') || args.includes('-h')) {
            showHelp();
            return;
        }

        if (args.includes('--status')) {
            showStatus();
            return;
        }

        if (args.includes('--verify')) {
            verifyCredentials();
            return;
        }

        if (args.includes('--reset')) {
            resetCredentials();
            return;
        }

        if (args.includes('--guide')) {
            await showGuide();
            return;
        }

        if (args.includes('--troubleshoot')) {
            showTroubleshooting();
            return;
        }

        // Default: interactive setup
        await startInteractiveSetup();

    } catch (error) {
        logError(`SimpleToken failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    main,
    showStatus,
    verifyCredentials,
    resetCredentials,
    showGuide
};