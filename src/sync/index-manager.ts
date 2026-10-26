import { TFile, TAbstractFile } from 'obsidian';
import type DriveLinkPlugin from '../main';
import { DriveFile } from '../drive/client';
import { shouldSyncFile } from '../utils/extension-filter';

/**
 * data.json key holding the file index
 */
export const INDEX_STORAGE_KEY = 'drivelink-file-index';

/**
 * Local file metadata entry
 */
export interface LocalFileEntry {
    path: string;
    size: number;
    mtime: number; // Last modified time in milliseconds
    etag?: string; // Google Drive ETag
    driveId?: string; // Google Drive file ID
    hash?: string; // Local file content hash for change detection
    lastSyncTime?: number; // When this file was last synced
    conflictVersion?: number; // Version number for conflict files
}

/**
 * File index data structure
 */
export interface FileIndex {
    version: string;
    lastUpdated: number;
    files: Record<string, LocalFileEntry>; // path -> metadata
    driveToLocal: Record<string, string>; // driveId -> path mapping
}

/**
 * Index comparison result
 */
export interface IndexComparison {
    localChanges: string[]; // Files changed locally since last sync
    remoteChanges: string[]; // Files changed remotely (via Drive changes)
    newLocal: string[]; // New local files not in Drive
    newRemote: DriveFile[]; // New remote files not locally
    deletedLocal: string[]; // Files deleted locally but exist in Drive
    deletedRemote: string[]; // Files deleted from Drive but exist locally
    conflicts: string[]; // Files modified both locally and remotely
}

/**
 * What a remote file list represents
 */
export interface RemoteScope {
    isComplete: boolean; // true: the full content of the Drive folder; false: only changed files
    removedIds?: string[]; // Drive IDs reported as removed or trashed
}

/**
 * Change detection result
 */
export interface ChangeDetectionResult {
    hasChanges: boolean;
    localFiles: Map<string, TFile>;
    comparison: IndexComparison;
}

/**
 * Manages local file index for synchronization
 */
export class IndexManager {
    private plugin: DriveLinkPlugin;
    private index: FileIndex;

    constructor(plugin: DriveLinkPlugin) {
        this.plugin = plugin;
        this.index = this.createEmptyIndex();
    }

    /**
     * Initialize the index manager
     */
    async initialize(): Promise<void> {
        await this.loadIndex();
    }

    /**
     * Create an empty file index
     */
    private createEmptyIndex(): FileIndex {
        return {
            version: '1.0.0',
            lastUpdated: Date.now(),
            files: {},
            driveToLocal: {}
        };
    }

    /**
     * Load index from plugin storage
     */
    async loadIndex(): Promise<void> {
        try {
            const data = await this.plugin.loadData();
            if (data && data[INDEX_STORAGE_KEY]) {
                this.index = { ...this.createEmptyIndex(), ...data[INDEX_STORAGE_KEY] };
            }
        } catch (error) {
            console.error('Failed to load file index:', error);
            this.index = this.createEmptyIndex();
        }
    }

    /**
     * Save index to plugin storage
     */
    async saveIndex(): Promise<void> {
        try {
            this.index.lastUpdated = Date.now();
            const index = this.index;
            await this.plugin.updateData(data => {
                data[INDEX_STORAGE_KEY] = index;
            });
        } catch (error) {
            console.error('Failed to save file index:', error);
        }
    }

    /**
     * Get all files in the vault with their metadata
     */
    async scanVaultFiles(
        ignorePatterns: string[] = [],
        enableExtensionFiltering: boolean = false,
        allowedFileExtensions: string[] = [],
        allowFolders: boolean = true
    ): Promise<Map<string, TFile>> {
        const files = new Map<string, TFile>();
        const vault = this.plugin.app.vault;

        const allFiles = vault.getFiles();

        for (const file of allFiles) {
            // Check if file should be synced based on ignore patterns and extension filtering
            if (!shouldSyncFile(
                file.path,
                enableExtensionFiltering,
                allowedFileExtensions,
                ignorePatterns,
                false,
                allowFolders
            )) {
                continue;
            }

            files.set(file.path, file);
        }

        return files;
    }

