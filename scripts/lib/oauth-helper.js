/**
 * OAuth Helper Module for SimpleToken CLI Tool
 * Handles Google Drive API OAuth flow automation
 *
 * Provides simplified OAuth flow similar to chrome-webstore-upload-keys approach
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { promisify } = require('util');
const { createHash, randomBytes } = require('crypto');
const { URL } = require('url');
const { exec } = require('child_process');

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

/**
 * Make HTTP request (Promise-based)
 * @param {string} url - Request URL
 * @param {object} options - Request options
 * @returns {Promise<object>} Response data
 */
function makeHttpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = httpModule.request(requestOptions, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const responseData = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    };

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(responseData);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        // Write request body if provided
        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

/**
 * Open URL in default browser (cross-platform)
 * @param {string} url - URL to open
 * @returns {Promise<void>}
 */
function openBrowser(url) {
    return new Promise((resolve, reject) => {
        let command;

        // Determine command based on platform
        switch (process.platform) {
            case 'darwin': // macOS
                command = `open "${url}"`;
                break;
            case 'win32': // Windows
                command = `start "" "${url}"`;
                break;
            default: // Linux and others
                command = `xdg-open "${url}"`;
                break;
        }

        exec(command, (error) => {
            if (error) {
                log(`⚠️  Could not auto-open browser: ${error.message}`, colors.yellow);
                resolve(); // Don't reject, just log warning
            } else {
                log(`🌐 Opened browser automatically`, colors.green);
                resolve();
            }
        });
    });
}

// OAuth Configuration
const OAUTH_CONFIG = {
    // Google OAuth 2.0 endpoints
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',

    // Google Drive API scope
    scope: 'https://www.googleapis.com/auth/drive',

    // Redirect URI for installed applications
    redirectUri: 'http://localhost:8080/callback',

    // Response type for authorization code flow
    responseType: 'code',

    // Access type for refresh tokens
    accessType: 'offline',

    // Prompt for consent screen
    prompt: 'consent'
};

/**
 * Generate OAuth 2.0 authorization URL
 * @param {string} clientId - Google Cloud OAuth client ID
 * @param {string} codeVerifier - PKCE code verifier (optional)
 * @returns {string} Authorization URL
 */
function generateAuthUrl(clientId, codeVerifier = null) {
    if (!clientId) {
        throw new Error('Client ID is required for OAuth flow');
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: OAUTH_CONFIG.redirectUri,
        scope: OAUTH_CONFIG.scope,
        response_type: OAUTH_CONFIG.responseType,
        access_type: OAUTH_CONFIG.accessType,
        prompt: OAUTH_CONFIG.prompt
    });

    // Add PKCE parameters if provided (more secure)
    if (codeVerifier) {
        const codeChallenge = createHash('sha256')
            .update(codeVerifier)
            .digest('base64url');

        params.append('code_challenge', codeChallenge);
        params.append('code_challenge_method', 'S256');
    }

    const authUrl = `${OAUTH_CONFIG.authUrl}?${params.toString()}`;

    log(`🔗 Generated OAuth authorization URL`, colors.blue);
    log(`   Scope: ${OAUTH_CONFIG.scope}`, colors.cyan);
    log(`   Redirect: ${OAUTH_CONFIG.redirectUri}`, colors.cyan);

    return authUrl;
}

/**
 * Generate PKCE code verifier for enhanced security
 * @returns {string} Base64url-encoded code verifier
 */
function generateCodeVerifier() {
    return randomBytes(32).toString('base64url');
}

/**
 * Extract authorization code from callback URL
 * @param {string} callbackUrl - Full callback URL with parameters
 * @returns {object} Parsed callback data
 */
function parseCallback(callbackUrl) {
    try {
        const url = new URL(callbackUrl);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const state = url.searchParams.get('state');

        if (error) {
            throw new Error(`OAuth error: ${error}`);
        }

        if (!code) {
            throw new Error('Authorization code not found in callback URL');
        }

        log(`✅ Authorization code received`, colors.green);
        log(`   Code: ${code.substring(0, 20)}...`, colors.cyan);

        return {
            code,
            state,
            error: null
        };

    } catch (error) {
        log(`❌ Failed to parse callback URL`, colors.red);
        throw error;
    }
}

