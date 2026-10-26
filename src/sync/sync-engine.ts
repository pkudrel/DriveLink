import { App, TFile, Notice } from 'obsidian';
import type DriveLinkPlugin from '../main';
import { DriveClient, DriveFile } from '../drive/client';
import { DriveFileOperations, UploadOptions } from '../drive/file-operations';
import { DriveChangeDetection } from '../drive/change-detection';
import { IndexManager, IndexComparison, LocalFileEntry, RemoteScope } from './index-manager';
import { ConflictResolver } from './conflict-resolver';
import { DriveLinkSettings } from '../settings';
import { shouldSyncFile } from '../utils/extension-filter';
import { Logger } from '../utils/logger';

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
 * Remote files fetched for one sync run
 */
interface RemoteListing extends RemoteScope {
    files: DriveFile[];
    // Persists the change detection token; call only after a successful sync
    commit?: () => Promise<void>;
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
    private plugin: DriveLinkPlugin;
    private isSyncing = false;
    private logger = Logger.createComponentLogger('SyncEngine');

    constructor(
        app: App,
        driveClient: DriveClient,
        settings: DriveLinkSettings,
        plugin: DriveLinkPlugin
    ) {
        this.app = app;
        this.driveClient = driveClient;
        this.settings = settings;
        this.plugin = plugin;

        // Initialize components
        this.fileOperations = new DriveFileOperations(driveClient['tokenManager']);
        this.changeDetection = new DriveChangeDetection(driveClient['tokenManager'], plugin);
        this.indexManager = new IndexManager(plugin);
        this.conflictResolver = new ConflictResolver(app, this.indexManager);
    }

    /**
     * Initialize the sync engine
     */
    async initialize(): Promise<void> {
        // No change token is taken here: the first sync does a full scan and stores one
        await this.indexManager.initialize();
    }

