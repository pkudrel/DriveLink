import { generateCodeVerifier, generateCodeChallenge, generateState } from '../utils/crypto';

/**
 * OAuth 2.0 configuration for Google Drive API
 */
interface OAuthConfig {
    clientId: string;
    redirectUri: string;
    scope: string;
}

/**
 * OAuth 2.0 token response
 */
interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
}

/**
 * PKCE OAuth 2.0 flow implementation for Google Drive
 */
export class OAuthManager {
    private config: OAuthConfig;
    private codeVerifier: string | null = null;
    private state: string | null = null;

    constructor(clientId: string, redirectUri: string) {
        this.config = {
            clientId,
            redirectUri,
            scope: 'https://www.googleapis.com/auth/drive.file'
        };
    }

    /**
     * Generate authorization URL for PKCE OAuth flow
     */
    async generateAuthUrl(): Promise<string> {
        // Generate PKCE parameters
        this.codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(this.codeVerifier);
        this.state = generateState();

        // Build authorization URL
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            response_type: 'code',
            scope: this.config.scope,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state: this.state,
            access_type: 'offline',
            prompt: 'consent'
        });

        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    /**
     * Exchange authorization code for tokens
     */
    async exchangeCodeForTokens(code: string, receivedState: string): Promise<TokenResponse> {
        // Validate state parameter
        if (!this.state || receivedState !== this.state) {
            throw new Error('Invalid state parameter - possible CSRF attack');
        }

        if (!this.codeVerifier) {
            throw new Error('No code verifier available - authorization flow not initiated');
        }

        // Prepare token request
        const tokenEndpoint = 'https://oauth2.googleapis.com/token';
        const body = new URLSearchParams({
            client_id: this.config.clientId,
            code,
            code_verifier: this.codeVerifier,
            grant_type: 'authorization_code',
            redirect_uri: this.config.redirectUri
        });

        // Exchange code for tokens
        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: body.toString()
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Token exchange failed: ${response.status} ${errorData}`);
        }

        const tokens: TokenResponse = await response.json();

        // Clear PKCE parameters after successful exchange
        this.codeVerifier = null;
        this.state = null;

        return tokens;
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
        const tokenEndpoint = 'https://oauth2.googleapis.com/token';
        const body = new URLSearchParams({
            client_id: this.config.clientId,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        });

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: body.toString()
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Token refresh failed: ${response.status} ${errorData}`);
        }

        return await response.json();
    }

    /**
     * Open external browser for authorization
     */
    async startAuthFlow(): Promise<string> {
        const authUrl = await this.generateAuthUrl();

        // Open the authorization URL in the default browser
        if (typeof window !== 'undefined' && window.open) {
            window.open(authUrl, '_blank');
        }

        return authUrl;
    }

    /**
     * Parse callback URL to extract code and state
     */
    parseCallbackUrl(callbackUrl: string): { code: string; state: string } {
        try {
            const url = new URL(callbackUrl);
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const error = url.searchParams.get('error');

            if (error) {
                throw new Error(`OAuth error: ${error} - ${url.searchParams.get('error_description')}`);
            }

            if (!code || !state) {
                throw new Error('Missing code or state parameter in callback URL');
            }

            return { code, state };
        } catch (error) {
            throw new Error(`Failed to parse callback URL: ${error.message}`);
        }
    }
}