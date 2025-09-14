/**
 * Google Cloud Platform Setup Guide for SimpleToken CLI Tool
 * Interactive guide for Google Cloud Console setup
 *
 * Provides step-by-step instructions similar to chrome-webstore-upload-keys
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Color utilities (consistent with main CLI)
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

function logInfo(msg) {
    log(`ℹ️  ${msg}`, colors.blue);
}

function logWarning(msg) {
    log(`⚠️  ${msg}`, colors.yellow);
}

/**
 * Prompt user for input (Promise-based)
 * @param {string} question - Question to ask
 * @param {string[]} validOptions - Valid response options (optional)
 * @returns {Promise<string>} User input
 */
function promptUser(question, validOptions = null) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const askQuestion = () => {
            rl.question(question, (answer) => {
                const trimmedAnswer = answer.trim();

                if (validOptions && !validOptions.includes(trimmedAnswer)) {
                    log(`Please enter one of: ${validOptions.join(', ')}`, colors.yellow);
                    askQuestion();
                    return;
                }

                rl.close();
                resolve(trimmedAnswer);
            });
        };

        askQuestion();
    });
}

/**
 * Display the complete Google Cloud setup guide
 */
function showCompleteGuide() {
    log(`\n${colors.bright}📚 Google Cloud Platform Setup Guide${colors.reset}`, colors.bright);
    log(`${colors.cyan}Step-by-step instructions to create Google Drive API credentials${colors.reset}\n`);

    showStep1_CreateProject();
    showStep2_EnableAPI();
    showStep3_CreateCredentials();
    showStep4_ConfigureOAuth();
    showStep5_GetCredentials();
    showFinalNotes();
}

/**
 * Step 1: Create or select a Google Cloud project
 */
function showStep1_CreateProject() {
    logStep('STEP 1', 'Create or Select Google Cloud Project');
    log(`
1. Go to Google Cloud Console: ${colors.blue}https://console.cloud.google.com/${colors.reset}
2. Sign in with your Google account
3. Either:
   ${colors.green}• Create a new project:${colors.reset}
     - Click "Select a project" dropdown at the top
     - Click "NEW PROJECT"
     - Name: "DriveLink Plugin" (or your preferred name)
     - Click "CREATE"

   ${colors.yellow}• Or select an existing project${colors.reset}
     - Click "Select a project" dropdown
     - Choose your preferred project

${colors.cyan}✨ Tip: Creating a dedicated project for DriveLink keeps things organized${colors.reset}
`);
}

/**
 * Step 2: Enable Google Drive API
 */
function showStep2_EnableAPI() {
    logStep('STEP 2', 'Enable Google Drive API');
    log(`
1. In the Google Cloud Console, ensure your project is selected
2. Go to APIs & Services: ${colors.blue}https://console.cloud.google.com/apis/library${colors.reset}
3. Search for "Google Drive API"
4. Click on "Google Drive API" from the results
5. Click "ENABLE" button

${colors.green}✅ You should see "API enabled" confirmation${colors.reset}

${colors.cyan}✨ Tip: This allows your DriveLink plugin to access Google Drive${colors.reset}
`);
}

/**
 * Step 3: Create OAuth 2.0 credentials
 */
function showStep3_CreateCredentials() {
    logStep('STEP 3', 'Create OAuth 2.0 Credentials');
    log(`
1. Go to Credentials page: ${colors.blue}https://console.cloud.google.com/apis/credentials${colors.reset}
2. Click "+ CREATE CREDENTIALS" at the top
3. Select "OAuth client ID"
4. If prompted about OAuth consent screen:
   - Click "CONFIGURE CONSENT SCREEN"
   - Choose "External" (unless you have Google Workspace)
   - Click "CREATE"

${colors.yellow}⚠️  You'll need to configure the consent screen first if it's your first time${colors.reset}
`);
}

/**
 * Step 4: Configure OAuth consent screen
 */
function showStep4_ConfigureOAuth() {
    logStep('STEP 4', 'Configure OAuth Consent Screen');
    log(`
${colors.bright}If configuring consent screen for the first time:${colors.reset}

1. Fill required fields:
   ${colors.cyan}• App name:${colors.reset} "DriveLink Plugin" (or your app name)
   ${colors.cyan}• User support email:${colors.reset} Your email address
   ${colors.cyan}• Developer contact:${colors.reset} Your email address

2. Add scopes (click "ADD OR REMOVE SCOPES"):
   ${colors.green}• Search for: ../auth/drive.file${colors.reset}
   ${colors.green}• Select: See, edit, create, and delete only the specific Google Drive files you use with this app${colors.reset}
   ${colors.green}• Click "UPDATE"${colors.reset}

3. Add test users ${colors.yellow}(CRITICAL - prevents "Access blocked" errors)${colors.reset}:
   ${colors.cyan}• Click "ADD USERS"${colors.reset}
   ${colors.cyan}• Add your email address${colors.reset}
   ${colors.cyan}• Add any other users who will use this plugin${colors.reset}
   ${colors.cyan}• Click "SAVE"${colors.reset}

${colors.yellow}⚠️  WITHOUT TEST USERS: You'll get "Access blocked: DriveLink Plugin has not completed the Google verification process"${colors.reset}

4. Click "SAVE AND CONTINUE" through the steps
5. Return to Credentials page

${colors.cyan}✨ Tip: This is a one-time setup for your Google account${colors.reset}
`);
}

