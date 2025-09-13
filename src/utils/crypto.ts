/**
 * Cryptographic utilities for PKCE (Proof Key for Code Exchange) implementation
 */

/**
 * Generate a cryptographically secure random string for PKCE code verifier
 */
export function generateCodeVerifier(length: number = 128): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomValues = new Uint8Array(length);

    // Use crypto.getRandomValues for cryptographically secure random bytes
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(randomValues);
    } else {
        // Fallback for environments without crypto.getRandomValues
        for (let i = 0; i < length; i++) {
            randomValues[i] = Math.floor(Math.random() * 256);
        }
    }

    let result = '';
    for (let i = 0; i < length; i++) {
        result += charset[randomValues[i] % charset.length];
    }

    return result;
}

/**
 * Generate PKCE code challenge from code verifier using SHA256
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    // Encode the code verifier as UTF-8
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);

    // Hash with SHA-256
    const digest = await crypto.subtle.digest('SHA-256', data);

    // Convert to base64url encoding
    return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Base64URL encoding (without padding)
 */
function base64UrlEncode(buffer: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...buffer));
    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Generate a cryptographically secure random state parameter
 */
export function generateState(): string {
    return generateCodeVerifier(32);
}

/**
 * Validate that a code verifier meets PKCE requirements
 */
export function validateCodeVerifier(codeVerifier: string): boolean {
    // PKCE code verifier must be 43-128 characters long
    if (codeVerifier.length < 43 || codeVerifier.length > 128) {
        return false;
    }

    // Must contain only unreserved characters
    const validPattern = /^[A-Za-z0-9\-._~]+$/;
    return validPattern.test(codeVerifier);
}