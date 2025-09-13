// DriveLink Token Generator - JavaScript functionality

class TokenGenerator {
    constructor() {
        this.clientId = '';
        this.clientSecret = '';
        this.redirectUri = 'http://localhost:8080/callback';
        this.scopes = 'https://www.googleapis.com/auth/drive';

        this.init();
    }

    init() {
        this.bindEvents();
        this.checkUrlParams();
    }

    bindEvents() {
        // Step 1: Credentials form
        const credentialsForm = document.getElementById('credentialsForm');
        if (credentialsForm) {
            credentialsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleCredentialsSubmit();
            });
        }

        // Step 2: Authorization button
        const authorizeBtn = document.getElementById('authorizeBtn');
        if (authorizeBtn) {
            authorizeBtn.addEventListener('click', () => {
                this.handleAuthorization();
            });
        }

        // Step 3: Copy buttons
        const copyTokenBtn = document.getElementById('copyTokenBtn');
        if (copyTokenBtn) {
            copyTokenBtn.addEventListener('click', () => {
                this.copyToClipboard('accessToken');
            });
        }

        const copyRefreshBtn = document.getElementById('copyRefreshBtn');
        if (copyRefreshBtn) {
            copyRefreshBtn.addEventListener('click', () => {
                this.copyToClipboard('refreshToken');
            });
        }

        // Reset button
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.reset();
            });
        }
    }

    handleCredentialsSubmit() {
        const clientId = document.getElementById('clientId').value.trim();
        const clientSecret = document.getElementById('clientSecret').value.trim();
        const redirectUri = document.getElementById('redirectUri').value.trim();

        if (!clientId || !clientSecret) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }

        // Basic validation
        if (!clientId.includes('googleusercontent.com')) {
            this.showToast('Invalid Client ID format', 'error');
            return;
        }

        if (!clientSecret.startsWith('GOCSPX-')) {
            this.showToast('Invalid Client Secret format', 'error');
            return;
        }

        // Store credentials
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;

        // Save to localStorage for persistence
        localStorage.setItem('drivelink_client_id', clientId);
        localStorage.setItem('drivelink_client_secret', clientSecret);
        localStorage.setItem('drivelink_redirect_uri', redirectUri);

        this.showToast('Credentials saved successfully', 'success');
        this.goToStep(2);
    }

    handleAuthorization() {
        if (!this.clientId) {
            this.showToast('Please configure credentials first', 'error');
            this.goToStep(1);
            return;
        }

        const authUrl = this.buildAuthUrl();

        // Show loading state
        const btn = document.getElementById('authorizeBtn');
        btn.classList.add('loading');
        btn.disabled = true;

        this.showToast('Redirecting to Google authorization...', 'success');

        // Small delay to show the loading state
        setTimeout(() => {
            window.location.href = authUrl;
        }, 1000);
    }

    buildAuthUrl() {
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: this.scopes,
            response_type: 'code',
            access_type: 'offline',
            prompt: 'consent'
        });

        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    async exchangeCodeForTokens(code) {
        const tokenEndpoint = 'https://oauth2.googleapis.com/token';

        const params = new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: this.redirectUri
        });

        try {
            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString()
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error_description || 'Token exchange failed');
            }

            const tokens = await response.json();
            this.displayTokens(tokens.access_token, tokens.refresh_token);

        } catch (error) {
            console.error('Token exchange error:', error);
            this.showToast(`Authorization failed: ${error.message}`, 'error');
            this.goToStep(2);
        }
    }

    displayTokens(accessToken, refreshToken) {
        document.getElementById('accessToken').value = accessToken;
        document.getElementById('refreshToken').value = refreshToken || 'Not provided';

        // Store tokens for reference
        localStorage.setItem('drivelink_access_token', accessToken);
        if (refreshToken) {
            localStorage.setItem('drivelink_refresh_token', refreshToken);
        }

        this.goToStep(3);
        this.showToast('Tokens generated successfully!', 'success');
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
            this.showToast(`Authorization error: ${error}`, 'error');
            this.goToStep(2);
            return;
        }

        if (code) {
            // Load stored credentials
            this.loadStoredCredentials();

            if (!this.clientId || !this.clientSecret) {
                this.showToast('Missing credentials. Please reconfigure.', 'error');
                this.goToStep(1);
                return;
            }

            // Exchange code for tokens
            this.exchangeCodeForTokens(code);
        } else {
            // Load stored credentials and show appropriate step
            this.loadStoredCredentials();

            if (this.clientId && this.clientSecret) {
                // Check if we have tokens
                const storedAccessToken = localStorage.getItem('drivelink_access_token');
                if (storedAccessToken) {
                    const storedRefreshToken = localStorage.getItem('drivelink_refresh_token');
                    this.displayTokens(storedAccessToken, storedRefreshToken);
                } else {
                    this.goToStep(2);
                }
            } else {
                this.goToStep(1);
            }
        }
    }

    loadStoredCredentials() {
        this.clientId = localStorage.getItem('drivelink_client_id') || '';
        this.clientSecret = localStorage.getItem('drivelink_client_secret') || '';
        this.redirectUri = localStorage.getItem('drivelink_redirect_uri') || this.redirectUri;

        // Populate form fields if they exist
        const clientIdField = document.getElementById('clientId');
        const clientSecretField = document.getElementById('clientSecret');
        const redirectUriField = document.getElementById('redirectUri');

        if (clientIdField && this.clientId) {
            clientIdField.value = this.clientId;
        }
        if (clientSecretField && this.clientSecret) {
            clientSecretField.value = this.clientSecret;
        }
        if (redirectUriField && this.redirectUri) {
            redirectUriField.value = this.redirectUri;
        }
    }

    goToStep(stepNumber) {
        // Hide all steps
        const steps = document.querySelectorAll('.step');
        steps.forEach(step => {
            step.classList.remove('active');
        });

        // Show target step
        const targetStep = document.getElementById(`step${stepNumber}`);
        if (targetStep) {
            targetStep.classList.add('active');
        }

        // Clear URL parameters on step navigation
        if (stepNumber !== 3) {
            const url = new URL(window.location);
            url.search = '';
            window.history.replaceState({}, '', url);
        }
    }

    async copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        const text = element.value;

        if (!text) {
            this.showToast('Nothing to copy', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            this.showToast(`${elementId === 'accessToken' ? 'Access token' : 'Refresh token'} copied to clipboard!`, 'success');

            // Visual feedback
            const button = elementId === 'accessToken' ?
                document.getElementById('copyTokenBtn') :
                document.getElementById('copyRefreshBtn');

            const originalText = button.innerHTML;
            button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copied!';
            button.classList.add('btn-success');
            button.classList.remove('btn-outline-primary');

            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('btn-success');
                button.classList.add('btn-outline-primary');
            }, 2000);

        } catch (error) {
            console.error('Copy failed:', error);
            this.showToast('Failed to copy to clipboard', 'error');

            // Fallback: select text
            element.select();
            element.setSelectionRange(0, 99999);
        }
    }

    reset() {
        // Clear localStorage
        localStorage.removeItem('drivelink_client_id');
        localStorage.removeItem('drivelink_client_secret');
        localStorage.removeItem('drivelink_redirect_uri');
        localStorage.removeItem('drivelink_access_token');
        localStorage.removeItem('drivelink_refresh_token');

        // Reset form
        const form = document.getElementById('credentialsForm');
        if (form) {
            form.reset();
        }

        // Clear token fields
        const accessTokenField = document.getElementById('accessToken');
        const refreshTokenField = document.getElementById('refreshToken');
        if (accessTokenField) accessTokenField.value = '';
        if (refreshTokenField) refreshTokenField.value = '';

        // Reset properties
        this.clientId = '';
        this.clientSecret = '';
        this.redirectUri = 'http://localhost:8080/callback';

        // Go to step 1
        this.goToStep(1);

        // Clear URL
        const url = new URL(window.location);
        url.search = '';
        window.history.replaceState({}, '', url);

        this.showToast('Configuration reset successfully', 'success');
    }

    showToast(message, type = 'success') {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => toast.remove());

        // Create toast container if it doesn't exist
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-body d-flex align-items-center">
                <svg class="me-2" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    ${type === 'success' ?
                        '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' :
                        '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>'}
                </svg>
                <span>${message}</span>
            </div>
        `;

        container.appendChild(toast);

        // Show toast with animation
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 100);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 5000);
    }
}

// Initialize the token generator when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.tokenGenerator = new TokenGenerator();
});

// Add some global styles for toasts
const toastStyles = `
    .toast {
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        margin-bottom: 10px;
        min-width: 300px;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .toast-body {
        color: white;
        font-weight: 500;
    }
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = toastStyles;
document.head.appendChild(styleSheet);