    /**
     * Update index entry for a file
     */
    async updateFileEntry(
        file: TFile,
        driveId?: string,
        etag?: string,
        hash?: string
    ): Promise<void> {
        const stat = await this.plugin.app.vault.adapter.stat(file.path);

        const entry: LocalFileEntry = {
            path: file.path,
            size: stat?.size || 0,
            mtime: stat?.mtime || Date.now(),
            etag,
            driveId,
            hash,
            lastSyncTime: Date.now()
        };

        this.index.files[file.path] = entry;

        // Update drive-to-local mapping
        if (driveId) {
            this.index.driveToLocal[driveId] = file.path;
        }

        await this.saveIndex();
    }

    /**
     * Remove file entry from index
     */
    async removeFileEntry(path: string): Promise<void> {
        const entry = this.index.files[path];
        if (entry && entry.driveId) {
            delete this.index.driveToLocal[entry.driveId];
        }
        delete this.index.files[path];
        await this.saveIndex();
    }

    /**
     * Get file entry by path
     */
    getFileEntry(path: string): LocalFileEntry | undefined {
        return this.index.files[path];
    }

    /**
     * Get file path by Drive ID
     */
    getPathByDriveId(driveId: string): string | undefined {
        return this.index.driveToLocal[driveId];
    }

    /**
     * Get all indexed files
     */
    getAllIndexedFiles(): Record<string, LocalFileEntry> {
        return { ...this.index.files };
    }

    /**
     * Detect changes between local files and index
     */
    async detectLocalChanges(
        ignorePatterns: string[] = [],
        enableExtensionFiltering: boolean = false,
        allowedFileExtensions: string[] = [],
        allowFolders: boolean = true
    ): Promise<ChangeDetectionResult> {
        const currentFiles = await this.scanVaultFiles(
            ignorePatterns,
            enableExtensionFiltering,
            allowedFileExtensions,
            allowFolders
        );
        const comparison: IndexComparison = {
            localChanges: [],
            remoteChanges: [],
            newLocal: [],
            newRemote: [],
            deletedLocal: [],
            deletedRemote: [],
            conflicts: []
        };

        // Check for new and modified local files
        for (const [path, file] of currentFiles) {
            const indexEntry = this.index.files[path];

            if (!indexEntry) {
                // New local file
                comparison.newLocal.push(path);
            } else {
                // Check if file has been modified locally
                const stat = await this.plugin.app.vault.adapter.stat(path);
                const currentMtime = stat?.mtime || 0;
                const currentSize = stat?.size || 0;

                if (currentMtime > indexEntry.mtime || currentSize !== indexEntry.size) {
                    comparison.localChanges.push(path);
                }
            }
        }

        // Check for deleted local files
        for (const path of Object.keys(this.index.files)) {
            if (!currentFiles.has(path)) {
                comparison.deletedLocal.push(path);
            }
        }

        return {
            hasChanges: comparison.localChanges.length > 0 ||
                       comparison.newLocal.length > 0 ||
                       comparison.deletedLocal.length > 0,
            localFiles: currentFiles,
            comparison
        };
    }

