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

// Parse semver output into version info object
function parseSemverOutput(semverOutput) {
    const map = {};
    for (const line of semverOutput.split(/\r?\n/)) {
        if (!line || !line.includes('=')) continue;
        const idx = line.indexOf('=');
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key) map[key] = value;
    }

    const required = ['version', 'major', 'minor', 'patch', 'tag', 'sha', 'short_sha', 'branch', 'build_date_utc'];
    const missing = required.filter(k => !(k in map));
    if (missing.length) {
        throw new Error(`Semver outputs missing keys: ${missing.join(', ')}`);
    }

    const versionInfo = {
        version: map.version,
        major: map.major,
        minor: map.minor,
        patch: map.patch,
        tag: map.tag,
        sha: map.sha,
        shortSha: map.short_sha,
        branch: map.branch,
        buildDate: map.build_date_utc
    };

    log(`📦 Version: ${colors.bright}${versionInfo.version}${colors.reset}`);
    log(`🏷️  Tag: ${versionInfo.tag}`);
    log(`🌿 Branch: ${versionInfo.branch}`);
    log(`📝 Commit: ${versionInfo.shortSha}`);
    log(`📅 Build Date: ${versionInfo.buildDate}`);

    return versionInfo;
}

// Fallback version calculation when semver script fails
function getFallbackVersionInfo() {
    console.log('Debug: Using fallback version calculation');

    // Read base version from version.txt
    const versionFile = path.join(__dirname, '..', 'version.txt');
    const baseVersion = fs.existsSync(versionFile)
        ? fs.readFileSync(versionFile, 'utf8').trim()
        : '0.1.0';

    // Parse base version
    const parts = baseVersion.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
    if (!parts) {
        throw new Error(`Invalid version format in version.txt: ${baseVersion}`);
    }

    const major = parts[1];
    const minor = parts[2];
    const basePatch = parseInt(parts[3] || '0', 10);

    // Get commit count for increment (simple fallback)
    let increment = 0;
    try {
        const commitCount = exec('git rev-list --count HEAD', true);
        increment = parseInt(commitCount || '0', 10);
    } catch (error) {
        console.log('Debug: Could not get commit count, using 0');
    }

    const finalPatch = basePatch + increment;
    const version = `${major}.${minor}.${finalPatch}`;
    const tag = `v${version}`;

    // Get other git info
    let sha = '';
    let shortSha = '';
    let branch = 'unknown';

    try {
        sha = exec('git rev-parse HEAD', true) || '';
        shortSha = exec('git rev-parse --short=7 HEAD', true) || sha.substring(0, 7);
        branch = exec('git branch --show-current', true) || 'production';
    } catch (error) {
        console.log('Debug: Could not get git info');
    }

    const buildDate = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    const versionInfo = {
        version,
        major,
        minor,
        patch: String(finalPatch),
        tag,
        sha,
        shortSha,
        branch,
        buildDate
    };

    console.log(`Debug: Using fallback version: ${version}`);

    log(`📦 Version: ${colors.bright}${versionInfo.version}${colors.reset}`);
    log(`🏷️  Tag: ${versionInfo.tag}`);
    log(`🌿 Branch: ${versionInfo.branch}`);
    log(`📝 Commit: ${versionInfo.shortSha}`);
    log(`📅 Build Date: ${versionInfo.buildDate}`);

    return versionInfo;
}

// Get version info using the semver action (always)
function getVersionInfo() {
    logStep('1', 'Getting version information...');

    const semverScript = path.join(__dirname, '..', '.github', 'actions', 'semver-js', 'index.js');

    if (!fs.existsSync(semverScript)) {
        throw new Error('Semver action not found. Ensure .github/actions/semver-js/index.js exists.');
    }

    try {
        // Create a temporary file to capture output since semver script uses GITHUB_OUTPUT
        const os = require('os');
        const tempOutputFile = path.join(os.tmpdir(), `semver-build-output-${Date.now()}.txt`);

        console.log(`Debug: About to run semver script with config file: ${path.join(__dirname, '..', 'version.txt')}`);
        console.log(`Debug: Semver script path: ${semverScript}`);
        console.log(`Debug: Config file exists: ${fs.existsSync(path.join(__dirname, '..', 'version.txt'))}`);

        // Set environment variables for the semver action
        const env = {
            ...process.env,
            INPUT_CONFIG_FILE: 'version.txt',
            INPUT_MODE: 'config-change',
            INPUT_TAG_PREFIX: 'v',
            GITHUB_OUTPUT: tempOutputFile
        };

        // Run the semver action script
        const result = execSync(`node "${semverScript}"`, {
            encoding: 'utf8',
            env,
            stdio: 'pipe'
        });

        console.log(`Debug: Semver output: ${result || '(empty)'}`);

        let semverOutput = '';

        // Try to read from GITHUB_OUTPUT file first
        if (fs.existsSync(tempOutputFile)) {
            semverOutput = fs.readFileSync(tempOutputFile, 'utf8');
            fs.unlinkSync(tempOutputFile); // cleanup
        } else if (result) {
            // Fallback to stdout
            semverOutput = result;
        }

        if (!semverOutput) {
            console.log('Debug: Semver produced no output, using fallback versioning');
            return getFallbackVersionInfo();
        }

        return parseSemverOutput(semverOutput);
    } catch (error) {
        console.log(`Debug: Semver script failed: ${error.message}`);
        console.log('Debug: Using fallback version calculation');
        return getFallbackVersionInfo();
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

