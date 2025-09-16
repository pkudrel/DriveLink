/**
 * Credential Manager Module for SimpleToken CLI Tool
 * Secure storage and management of credentials
 *
 * Provides local credential storage with security best practices
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createHash, randomBytes } = require('crypto');

// Color utilities (consistent with main CLI)
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function log(msg, color = colors.reset) {
    console.log(`${color}${msg}${colors.reset}`);
}

// Configuration
const CREDENTIALS_DIR = path.join(os.homedir(), '.drivelink');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'tokens.json');

/**
 * Ensure credentials directory exists
 */
function ensureCredentialsDir() {
    try {
        if (!fs.existsSync(CREDENTIALS_DIR)) {
            fs.mkdirSync(CREDENTIALS_DIR, { mode: 0o700 }); // Owner read/write only
            log(`📁 Created credentials directory: ${CREDENTIALS_DIR}`, colors.cyan);
        }
    } catch (error) {
        throw new Error(`Failed to create credentials directory: ${error.message}`);
    }
}

/**
 * Simple obfuscation for stored credentials (NOT encryption - just obscurity)
 * @param {string} data - Data to obfuscate
 * @returns {string} Obfuscated data
 */
function obfuscate(data) {
    const key = 'drivelink-simple-token-key'; // Static key for consistency
    const keyBuffer = Buffer.from(key, 'utf8');
    const dataBuffer = Buffer.from(data, 'utf8');
    const result = Buffer.alloc(dataBuffer.length);

    for (let i = 0; i < dataBuffer.length; i++) {
        result[i] = dataBuffer[i] ^ keyBuffer[i % keyBuffer.length];
    }

    return result.toString('base64');
}

/**
 * Deobfuscate stored credentials
 * @param {string} obfuscatedData - Obfuscated data
 * @returns {string} Original data
 */
function deobfuscate(obfuscatedData) {
    try {
        const key = 'drivelink-simple-token-key';
        const keyBuffer = Buffer.from(key, 'utf8');
        const dataBuffer = Buffer.from(obfuscatedData, 'base64');
        const result = Buffer.alloc(dataBuffer.length);

        for (let i = 0; i < dataBuffer.length; i++) {
            result[i] = dataBuffer[i] ^ keyBuffer[i % keyBuffer.length];
        }

        return result.toString('utf8');
    } catch (error) {
        throw new Error('Failed to deobfuscate data - may be corrupted');
    }
}

/**
 * Save OAuth credentials securely
 * @param {string} clientId - Google Cloud OAuth client ID
 * @param {string} clientSecret - Google Cloud OAuth client secret
 * @returns {boolean} Success status
 */
function saveCredentials(clientId, clientSecret) {
    try {
        ensureCredentialsDir();

        const credentials = {
            clientId: clientId,
            clientSecret: clientSecret,
            savedAt: new Date().toISOString(),
            version: '1.0'
        };

        const credentialsJson = JSON.stringify(credentials, null, 2);
        const obfuscatedData = obfuscate(credentialsJson);

        fs.writeFileSync(CREDENTIALS_FILE, obfuscatedData, { mode: 0o600 }); // Owner read/write only

        log(`✅ Credentials saved securely`, colors.green);
        log(`   Location: ${CREDENTIALS_FILE}`, colors.cyan);

        return true;

    } catch (error) {
        log(`❌ Failed to save credentials: ${error.message}`, colors.red);
        return false;
    }
}

/**
 * Load saved OAuth credentials
 * @returns {object|null} Credentials object or null if not found
 */
function loadCredentials() {
    try {
        if (!fs.existsSync(CREDENTIALS_FILE)) {
            log(`📭 No saved credentials found`, colors.yellow);
            return null;
        }

        const obfuscatedData = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
        const credentialsJson = deobfuscate(obfuscatedData);
        const credentials = JSON.parse(credentialsJson);

        // Validate structure
        if (!credentials.clientId || !credentials.clientSecret) {
            throw new Error('Invalid credentials structure');
        }

        log(`✅ Credentials loaded successfully`, colors.green);
        log(`   Saved: ${credentials.savedAt}`, colors.cyan);

        return {
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            savedAt: credentials.savedAt
        };

    } catch (error) {
        log(`❌ Failed to load credentials: ${error.message}`, colors.red);
        log(`   You may need to re-enter your credentials`, colors.cyan);
        return null;
    }
}

/**
 * Save access tokens securely
 * @param {object} tokens - Token object with access_token, refresh_token, etc.
 * @returns {boolean} Success status
 */
function saveTokens(tokens) {
    try {
        ensureCredentialsDir();

        const tokenData = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresIn: tokens.expires_in,
            tokenType: tokens.token_type || 'Bearer',
            scope: tokens.scope,
            savedAt: new Date().toISOString(),
            expiresAt: tokens.expires_in ?
                new Date(Date.now() + (tokens.expires_in * 1000)).toISOString() : null,
            version: '1.0'
        };

        const tokensJson = JSON.stringify(tokenData, null, 2);
        const obfuscatedData = obfuscate(tokensJson);

        fs.writeFileSync(TOKENS_FILE, obfuscatedData, { mode: 0o600 }); // Owner read/write only

        log(`✅ Tokens saved securely`, colors.green);
        log(`   Location: ${TOKENS_FILE}`, colors.cyan);

        return true;

    } catch (error) {
        log(`❌ Failed to save tokens: ${error.message}`, colors.red);
        return false;
    }
}

