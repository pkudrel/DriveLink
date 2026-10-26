#!/usr/bin/env node

/**
 * Local build script for DriveLink Obsidian Plugin
 * Gets the version from abcversion (same tool and config as CI) and builds the plugin
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const ABCVERSION_INSTALL_HELP =
    'abcversion computes the plugin version (https://github.com/deneblab/abcversion). Install it with one of:\n' +
    '  curl -sSL https://raw.githubusercontent.com/deneblab/abcversion/production/install.sh | sh   (Linux x64, macOS arm64)\n' +
    '  irm https://raw.githubusercontent.com/deneblab/abcversion/production/install.ps1 | iex       (Windows x64)\n' +
    '  dotnet tool install --global Deneblab.AbcVersionCmd                                         (other platforms)\n' +
    'or set ABCVERSION_BIN to the path of the binary.';

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

// Read version info from abcversion; the version comes from .abcversion.json and the git history
function readAbcVersion() {
    const bin = process.env.ABCVERSION_BIN || 'abcversion';
    const result = spawnSync(bin, [], { cwd: ROOT, encoding: 'utf8' });

    if (result.error) {
        if (result.error.code === 'ENOENT') {
            throw new Error(`abcversion not found.\n${ABCVERSION_INSTALL_HELP}`);
        }
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`abcversion failed (exit ${result.status}): ${(result.stderr || result.stdout).trim()}`);
    }

    let data;
    try {
        data = JSON.parse(result.stdout);
    } catch {
        throw new Error(`abcversion returned invalid JSON: ${result.stdout.trim()}`);
    }

    if (!/^\d+\.\d+\.\d+$/.test(data.SemVersion || '')) {
        throw new Error(`abcversion returned an unexpected version: ${data.SemVersion}`);
    }

    return {
        version: data.SemVersion,
        major: String(data.Major),
        minor: String(data.Minor),
        patch: String(data.Patch),
        tag: `v${data.SemVersion}`,
        sha: data.GitSha,
        shortSha: (data.GitSha || '').slice(0, 7),
        branch: data.GitBranch,
        buildDate: data.DateTime
    };
}

// Get version info and print it
function getVersionInfo() {
    logStep('1', 'Getting version information (abcversion)...');

    const versionInfo = readAbcVersion();

    log(`📦 Version: ${colors.bright}${versionInfo.version}${colors.reset}`);
    log(`🏷️  Tag: ${versionInfo.tag}`);
    log(`🌿 Branch: ${versionInfo.branch}`);
    log(`📝 Commit: ${versionInfo.shortSha}`);
    log(`📅 Build Date: ${versionInfo.buildDate}`);

    return versionInfo;
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

        // Copy additional files to dist directory after build

        // Copy styles.css from src to dist
        const srcStyles = path.join(__dirname, '..', 'src', 'styles.css');
        const destStyles = path.join(__dirname, '..', 'dist', 'styles.css');
        if (fs.existsSync(srcStyles)) {
            fs.copyFileSync(srcStyles, destStyles);
            logSuccess('Copied styles.css to dist directory');
        }

        // Copy manifest.json to dist for distribution
        const srcManifest = path.join(__dirname, '..', 'manifest.json');
        const destManifest = path.join(__dirname, '..', 'dist', 'manifest.json');
        if (fs.existsSync(srcManifest)) {
            fs.copyFileSync(srcManifest, destManifest);
            logSuccess('Copied manifest.json to dist directory');
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

    const requiredFiles = [
        { file: 'manifest.json', location: 'dist' },
        { file: 'main.js', location: 'dist' },
        { file: 'styles.css', location: 'dist' }
    ];
    const missingFiles = [];

    for (const { file, location } of requiredFiles) {
        const filePath = location === 'root'
            ? path.join(__dirname, '..', file)
            : path.join(__dirname, '..', 'dist', file);
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

module.exports = { main, getVersionInfo, readAbcVersion, updateManifest, buildPlugin };