/**
 * Exchange authorization code for access token
 * @param {string} clientId - Google Cloud OAuth client ID
 * @param {string} clientSecret - Google Cloud OAuth client secret
 * @param {string} authorizationCode - Authorization code from callback
 * @param {string} codeVerifier - PKCE code verifier (if used)
 * @returns {Promise<object>} Token response
 */
async function exchangeCodeForTokens(clientId, clientSecret, authorizationCode, codeVerifier = null) {
    if (!clientId || !clientSecret || !authorizationCode) {
        throw new Error('Client ID, client secret, and authorization code are required');
    }

    const tokenData = {
        client_id: clientId,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: 'authorization_code',
        redirect_uri: OAUTH_CONFIG.redirectUri
    };

    // Add PKCE verifier if provided
    if (codeVerifier) {
        tokenData.code_verifier = codeVerifier;
    }

    try {
        log(`🔄 Exchanging authorization code for tokens...`, colors.blue);

        const requestBody = new URLSearchParams(tokenData).toString();

        const response = await makeHttpRequest(OAUTH_CONFIG.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(requestBody)
            },
            body: requestBody
        });

        const tokenResponse = JSON.parse(response.body);

        if (tokenResponse.error) {
            throw new Error(`OAuth error: ${tokenResponse.error_description || tokenResponse.error}`);
        }

        log(`✅ Token exchange successful`, colors.green);
        log(`   Token type: ${tokenResponse.token_type || 'Bearer'}`, colors.cyan);
        log(`   Expires in: ${tokenResponse.expires_in || 'unknown'} seconds`, colors.cyan);
        log(`   Refresh token: ${tokenResponse.refresh_token ? 'Yes' : 'No'}`, colors.cyan);

        return {
            success: true,
            tokens: {
                access_token: tokenResponse.access_token,
                refresh_token: tokenResponse.refresh_token,
                expires_in: tokenResponse.expires_in,
                token_type: tokenResponse.token_type || 'Bearer',
                scope: tokenResponse.scope
            }
        };

    } catch (error) {
        log(`❌ Token exchange failed: ${error.message}`, colors.red);
        throw error;
    }
}

/**
 * Validate OAuth client credentials
 * @param {string} clientId - Google Cloud OAuth client ID
 * @param {string} clientSecret - Google Cloud OAuth client secret
 * @returns {boolean} True if credentials appear valid
 */
function validateCredentials(clientId, clientSecret) {
    if (!clientId || !clientSecret) {
        log(`❌ Missing OAuth credentials`, colors.red);
        return false;
    }

    // Basic format validation
    const clientIdPattern = /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/;

    if (!clientIdPattern.test(clientId)) {
        log(`❌ Invalid client ID format`, colors.red);
        log(`   Expected: 123456789-abc...xyz.apps.googleusercontent.com`, colors.cyan);
        return false;
    }

    if (clientSecret.length < 20) {
        log(`❌ Client secret appears too short`, colors.red);
        return false;
    }

    log(`✅ OAuth credentials format looks valid`, colors.green);
    return true;
}

/**
 * Start local callback server for OAuth flow
 * @param {number} port - Port number (default: 8080)
 * @returns {Promise<object>} Authorization code and state from callback
 */
