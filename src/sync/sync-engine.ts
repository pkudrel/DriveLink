import { App, TFile, Notice, Plugin } from 'obsidian';
import { DriveClient, DriveFile } from '../drive/client';
import { DriveFileOperations, UploadOptions } from '../drive/file-operations';
import { DriveChangeDetection } from '../drive/change-detection';
import { IndexManager, IndexComparison, LocalFileEntry } from './index-manager';
import { ConflictResolver } from './conflict-resolver';
import { DriveLinkSettings } from '../settings';

/**
 * Sync operation result
 */
export interface SyncResult {
    success: boolean;
    error?: string;
    stats: SyncStats;
    conflicts?: string[];
}

/**
 * Sync statistics
 */
export interface SyncStats {
    filesUploaded: number;
    filesDownloaded: number;
    filesDeleted: number;
    conflictsResolved: number;
    errors: number;
    startTime: number;
    endTime: number;
    duration: number;
}

/**
 * Sync progress callback
 */
export type SyncProgressCallback = (
    operation: string,
    current: number,
    total: number,
    fileName?: string
) => void;

/**
 * Sync options
 */
export interface SyncOptions {
    onProgress?: SyncProgressCallback;
    dryRun?: boolean; // Preview changes without applying them
    forceFullSync?: boolean; // Ignore change detection and sync everything
}

/**
 * Main synchronization engine
 */
export class SyncEngine {
    private app: App;
    private driveClient: DriveClient;
    private fileOperations: DriveFileOperations;
    private changeDetection: DriveChangeDetection;
    private indexManager: IndexManager;
    private conflictResolver: ConflictResolver;
    private settings: DriveLinkSettings;
    private isSyncing = false;

    constructor(
        app: App,
        driveClient: DriveClient,
        settings: DriveLinkSettings,
        plugin: Plugin
    ) {
        this.app = app;
        this.driveClient = driveClient;
        this.settings = settings;

        // Initialize components
        this.fileOperations = new DriveFileOperations(driveClient['tokenManager']);
        this.changeDetection = new DriveChangeDetection(driveClient['tokenManager']);
        this.indexManager = new IndexManager(plugin);
        this.conflictResolver = new ConflictResolver(app, this.indexManager);
    }

    /**
     * Initialize the sync engine
     */
    async initialize(): Promise<void> {
        await this.indexManager.initialize();

        // Initialize change detection if not already done
        try {
            const hasToken = await this.changeDetection.getChangeDetectionStats();
            if (!hasToken.hasStoredToken) {
                await this.changeDetection.initializeChangeDetection();
            }
        } catch (error) {
            console.warn('Could not initialize change detection:', error);
        }
    }