    /**
     * Perform complete synchronization
     */
    async performSync(options: SyncOptions = {}): Promise<SyncResult> {
        if (this.isSyncing) {
            this.logger.warn('Sync attempt blocked - already in progress');
            throw new Error('Sync already in progress');
        }

        this.isSyncing = true;
        this.logger.info('Starting sync operation', { operation: 'performSync' });
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
            this.logger.debug('Getting remote files from Drive');
            const listing = await this.getRemoteFiles(options.onProgress);
            const remoteFiles = listing.files;
            this.logger.info(`Found ${remoteFiles.length} remote files`, {
                isComplete: listing.isComplete,
                removed: listing.removedIds?.length || 0
            });

            // Step 2: Detect changes
            if (options.onProgress) {
                options.onProgress('Detecting changes...', 0, 0);
            }

            this.logger.debug('Comparing with remote files', {
                ignoreGlobs: this.settings.ignoreGlobs,
                extensionFiltering: this.settings.enableExtensionFiltering
            });
            const comparison = await this.indexManager.compareWithRemoteFiles(
                remoteFiles,
                listing,
                this.settings.ignoreGlobs,
                this.settings.enableExtensionFiltering,
                this.settings.allowedFileExtensions,
                this.settings.allowFolders
            );

            // Log detailed comparison results
            this.logger.info('File comparison results', {
                localChanges: comparison.localChanges.length,
                remoteChanges: comparison.remoteChanges.length,
                newLocal: comparison.newLocal.length,
                newRemote: comparison.newRemote.length,
                deletedLocal: comparison.deletedLocal.length,
                deletedRemote: comparison.deletedRemote.length,
                conflicts: comparison.conflicts.length
            });

            // Calculate total operations based on sync mode
            let totalOps;
            if (this.settings.syncType === 'one-way') {
                // In one-way mode, only count downloads (no uploads or local deletions)
                totalOps = comparison.remoteChanges.length +
                          comparison.newRemote.length;
                this.logger.info('One-way sync: Operation count excludes uploads and local deletions');
            } else {
                // Full bidirectional sync - count all operations
                totalOps = comparison.localChanges.length +
                          comparison.remoteChanges.length +
                          comparison.newLocal.length +
                          comparison.newRemote.length +
                          comparison.deletedLocal.length +
                          comparison.deletedRemote.length;
            }

            if (totalOps === 0) {
                this.logger.info('No changes detected - sync complete');
                if (options.onProgress) {
                    options.onProgress('No changes detected', 0, 0);
                }

                await this.commitSuccessfulSync(listing, stats, options);
                stats.endTime = Date.now();
                stats.duration = stats.endTime - stats.startTime;

                return {
                    success: true,
                    stats
                };
            }

            this.logger.info(`Starting sync of ${totalOps} operations`, {
                syncType: this.settings.syncType
            });

            let conflicts: string[] = [];

            if (this.settings.syncType === 'one-way') {
                this.logger.info('One-way sync mode: Only downloading files from Drive');

                // In one-way mode, only download files from remote
                await this.downloadRemoteChanges(comparison, options, stats, remoteFiles);
            } else {
                // Full bidirectional sync

                // Step 3: Handle conflicts first
                conflicts = await this.resolveConflicts(comparison, options, stats);

                // Step 4: Upload new and changed local files
                await this.uploadLocalChanges(comparison, options, stats);

                // Step 5: Download new and changed remote files
                await this.downloadRemoteChanges(comparison, options, stats, remoteFiles);

                // Step 6: Handle deletions
                await this.handleDeletions(comparison, options, stats);
            }

            // Step 7: Update change detection token (disabled while using timestamp sync)
            // TODO: Re-enable when change detection is working properly
            // if (!options.dryRun) {
            //     try {
            //         await this.changeDetection.getAllChangesSinceLastCheck();
            //     } catch (error) {
            //         console.warn('Could not update change detection token:', error);
            //     }
            // }

            await this.commitSuccessfulSync(listing, stats, options);
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

            this.logger.error('Sync operation failed', error as Error, {
                duration: stats.duration,
                stats: stats
            });

            return {
                success: false,
                error: error.message,
                stats
            };
        } finally {
            this.isSyncing = false;
            this.logger.debug('Sync operation completed, releasing lock');
        }
    }

    /**
     * Store the change token and last sync time, only when the sync fully succeeded,
     * so a failed sync sees the same remote changes again
     */
    private async commitSuccessfulSync(
        listing: RemoteListing,
        stats: SyncStats,
        options: SyncOptions
    ): Promise<void> {
        if (stats.errors > 0 || options.dryRun) {
            return;
        }

        if (listing.commit) {
            await listing.commit();
        }

        // Sync start time, so remote changes made during the sync are picked up next time
        this.settings.lastSyncTime = new Date(stats.startTime).toISOString();
        try {
            await this.plugin.saveSettings();
            this.logger.debug('Updated last sync time', {
                lastSyncTime: this.settings.lastSyncTime
            });
        } catch (error) {
            this.logger.warn('Failed to save last sync time', error as Error);
        }
    }

    /**
     * Get files from the configured Drive folder: a full listing or only the changes
     */
    private async getRemoteFiles(onProgress?: SyncProgressCallback): Promise<RemoteListing> {
        const folderId = this.settings.driveFolderId;
        if (!folderId) {
            throw new Error('No Drive folder configured');
        }

        if (onProgress) {
            onProgress('Fetching remote files...', 0, 0);
        }

        let listing: RemoteListing;
        let syncStrategy: string;

        // Check if change detection should be disabled due to repeated failures
        const failureCount = this.settings.changeDetectionFailureCount || 0;
        const isDisabled = this.settings.disableChangeDetection || false;

        if (isDisabled || failureCount >= 3) {
            this.logger.info(`Change detection disabled due to repeated failures (count: ${failureCount}), using timestamp sync`);
            listing = await this.getRemoteFilesByTimestamp(onProgress);
            syncStrategy = listing.isComplete ? 'full' : 'fast-timestamp';
        } else {
            try {
                const changeResult = await this.changeDetection.getAllChangesSinceLastCheck(folderId);

                if (changeResult.needsFullScan) {
                    // Token taken before the scan, so changes made during the scan are seen next time
                    const startToken = await this.changeDetection.getStartPageToken();
                    this.logger.info('No usable change token - performing full scan');
                    const files = await this.getRemoteFilesRecursive(folderId, '', onProgress, false);
                    listing = {
                        files,
                        isComplete: true,
                        commit: () => this.changeDetection.commitPageToken(startToken, folderId, true)
                    };
                    syncStrategy = 'change-detection-full-scan';
                } else {
                    const newPageToken = changeResult.newPageToken!;
                    const { files, removedIds } = await this.getFilesFromChanges(changeResult.changes);
                    listing = {
                        files,
                        isComplete: false,
                        removedIds,
                        commit: () => this.changeDetection.commitPageToken(newPageToken, folderId, false)
                    };
                    syncStrategy = changeResult.changes.length === 0
                        ? 'change-detection-no-changes'
                        : 'change-detection-incremental';
                    this.logger.info(`Found ${changeResult.changes.length} changes via change detection`);
                }

                // Change detection succeeded, reset failure count
                if (failureCount > 0) {
                    this.settings.changeDetectionFailureCount = 0;
                    this.settings.disableChangeDetection = false;
                    await this.plugin.saveSettings();
                    this.logger.debug('Change detection succeeded, reset failure count');
                }
            } catch (changeDetectionError) {
                // Increment failure count and potentially disable change detection
                const newFailureCount = failureCount + 1;
                this.settings.changeDetectionFailureCount = newFailureCount;

                if (newFailureCount >= 3) {
                    this.settings.disableChangeDetection = true;
                    this.logger.warn(`Change detection failed ${newFailureCount} times, disabling for future syncs`, changeDetectionError as Error);
                } else {
                    this.logger.warn(`Change detection failed (${newFailureCount}/3), falling back to timestamp-based sync`, changeDetectionError as Error);
                }

                await this.plugin.saveSettings();

                listing = await this.getRemoteFilesByTimestamp(onProgress);
                syncStrategy = listing.isComplete ? 'full' : 'fast-timestamp';
            }
        }

        const allFiles = listing.files;

        // Log all remote files found with detailed filtering analysis
        this.logger.info('Remote files discovery complete', {
            totalFiles: allFiles.length,
            strategy: syncStrategy,
            isComplete: listing.isComplete,
            fileDetails: allFiles.map(f => ({
                name: f.name,
                path: f.path || f.name,
                mimeType: f.mimeType,
                size: f.size,
                modifiedTime: f.modifiedTime
            }))
        });

        // Show filtering analysis for each file
        console.log(`\n[SYNC DEBUG] Remote Files Filtering Analysis:`);
        console.log(`Extension filtering enabled: ${this.settings.enableExtensionFiltering}`);
        console.log(`Allowed extensions: [${this.settings.allowedFileExtensions.join(', ')}]`);
        console.log(`Ignore patterns: [${this.settings.ignoreGlobs.join(', ')}]`);
        console.log(`\nAnalyzing ${allFiles.length} remote files:`);

        allFiles.forEach(file => {
            const filePath = file.path || file.name;
            const shouldSync = shouldSyncFile(
                filePath,
                this.settings.enableExtensionFiltering,
                this.settings.allowedFileExtensions,
                this.settings.ignoreGlobs,
                true,
                this.settings.allowFolders,
                file.mimeType
            );
        });

        return listing;
    }

    /**
     * Timestamp-based listing: only files modified since the last sync, or everything on the first sync
     */
    private async getRemoteFilesByTimestamp(onProgress?: SyncProgressCallback): Promise<RemoteListing> {
        const fastSync = Boolean(this.settings.lastSyncTime);

        this.logger.info(`Fetching remote files from Drive folder (recursive, ${fastSync ? 'fast-timestamp' : 'full'} sync)`, {
            folderId: this.settings.driveFolderId,
            lastSyncTime: this.settings.lastSyncTime
        });

        const files = await this.getRemoteFilesRecursive(
            this.settings.driveFolderId,
            '',
            onProgress,
            fastSync
        );

        // A timestamp listing never reports deletions, so it is complete only without the filter
        return { files, isComplete: !fastSync };
    }

    /**
     * Recursively get all files from a folder and its subfolders
     */
    private async getRemoteFilesRecursive(
        folderId: string,
        parentPath: string = '',
        onProgress?: SyncProgressCallback,
        fastSync: boolean = false
    ): Promise<DriveFile[]> {
        const allFiles: DriveFile[] = [];
        let pageToken: string | undefined;

        // For fast sync, use recent-first ordering and optional timestamp filtering
        const orderBy = fastSync ? 'modifiedTime desc' : undefined;
        const modifiedSince = fastSync && this.settings.lastSyncTime ? this.settings.lastSyncTime : undefined;

        if (fastSync && modifiedSince) {
            this.logger.info(`Fast sync: only fetching files modified since ${modifiedSince}`);
        }

        do {
            const response = await this.driveClient.listFiles(
                folderId,
                pageToken,
                100,
                orderBy,
                modifiedSince
            );

            for (const file of response.files) {
                // Calculate the full path for this file
                const filePath = parentPath ? `${parentPath}/${file.name}` : file.name;

                // Add path property to the file
                const fileWithPath = { ...file, path: filePath };
                allFiles.push(fileWithPath);

                this.logger.debug('Found remote item', {
                    name: file.name,
                    path: filePath,
                    mimeType: file.mimeType,
                    isFolder: file.mimeType === 'application/vnd.google-apps.folder'
                });

                // If this is a folder, recursively get its contents
                // (in fast sync subfolders are walked below, unchanged ones included)
                if (!fastSync && file.mimeType === 'application/vnd.google-apps.folder') {
                    this.logger.debug(`Scanning folder: ${filePath}`);
                    const subFiles = await this.getRemoteFilesRecursive(file.id, filePath, onProgress, fastSync);
                    allFiles.push(...subFiles);
                }
            }

            pageToken = response.nextPageToken;

            if (onProgress) {
                onProgress(`Fetching remote files... (${allFiles.length} found)`, 0, 0);
            }
        } while (pageToken);

        if (fastSync) {
            // A folder's modifiedTime does not change when files inside it change,
            // so every subfolder has to be walked, not only the recently modified ones
            let folderPageToken: string | undefined;
            do {
                const response = await this.driveClient.listSubfolders(folderId, folderPageToken);
                for (const folder of response.files) {
                    const folderPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
                    const subFiles = await this.getRemoteFilesRecursive(folder.id, folderPath, onProgress, fastSync);
                    allFiles.push(...subFiles);
                }
                folderPageToken = response.nextPageToken;
            } while (folderPageToken);
        }

        return allFiles;
    }

    /**
     * Convert change detection results to DriveFile format
     */
    private async getFilesFromChanges(changes: any[]): Promise<{ files: DriveFile[]; removedIds: string[] }> {
        const files: DriveFile[] = [];
        const removedIds: string[] = [];

        for (const change of changes) {
            if (change.removed || change.file?.trashed) {
                this.logger.debug('File was removed', { fileId: change.fileId });
                removedIds.push(change.fileId);
                continue;
            }

            if (change.file) {
                // Resolve the full path by looking up parent folders
                const fullPath = await this.resolveFilePathFromParents(change.file);
                const fileWithPath = { ...change.file, path: fullPath };
                files.push(fileWithPath);

                this.logger.debug('Found changed file', {
                    name: change.file.name,
                    fileId: change.file.id,
                    mimeType: change.file.mimeType,
                    path: fullPath,
                    parents: change.file.parents
                });
            }
        }

        return { files, removedIds };
    }

    /**
     * Resolve the full path of a file by traversing its parent folders
     */
    private async resolveFilePathFromParents(file: any): Promise<string> {
        if (!file.parents || file.parents.length === 0) {
            return file.name;
        }

        const parentId = file.parents[0]; // Use the first parent

        // If the parent is the root folder we're syncing from, file is at root level
        if (parentId === this.settings.driveFolderId) {
            return file.name;
        }

        try {
            // Get parent folder information
            const parentFolder = await this.driveClient.getFileMetadata(parentId);

            if (!parentFolder) {
                this.logger.warn('Could not resolve parent folder', { parentId, fileName: file.name });
                return file.name;
            }

            // Recursively resolve parent path
            const parentPath = await this.resolveFilePathFromParents(parentFolder);

            // Build full path
            const fullPath = parentPath ? `${parentPath}/${file.name}` : file.name;

            this.logger.debug('Resolved file path', {
                fileName: file.name,
                parentId,
                parentName: parentFolder.name,
                parentPath,
                fullPath
            });

            return fullPath;

        } catch (error) {
            this.logger.error('Error resolving parent folder path', error as Error, {
                parentId,
                fileName: file.name
            });
            return file.name; // Fallback to just filename
        }
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

        // Upload files in parallel batches for better performance
        const batchSize = this.settings.concurrentUploads;
        for (let i = 0; i < filesToUpload.length; i += batchSize) {
            const batch = filesToUpload.slice(i, i + batchSize);

            if (options.onProgress) {
                options.onProgress('Uploading files', i, filesToUpload.length, `Batch ${Math.floor(i/batchSize) + 1}`);
            }

            if (!options.dryRun) {
                // Process batch in parallel
                const uploadPromises = batch.map(async (filePath) => {
                    try {
                        await this.uploadFile(filePath);
                        stats.filesUploaded++;
                        this.logger.debug(`Uploaded: ${filePath}`);
                    } catch (error) {
                        console.error(`Failed to upload ${filePath}:`, error);
                        stats.errors++;
                    }
                });

                await Promise.all(uploadPromises);
            }
        }
    }

    /**
     * Download new and changed remote files
     */
    private async downloadRemoteChanges(
        comparison: IndexComparison,
        options: SyncOptions,
        stats: SyncStats,
        allRemoteFiles?: DriveFile[]
    ): Promise<void> {
        const filesToDownload: DriveFile[] = [];

        // Include new remote files (filter by extensions)
        console.log(`\n[SYNC DEBUG] Filtering new remote files for download:`);
        for (const remoteFile of comparison.newRemote) {
            const filePath = remoteFile.path || remoteFile.name;
            if (shouldSyncFile(
                filePath,
                this.settings.enableExtensionFiltering,
                this.settings.allowedFileExtensions,
                this.settings.ignoreGlobs,
                true,
                this.settings.allowFolders,
                remoteFile.mimeType
            )) {
                filesToDownload.push(remoteFile);
            }
        }

        // Build a lookup for remote files
        const remoteById = new Map<string, DriveFile>();
        if (allRemoteFiles) {
            for (const rf of allRemoteFiles) {
                remoteById.set(rf.id, rf);
            }
        }

        // Add changed remote files mapped by Drive ID
        for (const path of comparison.remoteChanges) {
            const entry = this.indexManager.getFileEntry(path);
            if (!entry?.driveId) continue;
            const rf = remoteById.get(entry.driveId);
            if (rf) filesToDownload.push(rf);
        }

        // Download files in parallel batches for better performance
        const batchSize = this.settings.concurrentDownloads;
        for (let i = 0; i < filesToDownload.length; i += batchSize) {
            const batch = filesToDownload.slice(i, i + batchSize);

            if (options.onProgress) {
                options.onProgress('Downloading files', i, filesToDownload.length, `Batch ${Math.floor(i/batchSize) + 1}`);
            }

            if (!options.dryRun) {
                // Process batch in parallel
                const downloadPromises = batch.map(async (remoteFile) => {
                    try {
                        await this.downloadFile(remoteFile);
                        stats.filesDownloaded++;
                        this.logger.debug(`Downloaded: ${remoteFile.path || remoteFile.name}`);
                    } catch (error) {
                        console.error(`Failed to download ${remoteFile.name}:`, error);
                        stats.errors++;
                    }
                });

                await Promise.all(downloadPromises);
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
                        // System trash when allowed, otherwise the vault's .trash folder
                        await this.app.vault.trash(file, true);
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
                        await this.driveClient.trashFile(entry.driveId);
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
            undefined // etag not available in Drive API v3
        );
    }

    /**
     * Download a single file or create a folder
     */
    private async downloadFile(remoteFile: DriveFile): Promise<void> {
        // Determine local path - use full path if available
        let localPath = this.indexManager.getPathByDriveId(remoteFile.id);
        if (!localPath) {
            localPath = remoteFile.path || remoteFile.name;
        }

        // Check if this is a Google Workspace document that should be ignored
        const isGoogleDoc = remoteFile.mimeType === 'application/vnd.google-apps.document' ||
                           remoteFile.mimeType === 'application/vnd.google-apps.spreadsheet' ||
                           remoteFile.mimeType === 'application/vnd.google-apps.presentation' ||
                           remoteFile.mimeType === 'application/vnd.google-apps.form' ||
                           remoteFile.mimeType === 'application/vnd.google-apps.map';

        // Also check for files that might be Google Docs without proper mimeType
        const suspiciousFile = !remoteFile.mimeType && !localPath.includes('.') && remoteFile.id.length < 20;

        if (isGoogleDoc || suspiciousFile) {
            this.logger.debug(`Ignoring Google Workspace document: ${localPath}`, {
                driveId: remoteFile.id,
                mimeType: remoteFile.mimeType,
                suspicious: suspiciousFile,
                reason: isGoogleDoc ? 'Known Google Workspace mimeType' : 'Suspicious file pattern'
            });
            return; // Skip Google Docs/Sheets/Slides/Forms
        }

        // Check if this is a folder (Google Drive folders have specific mimeType)
        const isFolder = remoteFile.mimeType === 'application/vnd.google-apps.folder' ||
                        (!remoteFile.mimeType && !localPath.includes('.'));

        if (isFolder) {
            // Skip folders that start with "." (like .git, .obsidian, .vscode, etc.)
            const folderName = localPath.split('/').pop() || '';
            if (folderName.startsWith('.')) {
                this.logger.debug(`Ignoring dot folder: ${localPath}`, {
                    driveId: remoteFile.id,
                    reason: 'Folder name starts with dot'
                });
                return; // Skip dot folders
            }

            this.logger.debug(`Creating folder: ${localPath}`, {
                driveId: remoteFile.id,
                mimeType: remoteFile.mimeType
            });

            // Ensure parent directories exist first
            await this.ensureParentDirectoriesExist(localPath + '/dummy'); // Add dummy file to get parent dirs

            // Create folder locally if it doesn't exist
            const existing = this.app.vault.getAbstractFileByPath(localPath);
            if (!existing) {
                try {
                    await this.app.vault.createFolder(localPath);
                    this.logger.info(`Created folder: ${localPath}`);
                } catch (error) {
                    if (error.message?.includes('already exists')) {
                        this.logger.debug(`Folder already exists: ${localPath}`);
                    } else {
                        throw error;
                    }
                }
            }

            // Update index for folder (folders don't have file objects, so we'll handle this differently)
            // For now, we'll skip index updates for folders
            this.logger.debug(`Folder sync completed: ${localPath}`);
            return;
        }

        // Handle regular files
        // Skip files that are inside folders starting with "."
        const pathParts = localPath.split('/');
        const hasDotFolder = pathParts.some(part => part.startsWith('.') && part !== '.');
        if (hasDotFolder) {
            this.logger.debug(`Ignoring file in dot folder: ${localPath}`, {
                driveId: remoteFile.id,
                reason: 'File is inside a folder that starts with dot'
            });
            return; // Skip files in dot folders
        }

        const content = await this.fileOperations.downloadFile(remoteFile.id);

        // Ensure parent directories exist
        await this.ensureParentDirectoriesExist(localPath);

        // Create or update file in vault
        const arrayBuffer = new Uint8Array(content);
        const existing = this.app.vault.getAbstractFileByPath(localPath);
        if (existing instanceof TFile) {
            await this.app.vault.modifyBinary(existing, arrayBuffer);
            await this.indexManager.updateFileEntry(existing, remoteFile.id, undefined);
            return;
        }

        // Create new file if it doesn't exist
        try {
            await this.app.vault.createBinary(localPath, arrayBuffer);
            const created = this.app.vault.getAbstractFileByPath(localPath);
            if (created instanceof TFile) {
                await this.indexManager.updateFileEntry(created, remoteFile.id, undefined);
            }
        } catch (error) {
            if (error.message?.includes('already exists') || error.message?.includes('File already exists')) {
                // File was created by another process, try to update it instead
                this.logger.debug(`File already exists, updating instead: ${localPath}`);
                const existing = this.app.vault.getAbstractFileByPath(localPath);
                if (existing instanceof TFile) {
                    await this.app.vault.modifyBinary(existing, arrayBuffer);
                    await this.indexManager.updateFileEntry(existing, remoteFile.id, undefined);
                } else {
                    // If file exists but can't be retrieved, try to delete and recreate
                    this.logger.warn(`File exists but couldn't retrieve it, attempting to recreate: ${localPath}`);
                    try {
                        // Try to delete the existing file/path and recreate
                        await this.app.vault.adapter.remove(localPath);
                        const created = await this.app.vault.createBinary(localPath, arrayBuffer);
                        await this.indexManager.updateFileEntry(created, remoteFile.id, undefined);
                    } catch (recreateError) {
                        this.logger.error(`Failed to recreate file: ${localPath}`, recreateError);
                        throw recreateError;
                    }
                }
            } else {
                throw error;
            }
        }
    }

    /**
     * Ensure all parent directories exist for a given file path
     */
    private async ensureParentDirectoriesExist(filePath: string): Promise<void> {
        const pathParts = filePath.split('/');

        // Remove the filename, keep only directory parts
        const directoryParts = pathParts.slice(0, -1);

        if (directoryParts.length === 0) {
            return; // File is in root, no directories to create
        }

        // Build directory path incrementally
        let currentPath = '';
        for (const part of directoryParts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            // Check if directory exists
            const existing = this.app.vault.getAbstractFileByPath(currentPath);
            if (!existing) {
                try {
                    await this.app.vault.createFolder(currentPath);
                    this.logger.debug(`Created directory: ${currentPath}`);
                } catch (error) {
                    if (error.message?.includes('already exists')) {
                        this.logger.debug(`Directory already exists: ${currentPath}`);
                    } else {
                        this.logger.error(`Failed to create directory: ${currentPath}`, error as Error);
                        throw error;
                    }
                }
            }
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

    /**
     * Reset change detection to force fresh token
     */
    async resetChangeDetection(): Promise<void> {
        this.logger.info('Manually resetting change detection');
        await this.changeDetection.forceResetChangeDetection();
    }
}
