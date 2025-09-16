import { Plugin } from 'obsidian';
import { OAuthManager } from './oauth';
import { Logger } from '../utils/logger';

/**
 * Stored token data
 */
interface TokenData {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    tokenType: string;
    scope: string;
    source?: 'manual' | 'simple_token'; // Track token source for persistence
    clientId?: string; // OAuth client ID for token refresh
    clientSecret?: string; // OAuth client secret for token refresh
}

/**
 * Token storage keys
 */
const TOKEN_STORAGE_KEY = 'drivelink-tokens';

/**
 * Manages OAuth tokens for Google Drive API access
 * Supports both manual OAuth flow and SimpleToken CLI integration
 */
export class TokenManager {
    private plugin: Plugin;
    private oauthManager: OAuthManager | null = null;
    private tokens: TokenData | null = null;
    private useSimpleToken: boolean = false;
    private logger = Logger.createComponentLogger('TokenManager');

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    /**
     * Initialize OAuth manager with client configuration
     */
    initializeOAuth(clientId: string, redirectUri: string): void {
        this.oauthManager = new OAuthManager(clientId, redirectUri);
    }

    /**
     * Start OAuth authorization flow
     */
    async authorize(): Promise<void> {
        if (!this.oauthManager) {
            throw new Error('OAuth manager not initialized. Set client ID first.');
        }

        try {
            // Start the OAuth flow
            const authUrl = await this.oauthManager.startAuthFlow();
            console.log('Authorization URL:', authUrl);

            // Note: The actual authorization completion will be handled via
            // the protocol handler in the main plugin when the callback is received
        } catch (error) {
            throw new Error(`Authorization failed: ${error.message}`);
        }
    }

    /**
     * Handle OAuth callback and complete token exchange
     */
    async handleCallback(callbackUrl: string): Promise<void> {
        if (!this.oauthManager) {
            throw new Error('OAuth manager not initialized');
        }

        try {
            // Parse the callback URL
            const { code, state } = this.oauthManager.parseCallbackUrl(callbackUrl);

            // Exchange code for tokens
            const tokenResponse = await this.oauthManager.exchangeCodeForTokens(code, state);

            // Store tokens
            const tokenData: TokenData = {
                accessToken: tokenResponse.access_token,
                refreshToken: tokenResponse.refresh_token,
                expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
                tokenType: tokenResponse.token_type,
                scope: tokenResponse.scope,
                source: 'manual'
            };

            await this.storeTokens(tokenData);
            this.tokens = tokenData;
            this.useSimpleToken = false; // Manual OAuth flow

            console.log('OAuth tokens received and stored successfully');
        } catch (error) {
            throw new Error(`Callback handling failed: ${error.message}`);
        }
    }


    /**
     * Import tokens from SimpleToken CLI output (copy-paste scenario)
     */
    async importSimpleTokenData(tokenString: string): Promise<boolean> {
        try {
            const tokenData = JSON.parse(tokenString);
            this.logger.debug('Importing SimpleToken data', {
                hasAccessToken: !!tokenData.access_token,
                hasRefreshToken: !!tokenData.refresh_token,
                expiresIn: tokenData.expires_in,
                tokenType: tokenData.token_type,
                scope: tokenData.scope
            });

            // Validate token structure
            if (!tokenData.access_token) {
                this.logger.error('Invalid token data: missing access_token');
                throw new Error('Invalid token data: missing access_token');
            }

            const now = Date.now();
            const expiresAt = tokenData.expires_in ?
                now + (tokenData.expires_in * 1000) :
                now + (60 * 60 * 1000);

            this.logger.debug('Token expiry calculation', {
                expiresIn: tokenData.expires_in,
                currentTime: new Date(now).toISOString(),
                expiresAt: new Date(expiresAt).toISOString(),
                validFor: Math.floor((expiresAt - now) / 1000) + ' seconds'
            });

            // Convert to internal format
            const internalTokenData: TokenData = {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt: expiresAt,
                tokenType: tokenData.token_type || 'Bearer',
                scope: tokenData.scope || 'https://www.googleapis.com/auth/drive',
                source: 'simple_token',
                clientId: tokenData.client_id,
                clientSecret: tokenData.client_secret
            };

            // Store tokens
            await this.storeTokens(internalTokenData);
            this.tokens = internalTokenData;
            this.useSimpleToken = true;

            this.logger.info('Successfully imported SimpleToken data', {
                expiresAt: new Date(internalTokenData.expiresAt).toISOString(),
                scope: internalTokenData.scope,
                hasRefreshToken: !!internalTokenData.refreshToken
            });
            console.log('TokenManager: Successfully imported SimpleToken data');
            return true;
        } catch (error) {
            console.error('TokenManager: Failed to import SimpleToken data:', error.message);
            return false;
        }
    }

    /**
     * Get a valid access token, refreshing if necessary
     */
    async getValidAccessToken(): Promise<string> {
        this.logger.debug('Getting valid access token');

        // Load tokens from storage if not already loaded
        if (!this.tokens) {
            this.logger.debug('No tokens in memory, loading from storage');
            await this.loadTokens();
        }

        if (!this.tokens) {
            this.logger.error('No tokens available after loading from storage');
            throw new Error('No tokens available. Please authorize first.');
        }

        // Check if token is expired (with 5-minute buffer)
        const now = Date.now();
        const expiryBuffer = 5 * 60 * 1000; // 5 minutes
        const timeUntilExpiry = this.tokens.expiresAt - now;

        this.logger.debug('Token expiry check', {
            expiresAt: new Date(this.tokens.expiresAt).toISOString(),
            timeUntilExpiry: Math.floor(timeUntilExpiry / 1000) + ' seconds',
            needsRefresh: now >= (this.tokens.expiresAt - expiryBuffer)
        });

        if (now >= (this.tokens.expiresAt - expiryBuffer)) {
            // Token is expired or about to expire, refresh it
            this.logger.info('Token expired or expiring soon, refreshing');
            await this.refreshTokens();
        } else {
            this.logger.debug('Token is still valid');
        }

        return this.tokens.accessToken;
    }

