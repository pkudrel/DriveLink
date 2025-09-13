# DRIVELINK-001 Implementation Plan

## Project Overview
Create a private Obsidian plugin named DriveLink for manual synchronization between a Vault and Google Drive folder using modern TypeScript.

## File Structure Plan

### 1. Plugin Core Files
- `manifest.json` - Plugin metadata and permissions
- `main.ts` - Main plugin class and entry point
- `package.json` - Node.js dependencies and build scripts
- `tsconfig.json` - TypeScript compilation configuration
- `esbuild.config.mjs` - Build configuration for bundling
- `styles.css` - Optional plugin styles

### 2. Source Code Structure
- `src/main.ts` - Plugin entry point and main class
- `src/settings.ts` - Settings tab and configuration management
- `src/auth/` - Google OAuth 2.0 PKCE implementation
  - `src/auth/oauth.ts` - OAuth flow management
  - `src/auth/token-manager.ts` - Token storage and refresh
- `src/drive/` - Google Drive API integration
  - `src/drive/client.ts` - Drive API client wrapper
  - `src/drive/file-operations.ts` - Upload/download operations
  - `src/drive/change-detection.ts` - Drive changes API
- `src/sync/` - Synchronization logic
  - `src/sync/index-manager.ts` - Local file index management
  - `src/sync/sync-engine.ts` - Main synchronization logic
  - `src/sync/conflict-resolver.ts` - Conflict handling
- `src/utils/` - Utility functions
  - `src/utils/file-utils.ts` - File operations and ignore patterns
  - `src/utils/crypto.ts` - PKCE and cryptographic helpers

### 3. Static Assets
- `callback/drive/index.html` - OAuth callback page for static hosting

### 4. Configuration Files
- `.gitignore` - Git ignore patterns
- `README.md` - Installation and usage instructions

## Implementation Order

### Phase 1: Project Setup
1. Create plugin manifest and basic structure
2. Set up TypeScript and build configuration
3. Create basic plugin class skeleton

### Phase 2: Authentication Infrastructure
4. Implement PKCE OAuth flow
5. Create token management system
6. Build settings interface for client configuration

### Phase 3: Google Drive Integration
7. Implement Drive API client wrapper
8. Add file upload/download operations
9. Integrate change detection API

### Phase 4: Synchronization Core
10. Build local file index system
11. Implement synchronization engine
12. Add conflict resolution logic

### Phase 5: Integration & Polish
13. Create plugin commands and UI
14. Add ignore pattern support
15. Build callback page for OAuth
16. Write documentation and README

## Technical Patterns

### Code Style
- Modern TypeScript with strict typing
- ES modules with async/await
- Error handling with try/catch blocks
- JSDoc comments for public APIs

### File Organization
- Feature-based directory structure
- Barrel exports from directories
- Clear separation of concerns
- Minimal external dependencies

### Obsidian Patterns
- Plugin class extending Obsidian's Plugin
- Settings tab using PluginSettingTab
- Commands registered with addCommand
- Data persistence with saveData/loadData

## Dependencies

### Runtime Dependencies
- None (pure Obsidian plugin)

### Development Dependencies
- `typescript` - TypeScript compiler
- `esbuild` - Fast bundler
- `@types/node` - Node.js type definitions
- `obsidian` - Obsidian API types

## Build Process
1. TypeScript compilation via esbuild
2. Bundle to single `main.js` file
3. Copy manifest.json and styles.css
4. Output to plugin directory structure

## Success Criteria
- [ ] Plugin loads successfully in Obsidian
- [ ] OAuth flow completes and stores tokens
- [ ] Can connect to and create Google Drive folder
- [ ] Manual sync command uploads/downloads files
- [ ] Conflicts create backup copies
- [ ] Works on desktop and mobile platforms