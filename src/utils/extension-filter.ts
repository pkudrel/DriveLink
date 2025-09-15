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
    ignorePatterns: string[] = [],
    debug: boolean = false,
    allowFolders: boolean = true,
    mimeType?: string
): boolean {
    const fileExtension = getFileExtension(filePath);
    const isFolder = fileExtension === ''; // Files without extensions are typically folders

    if (debug) {
        console.log(`[FileFilter] Checking file: ${filePath}`);
        console.log(`[FileFilter] - Extension: ${fileExtension}`);
        console.log(`[FileFilter] - Is folder: ${isFolder}`);
        console.log(`[FileFilter] - MimeType: ${mimeType || 'unknown'}`);
        console.log(`[FileFilter] - Extension filtering enabled: ${enableExtensionFiltering}`);
        console.log(`[FileFilter] - Allowed extensions: [${allowedFileExtensions.join(', ')}]`);
        console.log(`[FileFilter] - Allow folders: ${allowFolders}`);
        console.log(`[FileFilter] - Ignore patterns: [${ignorePatterns.join(', ')}]`);
    }

    // Check if this is a Google Workspace document that should be ignored
    if (mimeType) {
        const isGoogleDoc = mimeType === 'application/vnd.google-apps.document' ||
                           mimeType === 'application/vnd.google-apps.spreadsheet' ||
                           mimeType === 'application/vnd.google-apps.presentation' ||
                           mimeType === 'application/vnd.google-apps.form';

        if (isGoogleDoc) {
            if (debug) {
                console.log(`[FileFilter] - REJECTED: Google Workspace document (${mimeType})`);
            }
            return false;
        }
    }

    // First check if file is ignored by patterns
    if (isIgnored(filePath, ignorePatterns)) {
        if (debug) {
            console.log(`[FileFilter] - REJECTED: File matches ignore pattern`);
        }
        return false;
    }

    // Handle folders (items without extensions)
    if (isFolder) {
        if (debug) {
            console.log(`[FileFilter] - ${allowFolders ? 'ACCEPTED' : 'REJECTED'}: Folder (${allowFolders ? 'folders allowed' : 'folders not allowed'})`);
        }
        return allowFolders;
    }

    // If extension filtering is disabled, sync all non-ignored files
    if (!enableExtensionFiltering) {
        if (debug) {
            console.log(`[FileFilter] - ACCEPTED: Extension filtering disabled`);
        }
        return true;
    }

    // If extension filtering is enabled, check if file extension is allowed
    const isAllowed = allowedFileExtensions.includes(fileExtension);
    if (debug) {
        console.log(`[FileFilter] - ${isAllowed ? 'ACCEPTED' : 'REJECTED'}: Extension ${fileExtension} ${isAllowed ? 'is' : 'is not'} in allowed list`);
    }
    return isAllowed;
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