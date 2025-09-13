import { App, TFile, Notice } from 'obsidian';
import { IndexManager, LocalFileEntry } from './index-manager';

/**
 * Conflict resolution strategies
 */
export type ConflictResolution = 'last-writer-wins' | 'manual';

/**
 * Conflict information
 */
export interface ConflictInfo {
    filePath: string;
    localModified: number;
    remoteModified: number;
    localSize: number;
    remoteSize: number;
    hasLocalChanges: boolean;
    hasRemoteChanges: boolean;
}

/**
 * Conflict resolution result
 */
export interface ConflictResolutionResult {
    resolved: boolean;
    action: 'keep-local' | 'keep-remote' | 'backup-both' | 'manual-required';
    backupPath?: string;
    error?: string;
}

/**
 * Handles conflict resolution during synchronization
 */
export class ConflictResolver {
    private app: App;
    private indexManager: IndexManager;

    constructor(app: App, indexManager: IndexManager) {
        this.app = app;
        this.indexManager = indexManager;
    }

    /**
     * Resolve a conflict between local and remote file versions
     */
    async resolveConflict(
        filePath: string,
        strategy: ConflictResolution = 'last-writer-wins'
    ): Promise<boolean> {
        try {
            const conflictInfo = await this.analyzeConflict(filePath);

            if (!conflictInfo) {
                console.warn(`Could not analyze conflict for ${filePath}`);
                return false;
            }

            const result = await this.applyResolutionStrategy(conflictInfo, strategy);

            if (result.resolved) {
                console.log(`Conflict resolved for ${filePath}: ${result.action}`);

                if (result.backupPath) {
                    new Notice(`Conflict resolved: backup saved as ${result.backupPath}`);
                }

                return true;
            } else {
                console.warn(`Could not resolve conflict for ${filePath}: ${result.error}`);
                new Notice(`Conflict resolution failed for ${filePath}`);
                return false;
            }

        } catch (error) {
            console.error(`Error resolving conflict for ${filePath}:`, error);
            return false;
        }
    }

    /**
     * Analyze the conflict to gather information
     */
    private async analyzeConflict(filePath: string): Promise<ConflictInfo | null> {
        const indexEntry = this.indexManager.getFileEntry(filePath);
        if (!indexEntry) {
            return null;
        }

        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            return null;
        }

        try {
            const stat = await this.app.vault.adapter.stat(filePath);
            const localModified = stat?.mtime || 0;
            const localSize = stat?.size || 0;

            // Note: In a real implementation, you would get remote file info
            // from the Drive API. For this example, we'll use placeholder values.
            const remoteModified = Date.now(); // Placeholder
            const remoteSize = localSize; // Placeholder

            return {
                filePath,
                localModified,
                remoteModified,
                localSize,
                remoteSize,
                hasLocalChanges: localModified > (indexEntry.lastSyncTime || 0),
                hasRemoteChanges: remoteModified > (indexEntry.lastSyncTime || 0)
            };

        } catch (error) {
            console.error(`Failed to analyze conflict for ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Apply the chosen resolution strategy
     */
    private async applyResolutionStrategy(
        conflictInfo: ConflictInfo,
        strategy: ConflictResolution
    ): Promise<ConflictResolutionResult> {
        switch (strategy) {
            case 'last-writer-wins':
                return await this.resolveLastWriterWins(conflictInfo);

            case 'manual':
                return await this.requireManualResolution(conflictInfo);

            default:
                return {
                    resolved: false,
                    action: 'manual-required',
                    error: `Unknown resolution strategy: ${strategy}`
                };
        }
    }

    /**
     * Resolve using last-writer-wins strategy
     */
    private async resolveLastWriterWins(
        conflictInfo: ConflictInfo
    ): Promise<ConflictResolutionResult> {
        const { filePath, localModified, remoteModified } = conflictInfo;

        try {
            // Create backup of the losing version
            let backupPath: string | undefined;

            if (localModified > remoteModified) {
                // Local wins, backup remote version (if we had it)
                // Note: In real implementation, you'd download and backup the remote version
                backupPath = await this.createRemoteBackup(filePath);

                return {
                    resolved: true,
                    action: 'keep-local',
                    backupPath
                };
            } else {
                // Remote wins, backup local version
                backupPath = await this.createLocalBackup(filePath);

                // Note: In real implementation, you'd download the remote version here
                // For now, we'll just indicate that remote should be downloaded

                return {
                    resolved: true,
                    action: 'keep-remote',
                    backupPath
                };
            }

        } catch (error) {
            return {
                resolved: false,
                action: 'manual-required',
                error: error.message
            };
        }
    }

    /**
     * Require manual resolution
     */
    private async requireManualResolution(
        conflictInfo: ConflictInfo
    ): Promise<ConflictResolutionResult> {
        // Create backups of both versions for manual inspection
        try {
            const localBackupPath = await this.createLocalBackup(conflictInfo.filePath);
            const remoteBackupPath = await this.createRemoteBackup(conflictInfo.filePath);

            new Notice(
                `Manual conflict resolution required for ${conflictInfo.filePath}. ` +
                `Check backup files: ${localBackupPath}, ${remoteBackupPath}`
            );

            return {
                resolved: false,
                action: 'manual-required',
                backupPath: localBackupPath
            };

        } catch (error) {
            return {
                resolved: false,
                action: 'manual-required',
                error: error.message
            };
        }
    }

    /**
     * Create backup of local file version
     */
    private async createLocalBackup(filePath: string): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const backupPath = this.indexManager.generateConflictFilename(
            filePath,
            Date.now()
        );

        try {
            const content = await this.app.vault.read(file);
            await this.app.vault.create(backupPath, content);

            console.log(`Created local backup: ${backupPath}`);
            return backupPath;

        } catch (error) {
            throw new Error(`Failed to create local backup: ${error.message}`);
        }
    }

    /**
     * Create backup of remote file version
     */
    private async createRemoteBackup(filePath: string): Promise<string> {
        // Note: In a real implementation, this would download the remote version
        // and save it as a backup. For this example, we'll create a placeholder.

        const backupPath = this.indexManager.generateConflictFilename(
            filePath.replace(/\.([^.]+)$/, ' (remote).$1'),
            Date.now()
        );

        try {
            // Placeholder: In real implementation, download remote content here
            const placeholderContent = `# Remote version backup\n\nThis would contain the remote version of ${filePath}`;
            await this.app.vault.create(backupPath, placeholderContent);

            console.log(`Created remote backup placeholder: ${backupPath}`);
            return backupPath;

        } catch (error) {
            throw new Error(`Failed to create remote backup: ${error.message}`);
        }
    }

