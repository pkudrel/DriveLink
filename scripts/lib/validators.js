/**
 * Validators Module for SimpleToken CLI Tool
 * Input validation utilities
 *
 * Provides validation functions for credentials, tokens, and user inputs
 */

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
 * Validate Google Cloud OAuth Client ID format
 * @param {string} clientId - Client ID to validate
 * @returns {object} Validation result
 */
function validateClientId(clientId) {
    const result = {
        isValid: false,
        error: null,
        suggestions: []
    };

    if (!clientId || typeof clientId !== 'string') {
        result.error = 'Client ID is required';
        result.suggestions = ['Provide a valid Google Cloud OAuth Client ID'];
        return result;
    }

    // Trim whitespace
    clientId = clientId.trim();

    // Check for empty string
    if (clientId.length === 0) {
        result.error = 'Client ID cannot be empty';
        result.suggestions = ['Copy Client ID from Google Cloud Console'];
        return result;
    }

    // Expected format: 123456789-abc...xyz.apps.googleusercontent.com
    const clientIdPattern = /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/;

    if (!clientIdPattern.test(clientId)) {
        result.error = 'Invalid Client ID format';
        result.suggestions = [
            'Expected format: 123456789-abc...xyz.apps.googleusercontent.com',
            'Copy from Google Cloud Console → APIs & Services → Credentials',
            'Make sure you created "Desktop application" type'
        ];
        return result;
    }

    // Additional checks
    if (clientId.length < 50) {
        result.error = 'Client ID appears too short';
        result.suggestions = ['Verify you copied the complete Client ID'];
        return result;
    }

    result.isValid = true;
    return result;
}

/**
 * Validate Google Cloud OAuth Client Secret format
 * @param {string} clientSecret - Client secret to validate
 * @returns {object} Validation result
 */
function validateClientSecret(clientSecret) {
    const result = {
        isValid: false,
        error: null,
        suggestions: []
    };

    if (!clientSecret || typeof clientSecret !== 'string') {
        result.error = 'Client Secret is required';
        result.suggestions = ['Provide a valid Google Cloud OAuth Client Secret'];
        return result;
    }

    // Trim whitespace
    clientSecret = clientSecret.trim();

    // Check for empty string
    if (clientSecret.length === 0) {
        result.error = 'Client Secret cannot be empty';
        result.suggestions = ['Copy Client Secret from Google Cloud Console'];
        return result;
    }

    // Basic length check - Google client secrets are typically 24+ characters
    if (clientSecret.length < 20) {
        result.error = 'Client Secret appears too short';
        result.suggestions = [
            'Expected: 20+ character alphanumeric string',
            'Verify you copied the complete Client Secret'
        ];
        return result;
    }

    // Check for placeholder text
    const placeholders = [
        'YOUR_CLIENT_SECRET',
        'CLIENT_SECRET_HERE',
        'REPLACE_THIS',
        'ENTER_SECRET'
    ];

    if (placeholders.some(placeholder => clientSecret.includes(placeholder))) {
        result.error = 'Client Secret appears to be placeholder text';
        result.suggestions = ['Replace with actual Client Secret from Google Cloud Console'];
        return result;
    }

    result.isValid = true;
    return result;
}

/**
 * Validate OAuth authorization code
 * @param {string} authCode - Authorization code to validate
 * @returns {object} Validation result
 */
function validateAuthorizationCode(authCode) {
    const result = {
        isValid: false,
        error: null,
        suggestions: []
    };

    if (!authCode || typeof authCode !== 'string') {
        result.error = 'Authorization code is required';
        result.suggestions = ['Complete OAuth flow to get authorization code'];
        return result;
    }

    // Trim whitespace
    authCode = authCode.trim();

    if (authCode.length === 0) {
        result.error = 'Authorization code cannot be empty';
        result.suggestions = ['Copy authorization code from OAuth callback URL'];
        return result;
    }

    // Google auth codes are typically 100+ characters
    if (authCode.length < 50) {
        result.error = 'Authorization code appears too short';
        result.suggestions = [
            'Copy the complete code from callback URL',
            'Make sure no characters were truncated'
        ];
        return result;
    }

    // Check for URL encoding issues
    if (authCode.includes('%') && authCode.length > 200) {
        result.error = 'Authorization code may be URL encoded';
        result.suggestions = ['Try decoding the URL-encoded authorization code'];
        return result;
    }

    result.isValid = true;
    return result;
}

/**
 * Validate access token format
 * @param {string} accessToken - Access token to validate
 * @returns {object} Validation result
 */
