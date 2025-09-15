import { TokenManager } from '../auth/token-manager';
import { DriveFile } from './client';

/**
 * Drive change types
 */
export type ChangeType = 'file' | 'drive';

/**
 * Individual change record
 */
export interface DriveChange {
    changeId: string;
    time: string;
    removed?: boolean;
    file?: DriveFile;
    fileId: string;
    type: ChangeType;
}

/**
 * Changes list response
 */
export interface ChangesResponse {
    changes: DriveChange[];
    nextPageToken?: string;
    newStartPageToken: string;
}

/**
 * Change detection options
 */
export interface ChangeDetectionOptions {
    restrictToMyDrive?: boolean;
    includeCorpusRemovals?: boolean;
    includeItemsFromAllDrives?: boolean;
    includePermissionsForView?: string;
    includeLabels?: string;
    includeTeamDriveItems?: boolean;
    pageSize?: number;
    spaces?: string;
    supportsAllDrives?: boolean;
    supportsTeamDrives?: boolean;
    teamDriveId?: string;
    driveId?: string;
}

/**
 * Stored page token for change detection
 */
interface PageTokenData {
    token: string;
    timestamp: number;
}

/**
 * Google Drive change detection using Changes API
 */
export class DriveChangeDetection {
    private tokenManager: TokenManager;
    private baseUrl = 'https://www.googleapis.com/drive/v3';
    private pageTokenStorageKey = 'drivelink-page-token';

    constructor(tokenManager: TokenManager) {
        this.tokenManager = tokenManager;
    }

