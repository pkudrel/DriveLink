#!/usr/bin/env node

/**
 * Version bump utility for DriveLink Plugin
 * Updates version.txt which is used by the build system
 */

const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

function log(msg, color = colors.reset) {
    console.log(`${color}${msg}${colors.reset}`);
}

function parseVersion(versionStr) {
    const match = versionStr.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
        throw new Error(`Invalid version format: ${versionStr}`);
    }
    return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3])
    };
}

function formatVersion(version) {
    return `${version.major}.${version.minor}.${version.patch}`;
}

function bumpVersion(version, type) {
    const newVersion = { ...version };

    switch (type) {
        case 'major':
            newVersion.major++;
            newVersion.minor = 0;
            newVersion.patch = 0;
            break;
        case 'minor':
            newVersion.minor++;
            newVersion.patch = 0;
            break;
        case 'patch':
            newVersion.patch++;
            break;
        default:
            throw new Error(`Invalid bump type: ${type}. Use major, minor, or patch.`);
    }

    return newVersion;
}

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        log(`${colors.yellow}Usage: node bump-version.js <major|minor|patch|set> [version]${colors.reset}`);
        log('Examples:');
        log('  node bump-version.js patch       # 1.0.0 -> 1.0.1');
        log('  node bump-version.js minor       # 1.0.0 -> 1.1.0');
        log('  node bump-version.js major       # 1.0.0 -> 2.0.0');
        log('  node bump-version.js set 1.2.3  # Set to specific version');
        process.exit(1);
    }

    const versionFile = path.join(__dirname, '..', 'version.txt');

    if (!fs.existsSync(versionFile)) {
        log(`${colors.red}❌ version.txt not found${colors.reset}`);
        process.exit(1);
    }

    try {
        const currentVersionStr = fs.readFileSync(versionFile, 'utf8');
        const currentVersion = parseVersion(currentVersionStr);

        log(`Current version: ${colors.bright}${formatVersion(currentVersion)}${colors.reset}`);

        let newVersion;
        const action = args[0].toLowerCase();

        if (action === 'set') {
            if (!args[1]) {
                log(`${colors.red}❌ Please provide version when using 'set'${colors.reset}`);
                process.exit(1);
            }
            newVersion = parseVersion(args[1]);
        } else {
            newVersion = bumpVersion(currentVersion, action);
        }

        const newVersionStr = formatVersion(newVersion);
        fs.writeFileSync(versionFile, newVersionStr + '\n');

        log(`${colors.green}✅ Version updated to: ${colors.bright}${newVersionStr}${colors.reset}`);

    } catch (error) {
        log(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { parseVersion, formatVersion, bumpVersion };