/**
 * Step 5: Get your credentials
 */
function showStep5_GetCredentials() {
    logStep('STEP 5', 'Create and Download Credentials');
    log(`
1. Back on Credentials page, click "+ CREATE CREDENTIALS"
2. Select "OAuth client ID"
3. Choose application type: "Desktop application"
4. Name: "DriveLink Desktop Client" (or your preferred name)
5. Click "CREATE"

${colors.bright}📋 You'll see a popup with your credentials:${colors.reset}
${colors.green}• Client ID:${colors.reset} 123456789-abc...xyz.apps.googleusercontent.com
${colors.green}• Client Secret:${colors.reset} ABC123-def456...

${colors.yellow}🔐 IMPORTANT: Keep these credentials secure!${colors.reset}
${colors.cyan}• Don't share them publicly${colors.reset}
${colors.cyan}• Don't commit them to version control${colors.reset}
${colors.cyan}• Store them safely (you'll need them for SimpleToken)${colors.reset}

6. Click "DOWNLOAD JSON" to save credentials file (optional backup)
7. Copy both Client ID and Client Secret for the next step
`);
}

/**
 * Final notes and next steps
 */
function showFinalNotes() {
    log(`\n${colors.bright}🎉 Setup Complete!${colors.reset}`);
    log(`
${colors.green}✅ You now have Google Drive API credentials${colors.reset}
${colors.cyan}• Client ID: 123456789-abc...xyz.apps.googleusercontent.com${colors.reset}
${colors.cyan}• Client Secret: ABC123-def456...${colors.reset}

${colors.bright}Next Steps:${colors.reset}
1. Run SimpleToken with your credentials:
   ${colors.blue}npm run simple-token${colors.reset}

2. Follow the interactive prompts to generate your access tokens

3. Use the tokens in your DriveLink plugin settings

${colors.yellow}Need help?${colors.reset}
${colors.cyan}• Re-run this guide: npm run simple-token -- --guide${colors.reset}
${colors.cyan}• Check setup status: npm run simple-token -- --status${colors.reset}
${colors.cyan}• Reset if needed: npm run simple-token -- --reset${colors.reset}

${colors.magenta}🚀 Happy syncing with DriveLink!${colors.reset}
`);
}

/**
 * Show abbreviated quick setup for experienced users
 */
function showQuickGuide() {
    log(`\n${colors.bright}⚡ Quick Setup Guide${colors.reset}`);
    log(`
${colors.cyan}For experienced users:${colors.reset}

1. ${colors.blue}console.cloud.google.com${colors.reset} → Create/select project
2. Enable Google Drive API
3. Create OAuth 2.0 credentials (Desktop application)
4. Configure consent screen (External, add drive.file scope)
5. Copy Client ID & Client Secret
6. Run: ${colors.green}npm run simple-token${colors.reset}

${colors.yellow}Need detailed steps?${colors.reset} Run: ${colors.cyan}npm run simple-token -- --guide${colors.reset}
`);
}

/**
 * Validate if user has completed the setup steps
 * @param {string} clientId - Client ID to validate
 * @param {string} clientSecret - Client secret to validate
 * @returns {boolean} True if setup appears complete
 */
function validateSetupCompletion(clientId, clientSecret) {
    logStep('VALIDATE', 'Checking Google Cloud setup completion...');

    if (!clientId || !clientSecret) {
        log(`❌ Missing credentials`, colors.red);
        log(`   Please complete the Google Cloud setup guide first`, colors.cyan);
        return false;
    }

    // Basic format validation
    const clientIdPattern = /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/;

    if (!clientIdPattern.test(clientId)) {
        log(`❌ Invalid Client ID format`, colors.red);
        log(`   Expected: 123456789-abc...xyz.apps.googleusercontent.com`, colors.cyan);
        return false;
    }

    if (clientSecret.length < 20) {
        log(`❌ Client Secret appears invalid`, colors.red);
        log(`   Expected: Long alphanumeric string`, colors.cyan);
        return false;
    }

    logSuccess('Google Cloud setup appears complete');
    logInfo('Credentials format validation passed');

    return true;
}

/**
 * Interactive guide selection
 */
async function showInteractiveGuide() {
    log(`\n${colors.bright}📚 Google Cloud Setup Guide${colors.reset}`);
    log(`
Choose your guide type:

${colors.green}1. Complete Guide${colors.reset} - Detailed step-by-step instructions
${colors.yellow}2. Quick Guide${colors.reset} - Abbreviated steps for experienced users
`);

    try {
        const choice = await promptUser(
            `${colors.cyan}Enter your choice (1 or 2): ${colors.reset}`,
            ['1', '2']
        );

        if (choice === '1') {
            log(`${colors.green}📖 Starting Complete Guide...${colors.reset}\n`);
            showCompleteGuide();
        } else if (choice === '2') {
            log(`${colors.yellow}⚡ Starting Quick Guide...${colors.reset}\n`);
            showQuickGuide();
        }

    } catch (error) {
        log(`${colors.yellow}Defaulting to Complete Guide...${colors.reset}\n`);
        showCompleteGuide();
    }
}

module.exports = {
    showCompleteGuide,
    showQuickGuide,
    showInteractiveGuide,
    validateSetupCompletion,
    showStep1_CreateProject,
    showStep2_EnableAPI,
    showStep3_CreateCredentials,
    showStep4_ConfigureOAuth,
    showStep5_GetCredentials
};