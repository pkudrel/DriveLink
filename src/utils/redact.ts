/**
 * Removes secrets from text that may be copied out of the plugin (logs, diagnostics).
 * File names and paths are kept; they are needed to make sense of a log.
 */

const SECRET_JSON_KEYS = 'access_?token|refresh_?token|client_?secret|authorization|id_?token';

const RULES: Array<[RegExp, string]> = [
    // "accessToken": "..." and access_token=... in JSON, query strings and form bodies
    [new RegExp(`("(?:${SECRET_JSON_KEYS})"\\s*:\\s*")[^"]*(")`, 'gi'), '$1***$2'],
    [new RegExp(`\\b((?:${SECRET_JSON_KEYS})=)[^&\\s"']+`, 'gi'), '$1***'],
    // Authorization header values
    [/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer ***'],
    // Google access tokens, refresh tokens and OAuth client secrets
    [/\bya29\.[A-Za-z0-9._-]+/g, '***'],
    [/\b1\/\/[A-Za-z0-9._-]+/g, '***'],
    [/\bGOCSPX-[A-Za-z0-9_-]+/g, '***']
];

/**
 * Mask an email address to its first character and domain: john@gmail.com -> j***@gmail.com
 */
export function maskEmail(email: string): string {
    return email.replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2');
}

/**
 * Replace tokens, secrets and email addresses in text
 */
export function redact(text: string): string {
    let result = text;
    for (const [pattern, replacement] of RULES) {
        result = result.replace(pattern, replacement);
    }
    return maskEmail(result);
}