function validateAccessToken(accessToken) {
    const result = {
        isValid: false,
        error: null,
        suggestions: []
    };

    if (!accessToken || typeof accessToken !== 'string') {
        result.error = 'Access token is required';
        result.suggestions = ['Complete OAuth flow to get access token'];
        return result;
    }

    // Trim whitespace
    accessToken = accessToken.trim();

    if (accessToken.length === 0) {
        result.error = 'Access token cannot be empty';
        result.suggestions = ['Generate access token through OAuth flow'];
        return result;
    }

    // Google access tokens typically start with "ya29." and are 150+ chars
    if (!accessToken.startsWith('ya29.')) {
        result.error = 'Access token format appears invalid';
        result.suggestions = [
            'Google access tokens typically start with "ya29."',
            'Verify token was obtained from Google OAuth'
        ];
        return result;
    }

    if (accessToken.length < 100) {
        result.error = 'Access token appears too short';
        result.suggestions = ['Verify complete token was copied'];
        return result;
    }

    result.isValid = true;
    return result;
}

/**
 * Validate email address format
 * @param {string} email - Email to validate
 * @returns {object} Validation result
 */
function validateEmail(email) {
    const result = {
        isValid: false,
        error: null,
        suggestions: []
    };

    if (!email || typeof email !== 'string') {
        result.error = 'Email address is required';
        return result;
    }

    // Trim whitespace
    email = email.trim();

    if (email.length === 0) {
        result.error = 'Email address cannot be empty';
        return result;
    }

    // Basic email pattern
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
        result.error = 'Invalid email address format';
        result.suggestions = ['Enter a valid email address (user@domain.com)'];
        return result;
    }

    result.isValid = true;
    return result;
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {object} Validation result
 */
function validateUrl(url) {
    const result = {
        isValid: false,
        error: null,
        suggestions: []
    };

    if (!url || typeof url !== 'string') {
        result.error = 'URL is required';
        return result;
    }

    // Trim whitespace
    url = url.trim();

    if (url.length === 0) {
        result.error = 'URL cannot be empty';
        return result;
    }

    try {
        new URL(url);
        result.isValid = true;
    } catch (error) {
        result.error = 'Invalid URL format';
        result.suggestions = ['Enter a valid URL (https://example.com)'];
    }

    return result;
}

/**
 * Validate Google Drive folder ID
 * @param {string} folderId - Folder ID to validate
 * @returns {object} Validation result
 */
function validateDriveFolderId(folderId) {
    const result = {
        isValid: false,
        error: null,
        suggestions: []
    };

    if (!folderId || typeof folderId !== 'string') {
        result.error = 'Drive folder ID is required';
        result.suggestions = ['Get folder ID from Google Drive URL'];
        return result;
    }

    // Trim whitespace
    folderId = folderId.trim();

    if (folderId.length === 0) {
        result.error = 'Drive folder ID cannot be empty';
        result.suggestions = ['Copy folder ID from Google Drive URL'];
        return result;
    }

    // Google Drive folder IDs are typically 28+ alphanumeric characters
    const folderIdPattern = /^[a-zA-Z0-9_-]{25,}$/;

    if (!folderIdPattern.test(folderId)) {
        result.error = 'Invalid Drive folder ID format';
        result.suggestions = [
            'Expected: 25+ alphanumeric characters with dashes/underscores',
            'Copy from Google Drive folder URL: /folders/FOLDER_ID_HERE',
            'Remove any extra characters or spaces'
        ];
        return result;
    }

    result.isValid = true;
    return result;
}

/**
 * Comprehensive validation of all OAuth credentials
 * @param {object} credentials - Credentials object to validate
 * @returns {object} Validation result with details for each field
 */
function validateCredentials(credentials) {
    const result = {
        isValid: true,
        errors: [],
        warnings: [],
        details: {}
    };

    if (!credentials || typeof credentials !== 'object') {
        result.isValid = false;
        result.errors.push('Credentials object is required');
        return result;
    }

    // Validate Client ID
    const clientIdResult = validateClientId(credentials.clientId);
    result.details.clientId = clientIdResult;
    if (!clientIdResult.isValid) {
        result.isValid = false;
        result.errors.push(`Client ID: ${clientIdResult.error}`);
    }

    // Validate Client Secret
    const clientSecretResult = validateClientSecret(credentials.clientSecret);
    result.details.clientSecret = clientSecretResult;
    if (!clientSecretResult.isValid) {
        result.isValid = false;
        result.errors.push(`Client Secret: ${clientSecretResult.error}`);
    }

    return result;
}

/**
 * Display validation results with colored output
 * @param {object} validationResult - Result from validation function
 * @param {string} fieldName - Name of the field being validated
 */
function displayValidationResult(validationResult, fieldName = 'Field') {
    if (validationResult.isValid) {
        log(`✅ ${fieldName} validation passed`, colors.green);
    } else {
        log(`❌ ${fieldName} validation failed: ${validationResult.error}`, colors.red);

        if (validationResult.suggestions && validationResult.suggestions.length > 0) {
            log(`   Suggestions:`, colors.cyan);
            validationResult.suggestions.forEach(suggestion => {
                log(`   • ${suggestion}`, colors.cyan);
            });
        }
    }
}

module.exports = {
    validateClientId,
    validateClientSecret,
    validateAuthorizationCode,
    validateAccessToken,
    validateEmail,
    validateUrl,
    validateDriveFolderId,
    validateCredentials,
    displayValidationResult
};