    /**
     * Perform complete synchronization
     */
    async performSync(options: SyncOptions = {}): Promise<SyncResult> {
        if (this.isSyncing) {
            throw new Error('Sync already in progress');
        }

        this.isSyncing = true;
        const stats: SyncStats = {
            filesUploaded: 0,
            filesDownloaded: 0,
            filesDeleted: 0,
            conflictsResolved: 0,
            errors: 0,
            startTime: Date.now(),
            endTime: 0,
            duration: 0
        };

        try {
            if (options.onProgress) {
                options.onProgress('Starting sync...', 0, 0);
            }

            // Step 1: Get remote files from Drive folder
            const remoteFiles = await this.getRemoteFiles(options.onProgress);

            // Step 2: Detect changes
            if (options.onProgress) {
                options.onProgress('Detecting changes...', 0, 0);
            }

            const comparison = await this.indexManager.compareWithRemoteFiles(
                remoteFiles,
                this.settings.ignoreGlobs
            );

            // Calculate total operations
            const totalOps = comparison.localChanges.length +
                            comparison.remoteChanges.length +
                            comparison.newLocal.length +
                            comparison.newRemote.length +
                            comparison.deletedLocal.length +
                            comparison.deletedRemote.length;

            if (totalOps === 0) {
                if (options.onProgress) {
                    options.onProgress('No changes detected', 0, 0);
                }

                stats.endTime = Date.now();
                stats.duration = stats.endTime - stats.startTime;

                return {
                    success: true,
                    stats
                };
            }

            // Step 3: Handle conflicts first
            const conflicts = await this.resolveConflicts(comparison, options, stats);

            // Step 4: Upload new and changed local files
            await this.uploadLocalChanges(comparison, options, stats);

            // Step 5: Download new and changed remote files
            await this.downloadRemoteChanges(comparison, options, stats);

            // Step 6: Handle deletions
            await this.handleDeletions(comparison, options, stats);

            // Step 7: Update change detection token
            if (!options.dryRun) {
                try {
                    await this.changeDetection.getAllChangesSinceLastCheck();
                } catch (error) {
                    console.warn('Could not update change detection token:', error);
                }
            }

            stats.endTime = Date.now();
            stats.duration = stats.endTime - stats.startTime;

            if (options.onProgress) {
                options.onProgress('Sync completed', totalOps, totalOps);
            }

            return {
                success: stats.errors === 0,
                stats,
                conflicts
            };

        } catch (error) {
            stats.errors++;
            stats.endTime = Date.now();
            stats.duration = stats.endTime - stats.startTime;

            return {
                success: false,
                error: error.message,
                stats
            };
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Get all files from the configured Drive folder
     */
    private async getRemoteFiles(onProgress?: SyncProgressCallback): Promise<DriveFile[]> {
        if (!this.settings.driveFolderId) {
            throw new Error('No Drive folder configured');
        }

        if (onProgress) {
            onProgress('Fetching remote files...', 0, 0);
        }

        const allFiles: DriveFile[] = [];
        let pageToken: string | undefined;

        do {
            const response = await this.driveClient.listFiles(
                this.settings.driveFolderId,
                pageToken,
                100
            );

            allFiles.push(...response.files);
            pageToken = response.nextPageToken;

            if (onProgress) {
                onProgress(`Fetching remote files... (${allFiles.length} found)`, 0, 0);
            }
        } while (pageToken);

        return allFiles;
    }

    /**
     * Resolve conflicts between local and remote changes
     */
    private async resolveConflicts(
        comparison: IndexComparison,
        options: SyncOptions,
        stats: SyncStats
    ): Promise<string[]> {
        const conflicts: string[] = [];

        for (const filePath of comparison.conflicts) {
            try {
                if (options.onProgress) {
                    options.onProgress('Resolving conflicts', conflicts.length, comparison.conflicts.length, filePath);
                }

                if (!options.dryRun) {
                    const resolved = await this.conflictResolver.resolveConflict(
                        filePath,
                        this.settings.conflictResolution
                    );

                    if (resolved) {
                        stats.conflictsResolved++;
                    } else {
                        conflicts.push(filePath);
                    }
                }
            } catch (error) {
                console.error(`Failed to resolve conflict for ${filePath}:`, error);
                stats.errors++;
                conflicts.push(filePath);
            }
        }

        return conflicts;
    }

    /**
     * Upload new and changed local files
     */
    private async uploadLocalChanges(
        comparison: IndexComparison,
        options: SyncOptions,
        stats: SyncStats
    ): Promise<void> {
        const filesToUpload = [...comparison.newLocal, ...comparison.localChanges];

        for (let i = 0; i < filesToUpload.length; i++) {
            const filePath = filesToUpload[i];

            try {
                if (options.onProgress) {
                    options.onProgress('Uploading files', i, filesToUpload.length, filePath);
                }

                if (!options.dryRun) {
                    await this.uploadFile(filePath);
                    stats.filesUploaded++;
                }
            } catch (error) {
                console.error(`Failed to upload ${filePath}:`, error);
                stats.errors++;
            }
        }
    }

    /**
     * Download new and changed remote files
     */
    private async downloadRemoteChanges(
        comparison: IndexComparison,
        options: SyncOptions,
        stats: SyncStats
    ): Promise<void> {
        const filesToDownload = [...comparison.newRemote, ...comparison.remoteChanges.map(path => {
            const entry = this.indexManager.getFileEntry(path);
            return comparison.newRemote.find(f => f.id === entry?.driveId);
        }).filter(Boolean)];

        for (let i = 0; i < filesToDownload.length; i++) {
            const remoteFile = filesToDownload[i];

            try {
                if (options.onProgress) {
                    options.onProgress('Downloading files', i, filesToDownload.length, remoteFile.name);
                }

                if (!options.dryRun) {
                    await this.downloadFile(remoteFile);
                    stats.filesDownloaded++;
                }
            } catch (error) {
                console.error(`Failed to download ${remoteFile.name}:`, error);
                stats.errors++;
            }
        }
    }

    /**
     * Handle file deletions
     */
    private async handleDeletions(
        comparison: IndexComparison,
        options: SyncOptions,
        stats: SyncStats
    ): Promise<void> {
        // Handle remote deletions (delete local files)
        for (const filePath of comparison.deletedRemote) {
            try {
                if (options.onProgress) {
                    options.onProgress('Processing deletions', 0, 0, filePath);
                }

                if (!options.dryRun) {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file instanceof TFile) {
                        await this.app.vault.delete(file);
                    }
                    await this.indexManager.removeFileEntry(filePath);
                    stats.filesDeleted++;
                }
            } catch (error) {
                console.error(`Failed to delete local file ${filePath}:`, error);
                stats.errors++;
            }
        }

        // Handle local deletions (delete remote files)
        for (const filePath of comparison.deletedLocal) {
            try {
                const entry = this.indexManager.getFileEntry(filePath);
                if (entry?.driveId) {
                    if (!options.dryRun) {
                        await this.driveClient.deleteFile(entry.driveId);
                        await this.indexManager.removeFileEntry(filePath);
                        stats.filesDeleted++;
                    }
                }
            } catch (error) {
                console.error(`Failed to delete remote file ${filePath}:`, error);
                stats.errors++;
            }
        }
    }

    /**
     * Upload a single file
     */
    private async uploadFile(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = await this.app.vault.readBinary(file);
        const mimeType = this.getMimeType(file.extension);

        const existingEntry = this.indexManager.getFileEntry(filePath);
        const uploadOptions: UploadOptions = {
            parentId: this.settings.driveFolderId
        };

        let result;
        if (existingEntry?.driveId) {
            // Update existing file
            result = await this.fileOperations.updateFile(
                existingEntry.driveId,
                content,
                uploadOptions
            );
        } else {
            // Upload new file
            const uploadResult = await this.fileOperations.uploadFile(
                file.name,
                content,
                mimeType,
                uploadOptions
            );
            result = uploadResult.file;
        }

        // Update index
        await this.indexManager.updateFileEntry(
            file,
            result.id,
            result.etag
        );
    }

    /**
     * Download a single file
     */
    private async downloadFile(remoteFile: DriveFile): Promise<void> {
        const content = await this.fileOperations.downloadFile(remoteFile.id);

        // Determine local path
        let localPath = this.indexManager.getPathByDriveId(remoteFile.id);
        if (!localPath) {
            localPath = remoteFile.name;
        }

        // Write file to vault
        const arrayBuffer = new Uint8Array(content);
        await this.app.vault.createBinary(localPath, arrayBuffer);

        // Get the created file
        const file = this.app.vault.getAbstractFileByPath(localPath);
        if (file instanceof TFile) {
            await this.indexManager.updateFileEntry(
                file,
                remoteFile.id,
                remoteFile.etag
            );
        }
    }

    /**
     * Get MIME type for file extension
     */
    private getMimeType(extension: string): string {
        const mimeTypes: Record<string, string> = {
            'md': 'text/markdown',
            'txt': 'text/plain',
            'json': 'application/json',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'pdf': 'application/pdf'
        };

        return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }

    /**
     * Check if sync is currently running
     */
    isSyncInProgress(): boolean {
        return this.isSyncing;
    }

    /**
     * Get sync engine status
     */
    async getStatus(): Promise<{
        isInitialized: boolean;
        lastSyncTime?: number;
        indexStats: any;
        changeDetectionStats: any;
    }> {
        return {
            isInitialized: true,
            indexStats: this.indexManager.getIndexStats(),
            changeDetectionStats: await this.changeDetection.getChangeDetectionStats()
        };
    }
}