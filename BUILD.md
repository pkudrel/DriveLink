# Build Guide - DriveLink Plugin

This document describes the local build system for the DriveLink Obsidian plugin.

## Overview

The DriveLink plugin uses a custom build system that:
- ✅ **Reads version from `version.txt`** (currently `0.1.0`)
- ✅ **Uses existing semver action** from `.github/actions/semver-js/`
- ✅ **Updates `manifest.json`** with current version
- ✅ **Creates `versions.json`** for Obsidian compatibility
- ✅ **Builds with esbuild** for fast compilation
- ✅ **Generates build metadata** for tracking

## Quick Start

```bash
# Install dependencies
npm install

# Development build (with file watching)
npm run build:dev

# Production build
npm run build:local

# Version management only (no build)
npm run version
```

## Available Commands

### Build Commands
- **`npm run build:dev`** - Development build with version management
- **`npm run build:local`** - Production build with optimization
- **`npm run dev`** - Development build with file watching (original)
- **`npm run build`** - Production build (original esbuild)

### Version Management
- **`npm run version`** - Update manifest.json and versions.json from version.txt
- **`node scripts/bump-version.js patch`** - Bump patch version (0.1.0 → 0.1.1)
- **`node scripts/bump-version.js minor`** - Bump minor version (0.1.0 → 0.2.0)
- **`node scripts/bump-version.js major`** - Bump major version (0.1.0 → 1.0.0)
- **`node scripts/bump-version.js set 1.2.3`** - Set specific version

## File Structure

```
DriveLink/
├── version.txt              # Source of truth for version (0.1.0)
├── manifest.json            # Updated by build script
├── versions.json            # Created by build script
├── build-info.json          # Build metadata
├── scripts/
│   ├── build.js            # Main build orchestrator
│   └── bump-version.js     # Version management utility
└── .github/actions/semver-js/
    ├── action.yml          # Semver action definition
    └── index.js            # Semver logic (reused locally)
```

## Build Process

1. **Version Resolution**
   - Reads `version.txt` (e.g., `0.1.0`)
   - Uses semver action logic to get git metadata
   - Generates version info with commit SHA, branch, etc.

2. **Manifest Update**
   - Updates `manifest.json` with current version
   - Maintains all other plugin metadata

3. **Versions File**
   - Creates/updates `versions.json` for Obsidian
   - Maps version to minimum Obsidian version requirement

4. **TypeScript Build**
   - Runs TypeScript type checking
   - Compiles `src/main.ts` → `main.js` using esbuild
   - Bundles all dependencies into single file

5. **Build Validation**
   - Ensures required files exist: `manifest.json`, `main.js`, `styles.css`
   - Creates `build-info.json` with build metadata

## Version Management

The build system uses `version.txt` as the single source of truth:

```bash
# Current version
cat version.txt
# Output: 0.1.0

# Bump patch version
node scripts/bump-version.js patch
# version.txt becomes: 0.1.1

# Set specific version
node scripts/bump-version.js set 1.0.0
# version.txt becomes: 1.0.0
```

## Build Output

After a successful build, you'll have:

```
├── manifest.json        # Plugin metadata with current version
├── main.js             # Compiled TypeScript bundle
├── styles.css          # Plugin styles (unchanged)
├── versions.json       # Obsidian version compatibility
└── build-info.json     # Build metadata and timestamps
```

## Installation

Copy these files to your Obsidian vault:
```
YourVault/.obsidian/plugins/drivelink/
├── manifest.json
├── main.js
└── styles.css
```

## Build Script Features

### Colored Output
The build script provides clear, colored output:
- 🔵 **Step indicators** for each build phase
- ✅ **Green success messages** for completed operations
- ❌ **Red error messages** for failures
- ⚠️ **Yellow warnings** for important notices

### Version Information
Each build displays:
```
📦 Version: 0.1.0
🏷️  Tag: v0.1.0
🌿 Branch: main
📝 Commit: 816ad09
📅 Build Date: 2025-09-13T08:05:43.658Z
```

### Build Validation
Automatically checks for:
- Required files presence
- TypeScript compilation success
- Build output integrity

## Integration with Semver Action

The local build reuses the existing GitHub Actions semver logic:
- **Consistent versioning** between local and CI builds
- **Git-based metadata** extraction
- **Flexible version sources** (file-based or tag-based)

## Example Build Output

```bash
$ npm run build:local

🚀 DriveLink Plugin Build Script

[1] Getting version information...
📦 Version: 0.1.0
🏷️  Tag: v0.1.0
🌿 Branch: main
📝 Commit: 816ad09
📅 Build Date: 2025-09-13T08:05:43.658Z
[2] Updating manifest.json...
✅ Updated manifest.json to version 0.1.0
[3] Updating versions.json...
✅ Updated versions.json with version 0.1.0
[4] Building plugin (production)...
✅ Plugin built successfully
[5] Creating build info...
✅ Created build-info.json
[6] Validating build output...
✅ All required files present

🎉 Build completed successfully!
📦 Plugin version: 0.1.0
📂 Output: main.js, manifest.json, styles.css

Ready to install:
Copy these files to your Obsidian vault's .obsidian/plugins/drivelink/ folder:
  - manifest.json
  - main.js
  - styles.css
```

## Troubleshooting

### Common Issues

**TypeScript errors during build:**
```bash
npm run build:local
# Check TypeScript errors and fix them in src/
```

**Missing dependencies:**
```bash
npm install
# Ensure all devDependencies are installed
```

**Version conflicts:**
```bash
# Reset to a clean version
node scripts/bump-version.js set 0.1.0
```

**Build output missing:**
```bash
# Clean build
rm -f main.js build-info.json versions.json
npm run build:local
```

## CI/CD Integration

The build system is designed to work both locally and in CI:
- **Local development**: Use `npm run build:dev`
- **GitHub Actions**: Can use the same semver action
- **Release preparation**: Use `npm run build:local`

This ensures consistent builds across all environments.