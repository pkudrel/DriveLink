/**
 * File utilities for DriveLink plugin
 */

/**
 * Check if a file path matches any of the given ignore patterns
 */
export function isIgnored(filePath: string, ignorePatterns: string[]): boolean {
    for (const pattern of ignorePatterns) {
        if (matchesPattern(filePath, pattern)) {
            return true;
        }
    }
    return false;
}

/**
 * Match a file path against a glob pattern
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Convert glob pattern to regex
    const regexPattern = normalizedPattern
        .replace(/\*\*/g, '___DOUBLESTAR___') // Temporarily replace ** to avoid conflicts
        .replace(/\*/g, '[^/]*') // * matches any characters except /
        .replace(/___DOUBLESTAR___/g, '.*') // ** matches any number of directories
        .replace(/\?/g, '[^/]') // ? matches single character except /
        .replace(/\./g, '\\.') // Escape dots
        .replace(/\+/g, '\\+') // Escape plus
        .replace(/\^/g, '\\^') // Escape caret
        .replace(/\$/g, '\\$') // Escape dollar
        .replace(/\(/g, '\\(') // Escape parentheses
        .replace(/\)/g, '\\)')
        .replace(/\[/g, '\\[') // Escape brackets
        .replace(/\]/g, '\\]')
        .replace(/\{/g, '\\{') // Escape braces
        .replace(/\}/g, '\\}')
        .replace(/\|/g, '\\|'); // Escape pipe

    try {
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(normalizedPath);
    } catch (error) {
        console.warn(`Invalid pattern "${pattern}":`, error);
        return false;
    }
}

/**
 * Get default ignore patterns for Obsidian vaults
 */
export function getDefaultIgnorePatterns(): string[] {
    return [
        '.obsidian/**',
        '.trash/**',
        '*.tmp',
        '*.lock',
        '.git/**',
        '.gitignore',
        'node_modules/**',
        '.DS_Store',
        'Thumbs.db',
        '*.swp',
        '*.swo',
        '*~'
    ];
}

/**
 * Validate ignore patterns
 */
export function validateIgnorePatterns(patterns: string[]): {
    valid: string[];
    invalid: { pattern: string; error: string }[];
} {
    const valid: string[] = [];
    const invalid: { pattern: string; error: string }[] = [];

    for (const pattern of patterns) {
        try {
            // Test the pattern with a dummy path
            matchesPattern('test/file.md', pattern);
            valid.push(pattern);
        } catch (error) {
            invalid.push({
                pattern,
                error: error.message
            });
        }
    }

    return { valid, invalid };
}

/**
 * Normalize file path for cross-platform compatibility
 */
export function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

/**
 * Get file extension from path
 */
export function getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));

    if (lastDot > lastSlash && lastDot !== -1) {
        return filePath.substring(lastDot + 1).toLowerCase();
    }

    return '';
}

/**
 * Get file name without extension
 */
export function getFileNameWithoutExtension(filePath: string): string {
    const fileName = getFileName(filePath);
    const lastDot = fileName.lastIndexOf('.');

    if (lastDot !== -1) {
        return fileName.substring(0, lastDot);
    }

    return fileName;
}

/**
 * Get file name from path
 */
export function getFileName(filePath: string): string {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return lastSlash !== -1 ? filePath.substring(lastSlash + 1) : filePath;
}

/**
 * Get directory path from file path
 */
export function getDirectoryPath(filePath: string): string {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return lastSlash !== -1 ? filePath.substring(0, lastSlash) : '';
}

/**
 * Join path components
 */
export function joinPath(...components: string[]): string {
    return components
        .filter(component => component && component.length > 0)
        .map(component => component.replace(/[/\\]+$/, '')) // Remove trailing slashes
        .join('/')
        .replace(/\/+/g, '/'); // Normalize multiple slashes
}

/**
 * Check if file is a supported type for syncing
 */
export function isSupportedFileType(filePath: string, supportedExtensions: string[] = []): boolean {
    const defaultSupported = ['md', 'txt', 'json', 'png', 'jpg', 'jpeg', 'gif', 'pdf'];
    const extensions = supportedExtensions.length > 0 ? supportedExtensions : defaultSupported;

    const fileExtension = getFileExtension(filePath);
    return extensions.includes(fileExtension);
}

/**
 * Generate a safe filename for the current platform
 */
export function sanitizeFileName(fileName: string): string {
    // Remove or replace invalid characters
    return fileName
        .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters with underscore
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()
        .substring(0, 255); // Limit length to 255 characters
}

/**
 * Check if two file paths are equivalent (case-insensitive on Windows)
 */
export function pathsEqual(path1: string, path2: string): boolean {
    const normalized1 = normalizePath(path1);
    const normalized2 = normalizePath(path2);

    // Case-insensitive comparison for Windows-like environments
    if (process.platform === 'win32') {
        return normalized1.toLowerCase() === normalized2.toLowerCase();
    }

    return normalized1 === normalized2;
}

/**
 * Get relative path from base to target
 */
export function getRelativePath(basePath: string, targetPath: string): string {
    const base = normalizePath(basePath).split('/').filter(Boolean);
    const target = normalizePath(targetPath).split('/').filter(Boolean);

    // Find common prefix
    let commonLength = 0;
    while (commonLength < base.length &&
           commonLength < target.length &&
           base[commonLength] === target[commonLength]) {
        commonLength++;
    }

    // Build relative path
    const upLevels = base.length - commonLength;
    const downPath = target.slice(commonLength);

    const relativeParts = [];
    for (let i = 0; i < upLevels; i++) {
        relativeParts.push('..');
    }
    relativeParts.push(...downPath);

    return relativeParts.join('/') || '.';
}

/**
 * Check if path is absolute
 */
export function isAbsolute(filePath: string): boolean {
    const normalized = normalizePath(filePath);

    // Unix-style absolute path
    if (normalized.startsWith('/')) {
        return true;
    }

    // Windows-style absolute path
    if (/^[a-zA-Z]:\//i.test(normalized)) {
        return true;
    }

    return false;
}

/**
 * Ensure path is absolute by combining with base if needed
 */
export function ensureAbsolute(filePath: string, basePath: string): string {
    if (isAbsolute(filePath)) {
        return normalizePath(filePath);
    }

    return joinPath(basePath, filePath);
}

/**
 * Filter files by ignore patterns
 */
export function filterIgnoredFiles(filePaths: string[], ignorePatterns: string[]): string[] {
    return filePaths.filter(filePath => !isIgnored(filePath, ignorePatterns));
}

/**
 * Group files by directory
 */
export function groupFilesByDirectory(filePaths: string[]): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const filePath of filePaths) {
        const dir = getDirectoryPath(filePath) || '.';

        if (!groups.has(dir)) {
            groups.set(dir, []);
        }

        groups.get(dir)!.push(filePath);
    }

    return groups;
}

/**
 * Sort file paths naturally (directories first, then alphabetically)
 */
export function sortFilePaths(filePaths: string[]): string[] {
    return [...filePaths].sort((a, b) => {
        const aDir = getDirectoryPath(a);
        const bDir = getDirectoryPath(b);

        // Sort by directory first
        if (aDir !== bDir) {
            return aDir.localeCompare(bDir);
        }

        // Then by filename
        const aName = getFileName(a);
        const bName = getFileName(b);

        return aName.localeCompare(bName);
    });
}

/**
 * Calculate simple hash of a string (for change detection)
 */
export function simpleHash(input: string): string {
    let hash = 0;

    if (input.length === 0) {
        return hash.toString();
    }

    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
}