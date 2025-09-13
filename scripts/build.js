#!/usr/bin/env node

/**
 * Local build script for DriveLink Obsidian Plugin
 * Uses the existing semver action to generate version info and build the plugin
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Color output utilities
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

// Get version info using the semver action
function getVersionInfo() {
    logStep('1', 'Getting version information...');

    const semverScript = path.join(__dirname, '..', '.github', 'actions', 'semver-js', 'index.js');

    if (!fs.existsSync(semverScript)) {
        throw new Error('Semver action not found. Ensure .github/actions/semver-js/index.js exists.');
    }

    // Set environment variables for the semver action
    const originalEnv = process.env;
    process.env.INPUT_CONFIG_FILE = 'version.txt';
    process.env.INPUT_MODE = 'config-change';
    process.env.INPUT_TAG_PREFIX = 'v';

    try {
        // Capture semver output
        const semverOutput = exec(`node "${semverScript}"`, true);

        // The action sets outputs, but we need to extract them differently for local use
        // Let's call it directly and parse the result
        const versionFile = path.join(__dirname, '..', 'version.txt');
        const versionContent = fs.readFileSync(versionFile, 'utf8').trim();
        const [major, minor, patch = '0'] = versionContent.split('.');

        // Get git info
        const sha = exec('git rev-parse HEAD', true) || 'unknown';
        const shortSha = sha.substring(0, 7);
        const branch = exec('git rev-parse --abbrev-ref HEAD', true) || 'unknown';
        const buildDate = new Date().toISOString();

        const version = `${major}.${minor}.${patch}`;
        const tag = `v${version}`;

        const versionInfo = {
            version,
            major,
            minor,
            patch,
            tag,
            sha,
            shortSha,
            branch,
            buildDate
        };

        log(`📦 Version: ${colors.bright}${version}${colors.reset}`);
        log(`🏷️  Tag: ${tag}`);
        log(`🌿 Branch: ${branch}`);
        log(`📝 Commit: ${shortSha}`);
        log(`📅 Build Date: ${buildDate}`);

        return versionInfo;
    } finally {
        process.env = originalEnv;
    }
}

// Update manifest.json with version info
function updateManifest(versionInfo) {
    logStep('2', 'Updating manifest.json...');

    const manifestPath = path.join(__dirname, '..', 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
        throw new Error('manifest.json not found');
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = versionInfo.version;

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    logSuccess(`Updated manifest.json to version ${versionInfo.version}`);
}

// Create or update versions.json
function updateVersionsFile(versionInfo) {
    logStep('3', 'Updating versions.json...');

    const versionsPath = path.join(__dirname, '..', 'versions.json');
    let versions = {};

    if (fs.existsSync(versionsPath)) {
        versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
    }

    // Add current version with minimum Obsidian version
    versions[versionInfo.version] = "0.15.0"; // Minimum Obsidian version from manifest

    fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n');
    logSuccess(`Updated versions.json with version ${versionInfo.version}`);
}

// Build the plugin using esbuild
function buildPlugin(production = false) {
    logStep('4', `Building plugin (${production ? 'production' : 'development'})...`);

    const buildCmd = production ? 'npm run build' : 'npm run dev';

    try {
        exec(buildCmd);

        // Copy styles.css from src to root after build
        const srcStyles = path.join(__dirname, '..', 'src', 'styles.css');
        const destStyles = path.join(__dirname, '..', 'styles.css');

        if (fs.existsSync(srcStyles)) {
            fs.copyFileSync(srcStyles, destStyles);
            logSuccess('Copied styles.css to root directory');
        }

        logSuccess('Plugin built successfully');
    } catch (error) {
        logError('Build failed');
        throw error;
    }
}

// Create build info file
function createBuildInfo(versionInfo) {
    logStep('5', 'Creating build info...');

    const buildInfo = {
        version: versionInfo.version,
        buildDate: versionInfo.buildDate,
        commit: versionInfo.sha,
        branch: versionInfo.branch,
        built: true
    };

    const buildInfoPath = path.join(__dirname, '..', 'build-info.json');
    fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2) + '\n');
    logSuccess('Created build-info.json');
}

// Validate build output
function validateBuild() {
    logStep('6', 'Validating build output...');

    const requiredFiles = ['manifest.json', 'main.js', 'styles.css'];
    const missingFiles = [];

    for (const file of requiredFiles) {
        const filePath = path.join(__dirname, '..', file);
        if (!fs.existsSync(filePath)) {
            missingFiles.push(file);
        }
    }

    if (missingFiles.length > 0) {
        logError(`Missing required files: ${missingFiles.join(', ')}`);
        return false;
    }

    logSuccess('All required files present');
    return true;
}

// Main build function
function main() {
    const args = process.argv.slice(2);
    const production = args.includes('--prod') || args.includes('--production');
    const skipBuild = args.includes('--skip-build');

    log(`${colors.bright}🚀 DriveLink Plugin Build Script${colors.reset}\n`);

    try {
        // Get version information
        const versionInfo = getVersionInfo();

        // Update manifest and versions
        updateManifest(versionInfo);
        updateVersionsFile(versionInfo);

        // Build the plugin
        if (!skipBuild) {
            buildPlugin(production);
        } else {
            logWarning('Skipping build (--skip-build flag)');
        }

        // Create build info
        createBuildInfo(versionInfo);

        // Validate build
        if (!skipBuild && !validateBuild()) {
            process.exit(1);
        }

        log(`\n${colors.green}${colors.bright}🎉 Build completed successfully!${colors.reset}`);
        log(`📦 Plugin version: ${colors.bright}${versionInfo.version}${colors.reset}`);
        log(`📂 Output: main.js, manifest.json, styles.css`);

        if (!skipBuild) {
            log(`\n${colors.yellow}Ready to install:${colors.reset}`);
            log(`Copy these files to your Obsidian vault's .obsidian/plugins/drivelink/ folder:`);
            log(`  - manifest.json`);
            log(`  - main.js`);
            log(`  - styles.css`);
        }

    } catch (error) {
        logError(`Build failed: ${error.message}`);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main, getVersionInfo, updateManifest, buildPlugin };