/**
 * Load saved access tokens
 * @returns {object|null} Tokens object or null if not found
 */
function loadTokens() {
    try {
        if (!fs.existsSync(TOKENS_FILE)) {
            log(`📭 No saved tokens found`, colors.yellow);
            return null;
        }

        const obfuscatedData = fs.readFileSync(TOKENS_FILE, 'utf8');
        const tokensJson = deobfuscate(obfuscatedData);
        const tokens = JSON.parse(tokensJson);

        // Check if tokens are expired
        if (tokens.expiresAt) {
            const expiresAt = new Date(tokens.expiresAt);
            const now = new Date();

            if (now >= expiresAt) {
                log(`⏰ Access token has expired`, colors.yellow);
                log(`   Expired: ${tokens.expiresAt}`, colors.cyan);

                if (tokens.refreshToken) {
                    log(`   Refresh token available for renewal`, colors.blue);
                } else {
                    log(`   No refresh token - re-authentication required`, colors.red);
                }
            }
        }

        log(`✅ Tokens loaded successfully`, colors.green);
        log(`   Saved: ${tokens.savedAt}`, colors.cyan);

        return tokens;

    } catch (error) {
        log(`❌ Failed to load tokens: ${error.message}`, colors.red);
        return null;
    }
}

/**
 * Delete saved credentials
 * @returns {boolean} Success status
 */
function deleteCredentials() {
    try {
        let deleted = false;

        if (fs.existsSync(CREDENTIALS_FILE)) {
            fs.unlinkSync(CREDENTIALS_FILE);
            log(`🗑️  Deleted credentials file`, colors.yellow);
            deleted = true;
        }

        if (fs.existsSync(TOKENS_FILE)) {
            fs.unlinkSync(TOKENS_FILE);
            log(`🗑️  Deleted tokens file`, colors.yellow);
            deleted = true;
        }

        if (!deleted) {
            log(`📭 No credentials or tokens found to delete`, colors.blue);
        }

        return true;

    } catch (error) {
        log(`❌ Failed to delete credentials: ${error.message}`, colors.red);
        return false;
    }
}

/**
 * Check credential storage status
 * @returns {object} Status information
 */
function getStorageStatus() {
    const status = {
        credentialsExist: fs.existsSync(CREDENTIALS_FILE),
        tokensExist: fs.existsSync(TOKENS_FILE),
        storageDir: CREDENTIALS_DIR,
        storageDirExists: fs.existsSync(CREDENTIALS_DIR)
    };

    log(`📊 Credential storage status:`, colors.blue);
    log(`   Directory: ${status.storageDir}`, colors.cyan);
    log(`   Directory exists: ${status.storageDirExists ? '✅' : '❌'}`,
        status.storageDirExists ? colors.green : colors.red);
    log(`   Credentials saved: ${status.credentialsExist ? '✅' : '❌'}`,
        status.credentialsExist ? colors.green : colors.red);
    log(`   Tokens saved: ${status.tokensExist ? '✅' : '❌'}`,
        status.tokensExist ? colors.green : colors.red);

    return status;
}

/**
 * Validate token structure and expiry
 * @param {object} tokens - Token object to validate
 * @returns {boolean} True if tokens are valid and not expired
 */
function validateTokens(tokens) {
    if (!tokens || !tokens.accessToken) {
        log(`❌ Invalid token structure`, colors.red);
        return false;
    }

    if (tokens.expiresAt) {
        const expiresAt = new Date(tokens.expiresAt);
        const now = new Date();

        if (now >= expiresAt) {
            log(`⏰ Tokens have expired`, colors.yellow);
            return false;
        }
    }

    log(`✅ Tokens are valid`, colors.green);
    return true;
}

/**
 * Format tokens for DriveLink plugin usage
 * @param {object} tokens - Token object
 * @param {object} credentials - Credentials object with clientId and clientSecret
 * @returns {string} Formatted token string for copying
 */
function formatTokensForPlugin(tokens, credentials = null) {
    if (!tokens) {
        return null;
    }

    // Handle both formats: OAuth response format and internal format
    const accessToken = tokens.access_token || tokens.accessToken;
    const refreshToken = tokens.refresh_token || tokens.refreshToken;
    const tokenType = tokens.token_type || tokens.tokenType || 'Bearer';
    const expiresIn = tokens.expires_in || tokens.expiresIn;
    const scope = tokens.scope;

    if (!accessToken) {
        return null;
    }

    const formattedTokens = {
        access_token: accessToken,
        refresh_token: refreshToken || null,
        token_type: tokenType,
        expires_in: expiresIn || null,
        scope: scope || null
    };

    // Include credentials if provided (for complete plugin package)
    if (credentials && credentials.clientId && credentials.clientSecret) {
        formattedTokens.client_id = credentials.clientId;
        formattedTokens.client_secret = credentials.clientSecret;
    }

    return JSON.stringify(formattedTokens, null, 2);
}

module.exports = {
    saveCredentials,
    loadCredentials,
    saveTokens,
    loadTokens,
    deleteCredentials,
    getStorageStatus,
    validateTokens,
    formatTokensForPlugin,
    CREDENTIALS_DIR
};