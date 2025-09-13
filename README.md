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
   - Create OAuth 2.0 credentials (Web application type)
   - Note your Client ID

2. **Callback Page Hosting**:
   - Deploy the `callback/drive/index.html` file to a static hosting service
   - GitHub Pages, Cloudflare Pages, or similar
   - Note the callback URL (e.g., `https://yourdomain.github.io/callback/drive/`)

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

### 1. Google OAuth Setup

1. Open DriveLink settings in Obsidian
2. Enter your **Google OAuth Client ID**
3. Set your **OAuth Redirect URI** (your deployed callback page URL)
4. Click **"Connect to Google Drive"**
5. Complete the OAuth flow in your browser

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
- **"DriveLink: Sync now"** - Perform complete synchronization
- **"DriveLink: Connect to Google Drive"** - Re-authenticate if needed
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
- Verify your Client ID is correct
- Check that the redirect URI matches your deployed callback page
- Ensure Google Drive API is enabled in your Google Cloud project

**"Sync failed"**
- Check your internet connection
- Verify you have sufficient Google Drive storage
- Try disconnecting and reconnecting to Google Drive

**"Callback page not loading"**
- Ensure the callback page is properly deployed and accessible
- Check that the URL in settings matches exactly (including `https://`)
- Try opening the callback URL directly in your browser

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

See [BUILD.md](BUILD.md) for detailed build documentation.

### Project Structure

```
src/
├── auth/              # OAuth 2.0 authentication
│   ├── oauth.ts       # PKCE flow implementation
│   └── token-manager.ts # Token storage & refresh
├── drive/             # Google Drive API integration
│   ├── client.ts      # Drive API wrapper
│   ├── file-operations.ts # Upload/download
│   └── change-detection.ts # Change tracking
├── sync/              # Synchronization engine
│   ├── index-manager.ts # Local file indexing
│   ├── sync-engine.ts # Main sync logic
│   └── conflict-resolver.ts # Conflict handling
├── utils/             # Utility functions
│   ├── crypto.ts      # PKCE crypto helpers
│   └── file-utils.ts  # File pattern matching
├── settings.ts        # Plugin settings UI
├── styles.css         # Plugin UI styles
└── main.ts           # Plugin entry point

scripts/
├── build.js          # Build orchestrator with version management
└── release.js        # Release packaging system

.github/
├── workflows/
│   └── release.yml   # Automated release workflow
└── actions/semver-js/ # Custom semver action
```

## Contributing

This is a personal project, but contributions are welcome:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

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