async function startCallbackServer(port = 8080) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            try {
                const url = new URL(req.url, `http://localhost:${port}`);

                if (url.pathname === '/callback') {
                    const code = url.searchParams.get('code');
                    const error = url.searchParams.get('error');
                    const state = url.searchParams.get('state');

                    // Send response to browser
                    res.writeHead(200, { 'Content-Type': 'text/html' });

                    if (error) {
                        res.end(`
                            <html>
                                <head><title>OAuth Error</title></head>
                                <body>
                                    <h1>❌ OAuth Error</h1>
                                    <p>Error: ${error}</p>
                                    <p>You can close this window.</p>
                                </body>
                            </html>
                        `);
                        server.close();
                        reject(new Error(`OAuth error: ${error}`));
                        return;
                    }

                    if (code) {
                        res.end(`
                            <html>
                                <head><title>OAuth Success</title></head>
                                <body>
                                    <h1>✅ Authorization Successful</h1>
                                    <p>You can close this window and return to the terminal.</p>
                                    <script>setTimeout(() => window.close(), 3000);</script>
                                </body>
                            </html>
                        `);
                        server.close();
                        resolve({ code, state, error: null });
                        return;
                    }

                    // No code or error - something went wrong
                    res.end(`
                        <html>
                            <head><title>OAuth Error</title></head>
                            <body>
                                <h1>❌ Authorization Failed</h1>
                                <p>No authorization code received.</p>
                                <p>You can close this window.</p>
                            </body>
                        </html>
                    `);
                    server.close();
                    reject(new Error('No authorization code received'));

                } else {
                    // Handle other paths
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                            <head><title>Waiting for OAuth</title></head>
                            <body>
                                <h1>🔐 SimpleToken OAuth Server</h1>
                                <p>Waiting for OAuth callback...</p>
                                <p>Please complete the authorization in your browser.</p>
                            </body>
                        </html>
                    `);
                }

            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Server error occurred');
                server.close();
                reject(error);
            }
        });

        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                log(`❌ Port ${port} is already in use`, colors.red);
                reject(new Error(`Port ${port} is already in use. Try a different port.`));
            } else {
                reject(error);
            }
        });

        server.listen(port, 'localhost', () => {
            log(`🚀 Callback server started on http://localhost:${port}/callback`, colors.green);
            log(`   Waiting for OAuth callback...`, colors.cyan);
        });

        // Set timeout for callback (5 minutes)
        const timeout = setTimeout(() => {
            server.close();
            reject(new Error('OAuth callback timeout (5 minutes)'));
        }, 5 * 60 * 1000);

        // Clear timeout when resolved/rejected
        const originalResolve = resolve;
        const originalReject = reject;

        resolve = (value) => {
            clearTimeout(timeout);
            originalResolve(value);
        };

        reject = (error) => {
            clearTimeout(timeout);
            originalReject(error);
        };
    });
}

/**
 * Complete OAuth flow with interactive prompts
 * @param {string} clientId - Google Cloud OAuth client ID
 * @param {string} clientSecret - Google Cloud OAuth client secret
 * @returns {Promise<object>} Complete token information
 */
async function completeOAuthFlow(clientId, clientSecret) {
    try {
        log(`\n🔐 Starting OAuth flow for Google Drive API...`, colors.bright);

        // Validate credentials
        if (!validateCredentials(clientId, clientSecret)) {
            throw new Error('Invalid OAuth credentials provided');
        }

        // Generate PKCE parameters for security
        const codeVerifier = generateCodeVerifier();

        // Generate authorization URL
        const authUrl = generateAuthUrl(clientId, codeVerifier);

        log(`\n📝 Step 1: Starting callback server...`, colors.bright);

        // Start the callback server first
        const callbackPromise = startCallbackServer(8080);

        log(`\n📝 Step 2: Opening authorization URL...`, colors.bright);
        log(`   ${authUrl}`, colors.blue);

        // Try to open browser automatically
        try {
            await openBrowser(authUrl);
        } catch (error) {
            log(`⚠️  Auto-open failed, please copy URL above into your browser`, colors.yellow);
        }

        log(`\n⏳ Please complete authorization in your browser...`, colors.cyan);
        log(`   The browser will redirect to our local server when done.`, colors.cyan);

        log(`\n${colors.yellow}📝 If you see "Access blocked" error:${colors.reset}`);
        log(`   1. Go to Google Cloud Console → OAuth consent screen`, colors.cyan);
        log(`   2. Add your email to "Test users" section`, colors.cyan);
        log(`   3. Or click "Advanced" → "Go to DriveLink Plugin (unsafe)"`, colors.cyan);

        // Wait for callback
        const callbackData = await callbackPromise;

        log(`\n📝 Step 3: Exchanging code for tokens...`, colors.bright);

        // Exchange authorization code for tokens
        const tokenResult = await exchangeCodeForTokens(
            clientId,
            clientSecret,
            callbackData.code,
            codeVerifier
        );

        if (!tokenResult.success) {
            throw new Error('Token exchange failed');
        }

        log(`\n✅ OAuth flow completed successfully!`, colors.green);

        return {
            success: true,
            tokens: tokenResult.tokens,
            authUrl: authUrl,
            codeVerifier: codeVerifier
        };

    } catch (error) {
        log(`❌ OAuth flow failed: ${error.message}`, colors.red);
        throw error;
    }
}

module.exports = {
    generateAuthUrl,
    generateCodeVerifier,
    parseCallback,
    exchangeCodeForTokens,
    validateCredentials,
    startCallbackServer,
    completeOAuthFlow,
    openBrowser,
    OAUTH_CONFIG
};