# DriveLink - Obsidian Plugin

A private Obsidian plugin for manual synchronization between your Vault and a Google Drive folder. Keep your notes backed up and accessible across devices with secure, OAuth-based authentication.

## Features

- **🔐 Secure Authentication**: OAuth 2.0 PKCE flow with Google Drive API
- **📁 Manual Sync**: Upload and download files on-demand
- **⚡ Smart Change Detection**: Only sync files that have changed
- **🔄 Conflict Resolution**: Automatic backup creation for conflicting files
- **📱 Cross-Platform**: Works on Obsidian Desktop and Mobile (iOS/Android)
- **🚫 Ignore Patterns**: Customizable file filtering
- **🎯 No Backend Required**: All processing happens locally in Obsidian

## Installation

This is a private plugin not available in the Community Plugins catalog. Install manually:

### Prerequisites

1. **Google Cloud Setup**:
   - Create a [Google Cloud Project](https://console.cloud.google.com/)
   - Enable the Google Drive API
   - Create OAuth 2.0 credentials (Web application or Desktop app)
   - Add `https://drivelink.deneblab.com/callback/drive/` as an authorized redirect URI (or host `callback/drive/index.html` yourself)
   - Copy the generated Client ID (and Client Secret if provided)

2. **Optional: SimpleToken CLI**:
   - If you prefer to provision tokens outside of Obsidian, run the SimpleToken CLI once during setup
   - Provide the same Google OAuth client details noted above when prompted
   - Copy the generated JSON output for import into DriveLink

### Plugin Installation

1. **Download/Clone** this repository
2. **Build** the plugin:
   ```bash
   npm install
   npm run build
   ```
3. **Copy** the plugin files to your vault:
   - Copy `manifest.json`, `main.js`, and `styles.css` to:
   - `YourVault/.obsidian/plugins/drivelink/`
4. **Enable** the plugin in Obsidian Settings → Community Plugins

## Configuration

### 1. Authenticate with Google Drive

You can connect DriveLink in two ways:

#### Option A: Built-in OAuth onboarding (recommended)

1. Open **Settings → DriveLink → Authentication** inside Obsidian.
2. Paste your Google OAuth **Client ID** (and optional **Client Secret** if one was issued).
3. Ensure the **Redirect URI** is set to the hosted callback `https://drivelink.deneblab.com/callback/drive/` (or your own deployment of `callback/drive/index.html`).
4. Click **Connect to Google Drive**. A browser window will open with Google consent.
5. Approve access, then return to Obsidian. DriveLink will process the callback automatically and show a connected status.

#### Option B: SimpleToken import

1. Run the SimpleToken CLI outside of Obsidian and follow its prompts to authorize Google Drive access.
2. After the browser flow completes, SimpleToken prints a JSON object containing your access and refresh tokens.
3. Copy the entire JSON object, including braces and quotes, then paste it into the **SimpleToken import** box in DriveLink settings.

### 2. Drive Folder Setup

1. Click **"Set up Drive folder"** in settings
2. The plugin will create an "ObsidianVault" folder in your Google Drive
3. All synced files will be stored in this folder

### 3. Sync Configuration

Configure sync behavior:
- **Sync on startup**: Automatically sync when Obsidian starts
- **Auto-sync on file changes**: Sync files when they're modified (experimental)
- **Conflict resolution**: How to handle conflicting changes
- **Ignore patterns**: File patterns to exclude from sync

## Usage

### Manual Sync

Use the Command Palette (`Ctrl/Cmd + P`) and run:
- **"DriveLink: Connect to Google Drive"** - Launch the in-app OAuth consent flow
- **"DriveLink: Sync now"** - Perform complete synchronization
- **"DriveLink: Set up Drive folder"** - Configure or change sync folder

### File Sync Process

1. **Upload**: New and modified local files → Google Drive
2. **Download**: New and modified Drive files → Local vault
3. **Conflicts**: When the same file is modified in both locations:
   - **Last writer wins**: Keep the most recently modified version
   - **Backup creation**: Save the older version as `filename (conflict YYYY-MM-DD).ext`

### Ignore Patterns

Default ignored files:
- `.obsidian/**` - Obsidian configuration
- `.trash/**` - Obsidian trash
- `*.tmp`, `*.lock` - Temporary files
- `.git/**` - Git repository files

Add custom patterns in settings using glob syntax:
- `private/**` - Ignore entire folder
- `*.pdf` - Ignore all PDF files
- `daily/2023/**` - Ignore specific date ranges

## File Support

Supported file types for sync:
- **Markdown**: `.md` files
- **Text**: `.txt` files
- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`
- **Documents**: `.pdf`, `.json`

## Security & Privacy

- **Local Storage**: OAuth tokens stored securely in Obsidian's plugin data
- **No Backend**: All operations happen directly between Obsidian and Google Drive
- **Minimal Permissions**: Only requests access to files it creates
- **Your Data**: Files remain in your Google Drive under your control

## Troubleshooting

### Common Issues

**"Connection failed"**
- For built-in OAuth: verify your Client ID/Secret, ensure the redirect URI matches `https://drivelink.deneblab.com/callback/drive/`, and confirm the Drive API is enabled for your project.
- For SimpleToken imports: make sure you pasted the full JSON output (including the refresh token) and re-run the CLI if the data has expired or been revoked.

**"Sync failed"**
- Check your internet connection
- Verify you have sufficient Google Drive storage
- Try disconnecting and reconnecting to Google Drive

**"Files not syncing"**
- Check ignore patterns in settings
- Verify files are supported types
- Look for error messages in the Obsidian console (`Ctrl/Cmd + Shift + I`)

### Debug Information

Enable debug logging:
1. Open Obsidian Developer Tools (`Ctrl/Cmd + Shift + I`)
2. Check the Console tab for DriveLink messages
3. Look for error details and authentication status

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Development build (with file watching)
npm run build:dev

# Production build with version management
npm run build:local

# Create release package
npm run release

# Original esbuild commands
npm run dev          # Development with watching
npm run build        # Production esbuild only
```

### Build System

The plugin includes a comprehensive build system:

- **Version Management**: Reads from `version.txt` for consistent versioning
- **Automated Builds**: Handles TypeScript compilation and asset copying
- **Release Packaging**: Creates distributable ZIP files with checksums
- **CI/CD Integration**: GitHub Actions for automated releases




## License

MIT License - see LICENSE file for details.

## Disclaimer

This plugin is not affiliated with Google or Obsidian. Use at your own risk. Always maintain separate backups of important data.

## Support

For issues and questions:
- Check the troubleshooting section above
- Search existing GitHub issues
- Create a new issue with detailed information   
---


**Made with ❤️ for the Obsidian community**