    /**
     * Check if we have valid tokens
     */
    async hasValidToken(): Promise<boolean> {
        try {
            await this.getValidAccessToken();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Refresh the access token using the refresh token
     */
    private async refreshTokens(): Promise<void> {
        if (!this.tokens?.refreshToken) {
            throw new Error('No refresh token available. Please re-authorize.');
        }

        this.logger.info('Refreshing access token using stored refresh token');

        try {
            let tokenResponse;

            if (this.oauthManager) {
                // Use OAuth manager if available (manual OAuth flow)
                tokenResponse = await this.oauthManager.refreshAccessToken(this.tokens.refreshToken);
            } else {
                // Direct refresh using Google OAuth endpoint (SimpleToken flow)
                tokenResponse = await this.refreshTokenDirect(this.tokens.refreshToken);
            }

            // Update stored tokens
            this.tokens.accessToken = tokenResponse.access_token;
            this.tokens.expiresAt = Date.now() + (tokenResponse.expires_in * 1000);

            // Update refresh token if provided (Google doesn't always provide a new one)
            if (tokenResponse.refresh_token) {
                this.tokens.refreshToken = tokenResponse.refresh_token;
            }

            await this.storeTokens(this.tokens);
            this.logger.info('Access token refreshed successfully', {
                method: this.oauthManager ? 'oauth-manager' : 'direct-refresh',
                newExpiresAt: new Date(this.tokens.expiresAt).toISOString()
            });
        } catch (error) {
            this.logger.error('Token refresh failed', error as Error);
            // If refresh fails, clear tokens to force re-authorization
            await this.clearTokens();
            throw new Error(`Token refresh failed: ${error.message}`);
        }
    }

    /**
     * Direct token refresh using Google OAuth endpoint
     */
    private async refreshTokenDirect(refreshToken: string): Promise<any> {
        const params: Record<string, string> = {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        };

        // Include client_id if available in stored tokens (required for OAuth flows)
        if (this.tokens?.clientId) {
            params.client_id = this.tokens.clientId;
        }

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(params)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Store tokens securely in plugin data
     */
    private async storeTokens(tokens: TokenData): Promise<void> {
        try {
            const pluginData = await this.plugin.loadData() || {};
            pluginData[TOKEN_STORAGE_KEY] = tokens;
            await this.plugin.saveData(pluginData);
        } catch (error) {
            throw new Error(`Failed to store tokens: ${error.message}`);
        }
    }

    /**
     * Load tokens from plugin data
     */
    private async loadTokens(): Promise<void> {
        try {
            const pluginData = await this.plugin.loadData() || {};
            this.tokens = pluginData[TOKEN_STORAGE_KEY] || null;

            // Restore the useSimpleToken flag from stored source
            if (this.tokens && this.tokens.source === 'simple_token') {
                this.useSimpleToken = true;
            } else {
                this.useSimpleToken = false;
            }

            this.logger.debug('Loaded tokens from storage', {
                hasTokens: !!this.tokens,
                tokenKeys: this.tokens ? Object.keys(this.tokens) : [],
                hasAccessToken: !!(this.tokens?.accessToken),
                expiresAt: this.tokens?.expiresAt ? new Date(this.tokens.expiresAt).toISOString() : 'none',
                source: this.tokens?.source || 'unknown',
                useSimpleToken: this.useSimpleToken
            });
        } catch (error) {
            this.logger.error('Failed to load tokens from storage', error as Error);
            console.error('Failed to load tokens:', error);
            this.tokens = null;
            this.useSimpleToken = false;
        }
    }

    /**
     * Clear stored tokens
     */
    async clearTokens(): Promise<void> {
        try {
            const pluginData = await this.plugin.loadData() || {};
            delete pluginData[TOKEN_STORAGE_KEY];
            await this.plugin.saveData(pluginData);
            this.tokens = null;
            this.useSimpleToken = false;
            console.log('Tokens cleared');
        } catch (error) {
            console.error('Failed to clear tokens:', error);
        }
    }

    /**
     * Get current token status for UI display
     */
    async getTokenStatus(): Promise<{
        connected: boolean;
        expiresAt?: number;
        source: 'manual' | 'simple_token' | 'none';
    }> {
        // Load tokens from storage if not already loaded
        if (!this.tokens) {
            await this.loadTokens();
        }

        if (!this.tokens) {
            return {
                connected: false,
                source: 'none'
            };
        }

        return {
            connected: true,
            expiresAt: this.tokens.expiresAt,
            source: this.useSimpleToken ? 'simple_token' : 'manual'
        };
    }

    /**
     * Check if currently using SimpleToken integration
     */
    isUsingSimpleToken(): boolean {
        return this.useSimpleToken;
    }

    /**
     * Revoke tokens and disconnect
     */
    async disconnect(): Promise<void> {
        await this.clearTokens();
        // Note: useSimpleToken flag is already reset in clearTokens()
        // Note: Could also call Google's revoke endpoint here if needed
        console.log('Disconnected from Google Drive');
    }
}