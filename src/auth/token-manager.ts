import { Plugin } from 'obsidian';
import { OAuthManager } from './oauth';
import { SimpleTokenBridge } from './simple-token-bridge';

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
 * Supports both manual OAuth flow and SimpleToken CLI integration
 */
export class TokenManager {
    private plugin: Plugin;
    private oauthManager: OAuthManager | null = null;
    private tokens: TokenData | null = null;
    private useSimpleToken: boolean = false;

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
     * Initialize with SimpleToken CLI integration (auto-detect tokens)
     */
    async initializeWithSimpleToken(): Promise<boolean> {
        try {
            // Try to load tokens from SimpleToken CLI storage
            const simpleTokenData = await SimpleTokenBridge.getTokenDataFromSimpleToken();
            if (simpleTokenData) {
                this.tokens = simpleTokenData;
                this.useSimpleToken = true;

                // Store in plugin data as fallback
                await this.storeTokens(simpleTokenData);

                console.log('TokenManager: Initialized with SimpleToken CLI tokens');
                return true;
            }

            return false;
        } catch (error) {
            console.warn('TokenManager: Failed to initialize with SimpleToken:', error.message);
            return false;
        }
    }

    /**
     * Import tokens from SimpleToken CLI output (copy-paste scenario)
     */
    async importSimpleTokenData(tokenString: string): Promise<boolean> {
        try {
            const tokenData = JSON.parse(tokenString);

            // Validate token structure
            if (!tokenData.access_token) {
                throw new Error('Invalid token data: missing access_token');
            }

            // Convert to internal format
            const internalTokenData: TokenData = {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt: tokenData.expires_in ?
                    Date.now() + (tokenData.expires_in * 1000) :
                    Date.now() + (60 * 60 * 1000), // Default 1 hour
                tokenType: tokenData.token_type || 'Bearer',
                scope: tokenData.scope || 'https://www.googleapis.com/auth/drive'
            };

            // Store tokens
            await this.storeTokens(internalTokenData);
            this.tokens = internalTokenData;
            this.useSimpleToken = true;

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
        // First try to load tokens from SimpleToken CLI if not already loaded
        if (!this.tokens) {
            const simpleTokenInitialized = await this.initializeWithSimpleToken();
            if (!simpleTokenInitialized) {
                await this.loadTokens();
            }
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
    async getTokenStatus(): Promise<{
        connected: boolean;
        expiresAt?: number;
        source: 'manual' | 'simple_token' | 'none';
        simpleTokenAvailable: boolean;
    }> {
        // Check SimpleToken availability
        const simpleTokenStatus = await SimpleTokenBridge.getIntegrationStatus();

        // Try SimpleToken first, then fallback to stored tokens
        if (!this.tokens) {
            const simpleTokenInitialized = await this.initializeWithSimpleToken();
            if (!simpleTokenInitialized) {
                await this.loadTokens();
            }
        }

        if (!this.tokens) {
            return {
                connected: false,
                source: 'none',
                simpleTokenAvailable: simpleTokenStatus.available
            };
        }

        return {
            connected: true,
            expiresAt: this.tokens.expiresAt,
            source: this.useSimpleToken ? 'simple_token' : 'manual',
            simpleTokenAvailable: simpleTokenStatus.available
        };
    }

    /**
     * Get SimpleToken integration status for UI display
     */
    async getSimpleTokenStatus(): Promise<{
        available: boolean;
        hasCredentials: boolean;
        hasTokens: boolean;
        tokensValid: boolean;
        storageLocation: string;
    }> {
        return await SimpleTokenBridge.getIntegrationStatus();
    }

    /**
     * Switch to manual OAuth mode (disable SimpleToken)
     */
    switchToManualMode(): void {
        this.useSimpleToken = false;
        console.log('TokenManager: Switched to manual OAuth mode');
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
        this.useSimpleToken = false;
        // Note: Could also call Google's revoke endpoint here if needed
        console.log('Disconnected from Google Drive');
    }
}