    /**
     * Check if a file has conflicts
     */
    async hasConflict(filePath: string): Promise<boolean> {
        const conflictInfo = await this.analyzeConflict(filePath);
        return conflictInfo ?
            (conflictInfo.hasLocalChanges && conflictInfo.hasRemoteChanges) :
            false;
    }

    /**
     * Get list of all files with conflicts
     */
    async getConflictedFiles(): Promise<string[]> {
        const indexedFiles = this.indexManager.getAllIndexedFiles();
        const conflictedFiles: string[] = [];

        for (const filePath of Object.keys(indexedFiles)) {
            if (await this.hasConflict(filePath)) {
                conflictedFiles.push(filePath);
            }
        }

        return conflictedFiles;
    }

    /**
     * Resolve all conflicts using the specified strategy
     */
    async resolveAllConflicts(strategy: ConflictResolution): Promise<{
        resolved: number;
        failed: number;
        total: number;
    }> {
        const conflictedFiles = await this.getConflictedFiles();
        let resolved = 0;
        let failed = 0;

        for (const filePath of conflictedFiles) {
            try {
                const success = await this.resolveConflict(filePath, strategy);
                if (success) {
                    resolved++;
                } else {
                    failed++;
                }
            } catch (error) {
                console.error(`Failed to resolve conflict for ${filePath}:`, error);
                failed++;
            }
        }

        return {
            resolved,
            failed,
            total: conflictedFiles.length
        };
    }

    /**
     * Preview conflict resolution without applying changes
     */
    async previewConflictResolution(
        filePath: string,
        strategy: ConflictResolution
    ): Promise<{
        action: string;
        description: string;
        willCreateBackup: boolean;
        backupPath?: string;
    }> {
        const conflictInfo = await this.analyzeConflict(filePath);

        if (!conflictInfo) {
            return {
                action: 'no-conflict',
                description: 'No conflict detected',
                willCreateBackup: false
            };
        }

        switch (strategy) {
            case 'last-writer-wins':
                const winner = conflictInfo.localModified > conflictInfo.remoteModified ? 'local' : 'remote';
                const backupPath = this.indexManager.generateConflictFilename(filePath);

                return {
                    action: winner === 'local' ? 'keep-local' : 'keep-remote',
                    description: `Keep ${winner} version (modified ${new Date(
                        winner === 'local' ? conflictInfo.localModified : conflictInfo.remoteModified
                    ).toLocaleString()}), backup the other`,
                    willCreateBackup: true,
                    backupPath
                };

            case 'manual':
                return {
                    action: 'manual-required',
                    description: 'Create backups of both versions for manual resolution',
                    willCreateBackup: true,
                    backupPath: this.indexManager.generateConflictFilename(filePath)
                };

            default:
                return {
                    action: 'unknown',
                    description: `Unknown strategy: ${strategy}`,
                    willCreateBackup: false
                };
        }
    }

    /**
     * Clean up old conflict backup files
     */
    async cleanupOldBackups(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
        // Find files that look like conflict backups
        const allFiles = this.app.vault.getMarkdownFiles();
        const conflictPattern = /\(conflict \d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\)/;

        let cleaned = 0;
        const now = Date.now();

        for (const file of allFiles) {
            if (conflictPattern.test(file.name)) {
                try {
                    const stat = await this.app.vault.adapter.stat(file.path);
                    const fileAge = now - (stat?.mtime || 0);

                    if (fileAge > maxAge) {
                        await this.app.vault.delete(file);
                        cleaned++;
                        console.log(`Cleaned up old conflict backup: ${file.path}`);
                    }
                } catch (error) {
                    console.warn(`Could not clean up ${file.path}:`, error);
                }
            }
        }

        if (cleaned > 0) {
            new Notice(`Cleaned up ${cleaned} old conflict backup files`);
        }

        return cleaned;
    }
}