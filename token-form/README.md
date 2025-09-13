# DriveLink Token Generator

A static web page for generating Google Drive API tokens for the DriveLink Obsidian plugin.

## Overview

This token generator provides a user-friendly interface for users to obtain Google Drive API access tokens without having to navigate the complex Google Cloud Console setup manually.

## Features

- **Step-by-step setup**: Guides users through the Google Drive API configuration process
- **Secure token generation**: Uses Google's OAuth 2.0 flow for secure token acquisition
- **Responsive design**: Works on desktop and mobile devices
- **Copy-to-clipboard**: Easy token copying for plugin configuration
- **Local storage persistence**: Remembers user credentials across sessions
- **Bootstrap styling**: Clean, professional interface matching Google's design guidelines

## Files

- `index.html` - Main token generator page with three-step process
- `styles.css` - Custom styling with modern design elements
- `script.js` - JavaScript functionality for OAuth flow and form handling
- `README.md` - This documentation file

## Usage

1. **Deploy the page**: The GitHub Action automatically deploys this page to GitHub Pages
2. **Share with users**: Provide the GitHub Pages URL to plugin users
3. **User workflow**:
   - User enters Google Drive API credentials (Client ID, Client Secret)
   - User authorizes the application via Google OAuth
   - User receives access and refresh tokens
   - User copies tokens to DriveLink plugin settings

## Development

### Local Testing

To test the token generator locally:

1. Set up a local HTTP server (required for OAuth redirects):
   ```bash
   # Using Python
   python -m http.server 8080

   # Using Node.js http-server
   npx http-server -p 8080

   # Using PHP
   php -S localhost:8080
   ```

2. Configure OAuth redirect URI in Google Cloud Console:
   - Add `http://localhost:8080/callback` to authorized redirect URIs

3. Open `http://localhost:8080` in your browser

### Google Cloud Console Setup

Users need to complete these steps in Google Cloud Console:

1. Create a new project or select existing project
2. Enable Google Drive API
3. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized origins: Add your GitHub Pages domain
   - Authorized redirect URIs: Add your GitHub Pages domain + `/callback`

### Security Considerations

- **Client credentials**: Users enter their own Google API credentials
- **No server-side storage**: All credentials are stored in browser localStorage only
- **HTTPS required**: GitHub Pages provides HTTPS by default
- **Scope limitation**: Only requests Google Drive access scope

## Deployment

The token page is automatically deployed via GitHub Actions when changes are pushed to the `production` branch. The workflow:

1. Validates all required files exist
2. Builds the static site with version information
3. Deploys to GitHub Pages
4. Provides deployment URL

## Integration with DriveLink Plugin

The generated tokens are used in the DriveLink Obsidian plugin:

1. **Access Token**: Used for API requests to Google Drive
2. **Refresh Token**: Used to obtain new access tokens when expired
3. **Configuration**: Users paste tokens into plugin settings

## Browser Compatibility

- **Modern browsers**: Chrome 80+, Firefox 75+, Safari 13+, Edge 80+
- **Mobile support**: iOS Safari, Android Chrome
- **Required features**: ES6+ JavaScript, Fetch API, Clipboard API

## Troubleshooting

Common issues and solutions:

### "Invalid Client ID format"
- Ensure Client ID ends with `.googleusercontent.com`
- Copy the complete Client ID from Google Cloud Console

### "Invalid Client Secret format"
- Client Secret should start with `GOCSPX-`
- Regenerate credentials if format is different

### "Redirect URI mismatch"
- Add the exact callback URL to Google Cloud Console
- Ensure protocol (http/https) matches exactly

### "Authorization failed"
- Check that Google Drive API is enabled in your project
- Verify OAuth consent screen is configured
- Ensure all required scopes are requested

## Support

For issues with the token generator:
1. Check browser console for JavaScript errors
2. Verify Google Cloud Console configuration
3. Test with different browsers
4. Report issues on the DriveLink GitHub repository<!-- Updated Sat, Sep 13, 2025 10:20:19 PM -->