    /**
     * Get the current start page token for change detection
     */
    async getStartPageToken(options: ChangeDetectionOptions = {}): Promise<string> {
        const accessToken = await this.tokenManager.getValidAccessToken();

        const params = new URLSearchParams();
        if (options.driveId) params.append('driveId', options.driveId);
        if (options.supportsAllDrives) params.append('supportsAllDrives', 'true');
        if (options.supportsTeamDrives) params.append('supportsTeamDrives', 'true');
        if (options.teamDriveId) params.append('teamDriveId', options.teamDriveId);

        const url = `${this.baseUrl}/changes/startPageToken${params.toString() ? '?' + params.toString() : ''}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get start page token: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.startPageToken;
    }

    /**
     * List changes since a specific page token
     */
    async listChanges(
        pageToken: string,
        options: ChangeDetectionOptions = {}
    ): Promise<ChangesResponse> {
        const accessToken = await this.tokenManager.getValidAccessToken();

        const params = new URLSearchParams({
            pageToken,
            fields: 'changes(changeId,time,removed,file(id,name,mimeType,size,modifiedTime,parents,md5Checksum),fileId),nextPageToken,newStartPageToken'
        });

        // Add optional parameters
        if (options.pageSize) params.append('pageSize', options.pageSize.toString());
        if (options.restrictToMyDrive) params.append('restrictToMyDrive', 'true');
        if (options.includeCorpusRemovals) params.append('includeCorpusRemovals', 'true');
        if (options.includeItemsFromAllDrives) params.append('includeItemsFromAllDrives', 'true');
        if (options.includePermissionsForView) params.append('includePermissionsForView', options.includePermissionsForView);
        if (options.includeLabels) params.append('includeLabels', options.includeLabels);
        if (options.includeTeamDriveItems) params.append('includeTeamDriveItems', 'true');
        if (options.spaces) params.append('spaces', options.spaces);
        if (options.supportsAllDrives) params.append('supportsAllDrives', 'true');
        if (options.supportsTeamDrives) params.append('supportsTeamDrives', 'true');
        if (options.teamDriveId) params.append('teamDriveId', options.teamDriveId);
        if (options.driveId) params.append('driveId', options.driveId);

        const response = await fetch(`${this.baseUrl}/changes?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to list changes: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Get all changes since the last stored page token
     */
    async getAllChangesSinceLastCheck(
        options: ChangeDetectionOptions = {}
    ): Promise<{ changes: DriveChange[]; newPageToken: string }> {
        const storedPageToken = await this.getStoredPageToken();

        if (!storedPageToken) {
            // No stored token, get current start token and return empty changes
            const startToken = await this.getStartPageToken(options);
            await this.storePageToken(startToken);
            return { changes: [], newPageToken: startToken };
        }

        const allChanges: DriveChange[] = [];
        let currentPageToken = storedPageToken;
        let hasMorePages = true;

        while (hasMorePages) {
            try {
                const response = await this.listChanges(currentPageToken, {
                    ...options,
                    pageSize: options.pageSize || 100
                });

                allChanges.push(...response.changes);

                if (response.nextPageToken) {
                    currentPageToken = response.nextPageToken;
                } else {
                    hasMorePages = false;
                    currentPageToken = response.newStartPageToken;
                }
            } catch (error) {
                // If pageToken is invalid (400 error), reset change detection
                if (error.message?.includes('400')) {
                    console.warn('Invalid page token, resetting change detection:', error.message);
                    const startToken = await this.getStartPageToken(options);
                    await this.storePageToken(startToken);
                    return { changes: [], newPageToken: startToken };
                }
                throw error;
            }
        }

        // Store the new page token for next time
        await this.storePageToken(currentPageToken);

        return { changes: allChanges, newPageToken: currentPageToken };
    }

    /**
     * Filter changes to only include files in a specific folder
     */
    filterChangesForFolder(changes: DriveChange[], folderId: string): DriveChange[] {
        return changes.filter(change => {
            if (change.removed) {
                // For removed files, we can't check parents, so include all removals
                // The sync engine should handle cleanup
                return true;
            }

            if (!change.file || !change.file.parents) {
                return false;
            }

            return change.file.parents.includes(folderId);
        });
    }

    /**
     * Group changes by file ID (to handle multiple changes to same file)
     */
    groupChangesByFileId(changes: DriveChange[]): Map<string, DriveChange> {
        const changeMap = new Map<string, DriveChange>();

        // Process changes in order, keeping the latest change for each file
        changes.forEach(change => {
            const existingChange = changeMap.get(change.fileId);

            if (!existingChange || change.time > existingChange.time) {
                changeMap.set(change.fileId, change);
            }
        });

        return changeMap;
    }

    /**
     * Check if there are new changes available
     */
    async hasNewChanges(options: ChangeDetectionOptions = {}): Promise<boolean> {
        const storedPageToken = await this.getStoredPageToken();

        if (!storedPageToken) {
            return false; // No baseline to compare against
        }

        try {
            const response = await this.listChanges(storedPageToken, {
                ...options,
                pageSize: 1 // Just check if any changes exist
            });

            return response.changes.length > 0;
        } catch (error) {
            console.error('Error checking for changes:', error);
            return false;
        }
    }

    /**
     * Initialize change detection for a new sync setup
     */
    async initializeChangeDetection(options: ChangeDetectionOptions = {}): Promise<string> {
        const startToken = await this.getStartPageToken(options);
        await this.storePageToken(startToken);
        return startToken;
    }

    /**
     * Reset change detection (useful after errors or re-sync)
     */
    async resetChangeDetection(options: ChangeDetectionOptions = {}): Promise<void> {
        await this.initializeChangeDetection(options);
    }

    /**
     * Store page token for persistence across sessions
     */
    private async storePageToken(token: string): Promise<void> {
        try {
            // This would need to be integrated with the plugin's data storage
            const tokenData: PageTokenData = {
                token,
                timestamp: Date.now()
            };

            // Store in localStorage or plugin data
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.pageTokenStorageKey, JSON.stringify(tokenData));
            }
        } catch (error) {
            console.error('Failed to store page token:', error);
        }
    }

    /**
     * Retrieve stored page token
     */
    private async getStoredPageToken(): Promise<string | null> {
        try {
            // Retrieve from localStorage or plugin data
            let tokenDataStr: string | null = null;

            if (typeof localStorage !== 'undefined') {
                tokenDataStr = localStorage.getItem(this.pageTokenStorageKey);
            }

            if (!tokenDataStr) {
                return null;
            }

            const tokenData: PageTokenData = JSON.parse(tokenDataStr);

            // Check if token is too old (older than 7 days)
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
            if (Date.now() - tokenData.timestamp > maxAge) {
                await this.clearStoredPageToken();
                return null;
            }

            return tokenData.token;
        } catch (error) {
            console.error('Failed to retrieve page token:', error);
            return null;
        }
    }

    /**
     * Clear stored page token
     */
    private async clearStoredPageToken(): Promise<void> {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(this.pageTokenStorageKey);
            }
        } catch (error) {
            console.error('Failed to clear page token:', error);
        }
    }

    /**
     * Get change detection statistics
     */
    async getChangeDetectionStats(): Promise<{
        hasStoredToken: boolean;
        tokenAge?: number;
        lastCheckTime?: number;
    }> {
        const tokenDataStr = typeof localStorage !== 'undefined'
            ? localStorage.getItem(this.pageTokenStorageKey)
            : null;

        if (!tokenDataStr) {
            return { hasStoredToken: false };
        }

        try {
            const tokenData: PageTokenData = JSON.parse(tokenDataStr);
            return {
                hasStoredToken: true,
                tokenAge: Date.now() - tokenData.timestamp,
                lastCheckTime: tokenData.timestamp
            };
        } catch {
            return { hasStoredToken: false };
        }
    }
}