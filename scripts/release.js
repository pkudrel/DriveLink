#!/usr/bin/env node

/**
 * Local release script for DriveLink Obsidian Plugin
 * Creates distributable packages from the built plugin
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

// Color output utilities
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(msg, color = colors.reset) {
    console.log(`${color}${msg}${colors.reset}`);
}

function logStep(step, msg) {
    log(`[${step}] ${msg}`, colors.cyan);
}

function logSuccess(msg) {
    log(`✅ ${msg}`, colors.green);
}

function logError(msg) {
    log(`❌ ${msg}`, colors.red);
}

function logWarning(msg) {
    log(`⚠️  ${msg}`, colors.yellow);
}

function exec(cmd, silent = false) {
    try {
        const result = execSync(cmd, { encoding: 'utf8', stdio: silent ? ['ignore', 'pipe', 'ignore'] : 'inherit' });
        return result?.trim() || '';
    } catch (error) {
        if (!silent) {
            logError(`Command failed: ${cmd}`);
            throw error;
        }
        return '';
    }
}

// Get current version from version.txt
function getCurrentVersion() {
    const versionFile = path.join(__dirname, '..', 'version.txt');
    if (!fs.existsSync(versionFile)) {
        throw new Error('version.txt not found. Run build first.');
    }
    return fs.readFileSync(versionFile, 'utf8').trim();
}

// Validate required files exist
function validateBuildFiles() {
    logStep('1', 'Validating build files...');

    const requiredFiles = [
        'manifest.json',
        'main.js',
        'styles.css'
    ];

    const missingFiles = [];
    for (const file of requiredFiles) {
        const filePath = path.join(__dirname, '..', file);
        if (!fs.existsSync(filePath)) {
            missingFiles.push(file);
        }
    }

    if (missingFiles.length > 0) {
        logError(`Missing required files: ${missingFiles.join(', ')}`);
        logError('Run "npm run build:local" first to build the plugin');
        return false;
    }

    logSuccess('All required build files present');
    return true;
}

// Create release directory structure
function createReleaseDirectory(version) {
    logStep('2', 'Creating release directory...');

    const releaseDir = path.join(__dirname, '..', 'releases');
    const versionDir = path.join(releaseDir, `v${version}`);

    // Create directories if they don't exist
    if (!fs.existsSync(releaseDir)) {
        fs.mkdirSync(releaseDir);
    }

    if (fs.existsSync(versionDir)) {
        logWarning(`Release v${version} already exists, overwriting...`);
        fs.rmSync(versionDir, { recursive: true, force: true });
    }

    fs.mkdirSync(versionDir);
    logSuccess(`Created release directory: releases/v${version}/`);
    return versionDir;
}

// Copy plugin files to release directory
function copyPluginFiles(versionDir, version) {
    logStep('3', 'Copying plugin files...');

    const files = [
        'manifest.json',
        'main.js',
        'styles.css'
    ];

    for (const file of files) {
        const srcPath = path.join(__dirname, '..', file);
        const destPath = path.join(versionDir, file);
        fs.copyFileSync(srcPath, destPath);
    }

    // Copy additional files if they exist
    const optionalFiles = [
        'README.md',
        'LICENSE',
        'versions.json'
    ];

    for (const file of optionalFiles) {
        const srcPath = path.join(__dirname, '..', file);
        if (fs.existsSync(srcPath)) {
            const destPath = path.join(versionDir, file);
            fs.copyFileSync(srcPath, destPath);
        }
    }

    logSuccess(`Copied plugin files to release directory`);
}

// Create release notes template
function createReleaseNotes(versionDir, version) {
    logStep('4', 'Creating release notes...');

    const releaseNotes = `# DriveLink Plugin v${version}

## What's New

- [Add your release notes here]

## Installation

### Manual Installation
1. Download \`drivelink-v${version}.zip\`
2. Extract the files to your Obsidian vault's plugins directory:
   \`YourVault/.obsidian/plugins/drivelink/\`
3. Enable the plugin in Obsidian settings

### Files Included
- \`manifest.json\` - Plugin metadata
- \`main.js\` - Plugin code (${Math.round(fs.statSync(path.join(versionDir, 'main.js')).size / 1024)}KB)
- \`styles.css\` - Plugin styles

## Requirements
- Obsidian v0.15.0 or later
- Google Drive account with API access

## Support
- Report issues: [GitHub Issues](https://github.com/your-username/drivelink/issues)
- Documentation: [README.md](README.md)

---
Built on ${new Date().toISOString().split('T')[0]}
`;

    const notesPath = path.join(versionDir, 'RELEASE_NOTES.md');
    fs.writeFileSync(notesPath, releaseNotes);
    logSuccess('Created release notes template');
}

// Create ZIP archive
function createZipArchive(versionDir, version) {
    return new Promise((resolve, reject) => {
        logStep('5', 'Creating ZIP archive...');

        const zipPath = path.join(path.dirname(versionDir), `drivelink-v${version}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            const sizeKB = Math.round(archive.pointer() / 1024);
            logSuccess(`Created ZIP archive: drivelink-v${version}.zip (${sizeKB}KB)`);
            resolve(zipPath);
        });

        output.on('error', reject);
        archive.on('error', reject);

        archive.pipe(output);

        // Add files to archive
        archive.file(path.join(versionDir, 'manifest.json'), { name: 'manifest.json' });
        archive.file(path.join(versionDir, 'main.js'), { name: 'main.js' });
        archive.file(path.join(versionDir, 'styles.css'), { name: 'styles.css' });

        // Add optional files if they exist
        const optionalFiles = ['README.md', 'LICENSE', 'versions.json'];
        for (const file of optionalFiles) {
            const filePath = path.join(versionDir, file);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file });
            }
        }

        archive.finalize();
    });
}

// Generate checksums
function generateChecksums(zipPath, version) {
    logStep('6', 'Generating checksums...');

    const crypto = require('crypto');
    const zipContent = fs.readFileSync(zipPath);
    const sha256 = crypto.createHash('sha256').update(zipContent).digest('hex');
    const md5 = crypto.createHash('md5').update(zipContent).digest('hex');

    const checksumContent = `# DriveLink Plugin v${version} - Checksums

## File: drivelink-v${version}.zip

**SHA256:** ${sha256}
**MD5:** ${md5}
**Size:** ${zipContent.length} bytes (${Math.round(zipContent.length / 1024)}KB)

Generated on: ${new Date().toISOString()}
`;

    const checksumPath = path.join(path.dirname(zipPath), `drivelink-v${version}.checksums.txt`);
    fs.writeFileSync(checksumPath, checksumContent);

    logSuccess('Generated checksums file');
    return { sha256, md5 };
}

// Update releases index
function updateReleasesIndex(version, zipPath, checksums) {
    logStep('7', 'Updating releases index...');

    const releasesDir = path.join(__dirname, '..', 'releases');
    const indexPath = path.join(releasesDir, 'index.json');

    let releases = [];
    if (fs.existsSync(indexPath)) {
        releases = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    }

    // Remove existing entry for this version
    releases = releases.filter(r => r.version !== version);

    // Add new release entry
    const releaseEntry = {
        version,
        tag: `v${version}`,
        date: new Date().toISOString(),
        files: {
            zip: `drivelink-v${version}.zip`,
            checksums: `drivelink-v${version}.checksums.txt`
        },
        checksums: {
            sha256: checksums.sha256,
            md5: checksums.md5
        },
        size: fs.statSync(zipPath).size
    };

    releases.unshift(releaseEntry); // Add to beginning

    // Keep only last 10 releases in index
    if (releases.length > 10) {
        releases = releases.slice(0, 10);
    }

    fs.writeFileSync(indexPath, JSON.stringify(releases, null, 2) + '\n');
    logSuccess('Updated releases index');
}

// Main release function
async function main() {
    const args = process.argv.slice(2);
    const skipBuild = args.includes('--skip-build');
    const cleanOnly = args.includes('--clean');

    log(`${colors.bright}📦 DriveLink Plugin Release Script${colors.reset}\n`);

    try {
        // Clean old releases if requested
        if (cleanOnly) {
            const releasesDir = path.join(__dirname, '..', 'releases');
            if (fs.existsSync(releasesDir)) {
                fs.rmSync(releasesDir, { recursive: true, force: true });
                logSuccess('Cleaned old releases');
            }
            return;
        }

        // Build plugin first if not skipped
        if (!skipBuild) {
            log(`${colors.magenta}Building plugin first...${colors.reset}`);
            exec('npm run build:local');
            log(''); // Empty line
        }

        // Get version
        const version = getCurrentVersion();
        log(`📦 Creating release for version: ${colors.bright}${version}${colors.reset}\n`);

        // Validate build files
        if (!validateBuildFiles()) {
            process.exit(1);
        }

        // Create release
        const versionDir = createReleaseDirectory(version);
        copyPluginFiles(versionDir, version);
        createReleaseNotes(versionDir, version);

        const zipPath = await createZipArchive(versionDir, version);
        const checksums = generateChecksums(zipPath, version);
        updateReleasesIndex(version, zipPath, checksums);

        log(`\n${colors.green}${colors.bright}🎉 Release created successfully!${colors.reset}`);
        log(`📦 Version: ${colors.bright}${version}${colors.reset}`);
        log(`📁 Directory: releases/v${version}/`);
        log(`🗜️  Archive: drivelink-v${version}.zip`);
        log(`🔐 Checksums: drivelink-v${version}.checksums.txt`);

        log(`\n${colors.yellow}Next Steps:${colors.reset}`);
        log(`1. Review release notes: releases/v${version}/RELEASE_NOTES.md`);
        log(`2. Test the ZIP archive in a clean Obsidian vault`);
        log(`3. Upload to GitHub releases or distribution platform`);

    } catch (error) {
        logError(`Release failed: ${error.message}`);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main, getCurrentVersion, validateBuildFiles };