    /**
     * Compare with remote Drive files
     */
    async compareWithRemoteFiles(
        remoteFiles: DriveFile[],
        remoteScope: RemoteScope,
        ignorePatterns: string[] = [],
        enableExtensionFiltering: boolean = false,
        allowedFileExtensions: string[] = [],
        allowFolders: boolean = true
    ): Promise<IndexComparison> {
        const localResult = await this.detectLocalChanges(
            ignorePatterns,
            enableExtensionFiltering,
            allowedFileExtensions,
            allowFolders
        );
        const comparison = localResult.comparison;

        // Create map of remote files by ID and path
        const remoteById = new Map<string, DriveFile>();
        const remoteByPath = new Map<string, DriveFile>();

        for (const remoteFile of remoteFiles) {
            remoteById.set(remoteFile.id, remoteFile);

            // Find local path for this remote file
            const localPath = this.getPathByDriveId(remoteFile.id);
            if (localPath) {
                remoteByPath.set(localPath, remoteFile);
            } else {
                // New remote file
                comparison.newRemote.push(remoteFile);
            }
        }

        const removedIds = new Set(remoteScope.removedIds || []);

        // Check for remote changes and conflicts
        for (const [path, indexEntry] of Object.entries(this.index.files)) {
            if (!indexEntry.driveId) continue;

            const remoteFile = remoteById.get(indexEntry.driveId);

            if (!remoteFile) {
                // Absent from a list of changed files only means unchanged;
                // a file counts as deleted when a full listing misses it or Drive reports it removed
                if (remoteScope.isComplete || removedIds.has(indexEntry.driveId)) {
                    comparison.deletedRemote.push(path);
                }
                continue;
            }

            // Check if remote file has changed
            const remoteModified = new Date(remoteFile.modifiedTime).getTime();
            const lastSyncTime = indexEntry.lastSyncTime || 0;

            if (remoteModified > lastSyncTime) {
                comparison.remoteChanges.push(path);

                // Check for conflicts (both local and remote changes)
                if (comparison.localChanges.includes(path)) {
                    comparison.conflicts.push(path);
                }
            }
        }

        return comparison;
    }

    /**
     * Generate unique conflict filename
     */
    generateConflictFilename(originalPath: string, timestamp?: number): string {
        const now = timestamp || Date.now();
        const date = new Date(now);
        const dateStr = date.toISOString().slice(0, 19).replace(/[:.]/g, '-');

        const pathParts = originalPath.split('.');
        const extension = pathParts.length > 1 ? pathParts.pop() : '';
        const baseName = pathParts.join('.');

        const conflictName = `${baseName} (conflict ${dateStr})`;
        return extension ? `${conflictName}.${extension}` : conflictName;
    }

    /**
     * Check if file should be ignored based on patterns
     */
    private shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean {
        for (const pattern of ignorePatterns) {
            if (this.matchesPattern(filePath, pattern)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Simple glob pattern matching
     */
    private matchesPattern(filePath: string, pattern: string): boolean {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\*\*/g, '.*') // ** matches any number of directories
            .replace(/\*/g, '[^/]*') // * matches any characters except /
            .replace(/\?/g, '[^/]') // ? matches single character except /
            .replace(/\./g, '\\.'); // Escape dots

        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(filePath);
    }

    /**
     * Get index statistics
     */
    getIndexStats(): {
        totalFiles: number;
        filesWithDriveId: number;
        lastUpdated: number;
        indexVersion: string;
    } {
        const totalFiles = Object.keys(this.index.files).length;
        const filesWithDriveId = Object.values(this.index.files)
            .filter(entry => entry.driveId).length;

        return {
            totalFiles,
            filesWithDriveId,
            lastUpdated: this.index.lastUpdated,
            indexVersion: this.index.version
        };
    }

    /**
     * Clear the entire index (useful for resetting sync)
     */
    async clearIndex(): Promise<void> {
        this.index = this.createEmptyIndex();
        await this.saveIndex();
    }

    /**
     * Rebuild index from current vault state
     */
    async rebuildIndex(
        ignorePatterns: string[] = [],
        enableExtensionFiltering: boolean = false,
        allowedFileExtensions: string[] = [],
        allowFolders: boolean = true
    ): Promise<void> {
        const files = await this.scanVaultFiles(
            ignorePatterns,
            enableExtensionFiltering,
            allowedFileExtensions,
            allowFolders
        );

        // Keep existing Drive mappings but update file metadata
        const newIndex = this.createEmptyIndex();

        for (const [path, file] of files) {
            const existingEntry = this.index.files[path];
            const stat = await this.plugin.app.vault.adapter.stat(path);

            const entry: LocalFileEntry = {
                path,
                size: stat?.size || 0,
                mtime: stat?.mtime || Date.now(),
                driveId: existingEntry?.driveId,
                etag: existingEntry?.etag,
                hash: existingEntry?.hash,
                lastSyncTime: existingEntry?.lastSyncTime
            };

            newIndex.files[path] = entry;

            if (entry.driveId) {
                newIndex.driveToLocal[entry.driveId] = path;
            }
        }

        this.index = newIndex;
        await this.saveIndex();
    }
}