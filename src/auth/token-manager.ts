import { Plugin } from 'obsidian';
import { OAuthManager } from './oauth';

/**
 * Stored token data
 */
interface TokenData {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    tokenType: string;
    scope: string;
}

/**
 * Token storage keys
 */
const TOKEN_STORAGE_KEY = 'drivelink-tokens';

/**
 * Manages OAuth tokens for Google Drive API access
 */
export class TokenManager {
    private plugin: Plugin;
    private oauthManager: OAuthManager | null = null;
    private tokens: TokenData | null = null;

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
                scope: tokenResponse.scope
            };

            await this.storeTokens(tokenData);
            this.tokens = tokenData;

            console.log('OAuth tokens received and stored successfully');
        } catch (error) {
            throw new Error(`Callback handling failed: ${error.message}`);
        }
    }

    /**
     * Get a valid access token, refreshing if necessary
     */
    async getValidAccessToken(): Promise<string> {
        // Load tokens if not already loaded
        if (!this.tokens) {
            await this.loadTokens();
        }

        if (!this.tokens) {
            throw new Error('No tokens available. Please authorize first.');
        }

        // Check if token is expired (with 5-minute buffer)
        const now = Date.now();
        const expiryBuffer = 5 * 60 * 1000; // 5 minutes

        if (now >= (this.tokens.expiresAt - expiryBuffer)) {
            // Token is expired or about to expire, refresh it
            await this.refreshTokens();
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

        if (!this.oauthManager) {
            throw new Error('OAuth manager not initialized');
        }

        try {
            const tokenResponse = await this.oauthManager.refreshAccessToken(this.tokens.refreshToken);

            // Update stored tokens
            this.tokens.accessToken = tokenResponse.access_token;
            this.tokens.expiresAt = Date.now() + (tokenResponse.expires_in * 1000);

            // Update refresh token if provided (Google doesn't always provide a new one)
            if (tokenResponse.refresh_token) {
                this.tokens.refreshToken = tokenResponse.refresh_token;
            }

            await this.storeTokens(this.tokens);
            console.log('Access token refreshed successfully');
        } catch (error) {
            // If refresh fails, clear tokens to force re-authorization
            await this.clearTokens();
            throw new Error(`Token refresh failed: ${error.message}`);
        }
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
        } catch (error) {
            console.error('Failed to load tokens:', error);
            this.tokens = null;
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
            console.log('Tokens cleared');
        } catch (error) {
            console.error('Failed to clear tokens:', error);
        }
    }

    /**
     * Get current token status for UI display
     */
    async getTokenStatus(): Promise<{ connected: boolean; expiresAt?: number }> {
        await this.loadTokens();

        if (!this.tokens) {
            return { connected: false };
        }

        return {
            connected: true,
            expiresAt: this.tokens.expiresAt
        };
    }

    /**
     * Revoke tokens and disconnect
     */
    async disconnect(): Promise<void> {
        await this.clearTokens();
        // Note: Could also call Google's revoke endpoint here if needed
        console.log('Disconnected from Google Drive');
    }
}