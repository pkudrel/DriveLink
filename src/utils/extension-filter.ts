/**
 * Extension filtering utilities for DriveLink plugin
 */

import { getFileExtension, isIgnored } from './file-utils';

/**
 * Check if file should be synced based on extension filtering settings
 */
export function shouldSyncFile(
    filePath: string,
    enableExtensionFiltering: boolean,
    allowedFileExtensions: string[],
    ignorePatterns: string[] = []
): boolean {
    // First check if file is ignored by patterns
    if (isIgnored(filePath, ignorePatterns)) {
        return false;
    }

    // If extension filtering is disabled, sync all non-ignored files
    if (!enableExtensionFiltering) {
        return true;
    }

    // If extension filtering is enabled, check if file extension is allowed
    const fileExtension = getFileExtension(filePath);
    return allowedFileExtensions.includes(fileExtension);
}

/**
 * Filter files by extension filtering settings
 */
export function filterFilesByExtensions(
    filePaths: string[],
    enableExtensionFiltering: boolean,
    allowedFileExtensions: string[],
    ignorePatterns: string[] = []
): string[] {
    return filePaths.filter(filePath =>
        shouldSyncFile(filePath, enableExtensionFiltering, allowedFileExtensions, ignorePatterns)
    );
}

/**
 * Get all unique extensions from a list of file paths
 */
export function getUniqueExtensions(filePaths: string[]): string[] {
    const extensions = new Set<string>();

    for (const filePath of filePaths) {
        const extension = getFileExtension(filePath);
        if (extension) {
            extensions.add(extension);
        }
    }

    return Array.from(extensions).sort();
}

/**
 * Validate extension filtering settings
 */
export function validateExtensionSettings(allowedExtensions: string[]): {
    valid: string[];
    invalid: { extension: string; error: string }[];
} {
    const valid: string[] = [];
    const invalid: { extension: string; error: string }[] = [];

    for (const extension of allowedExtensions) {
        const trimmed = extension.trim().toLowerCase();

        if (!trimmed) {
            continue; // Skip empty extensions
        }

        // Check for valid extension format (alphanumeric only)
        if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
            invalid.push({
                extension,
                error: 'Extension must contain only letters and numbers'
            });
            continue;
        }

        // Check for reasonable length
        if (trimmed.length > 10) {
            invalid.push({
                extension,
                error: 'Extension is too long (max 10 characters)'
            });
            continue;
        }

        valid.push(trimmed);
    }

    return { valid, invalid };
}

/**
 * Get default file extensions for syncing
 */
export function getDefaultAllowedExtensions(): string[] {
    return ['md', 'pdf'];
}

/**
 * Get commonly used file extensions for Obsidian vaults
 */
export function getCommonVaultExtensions(): string[] {
    return [
        'md',     // Markdown files
        'pdf',    // PDF documents
        'txt',    // Text files
        'png',    // PNG images
        'jpg',    // JPEG images
        'jpeg',   // JPEG images
        'gif',    // GIF images
        'svg',    // SVG images
        'json',   // JSON files
        'csv',    // CSV files
        'html',   // HTML files
        'xml',    // XML files
        'docx',   // Word documents
        'xlsx',   // Excel files
        'pptx'    // PowerPoint files
    ];
}