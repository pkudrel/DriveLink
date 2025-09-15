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
 * Stored page token for change detection with metadata
 */
interface PageTokenData {
    token: string;
    timestamp: number;
    isBootstrapped: boolean;
    syncCount: number;
    folderId?: string;
}

/**
 * Google Drive change detection using Changes API
 */
export class DriveChangeDetection {
    private tokenManager: TokenManager;
    private baseUrl = 'https://www.googleapis.com/drive/v3';
    private pageTokenStorageKey = 'drivelink-page-token';
    private plugin: any; // Plugin reference for data storage

    constructor(tokenManager: TokenManager, plugin?: any) {
        this.tokenManager = tokenManager;
        this.plugin = plugin;
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

        console.log(`[ChangeDetection] Requesting fresh start page token from: ${url}`);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[ChangeDetection] Failed to get start page token: ${response.status} ${response.statusText}`, errorText);
            throw new Error(`Failed to get start page token: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[ChangeDetection] Google Drive returned start page token:`, data);
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
     * Get all changes since the last stored page token with proper error recovery
     */
    async getAllChangesSinceLastCheck(
        folderId?: string,
        options: ChangeDetectionOptions = {}
    ): Promise<{ changes: DriveChange[]; newPageToken: string; wasBootstrapped: boolean }> {
        const tokenData = await this.getStoredPageTokenData();

        // If no token or token is too old, bootstrap fresh
        if (!tokenData || !tokenData.isBootstrapped || this.isTokenStale(tokenData)) {
            console.log('[ChangeDetection] No valid token found, bootstrapping fresh change detection');
            const startToken = await this.bootstrapChangeDetection(folderId, options);
            return { changes: [], newPageToken: startToken, wasBootstrapped: true };
        }

        // Validate token matches current folder (if provided)
        if (folderId && tokenData.folderId && tokenData.folderId !== folderId) {
            console.log(`[ChangeDetection] Folder changed (${tokenData.folderId} -> ${folderId}), bootstrapping fresh`);
            const startToken = await this.bootstrapChangeDetection(folderId, options);
            return { changes: [], newPageToken: startToken, wasBootstrapped: true };
        }

        const allChanges: DriveChange[] = [];
        let currentPageToken = tokenData.token;
        let hasMorePages = true;
        let pagesProcessed = 0;

        console.log(`[ChangeDetection] Starting incremental sync from token: ${currentPageToken}`);

        while (hasMorePages) {
            try {
                const response = await this.listChanges(currentPageToken, {
                    ...options,
                    pageSize: options.pageSize || 100
                });

                allChanges.push(...response.changes);
                pagesProcessed++;

                console.log(`[ChangeDetection] Page ${pagesProcessed}: Found ${response.changes.length} changes`);

                if (response.nextPageToken) {
                    currentPageToken = response.nextPageToken;
                } else {
                    hasMorePages = false;
                    currentPageToken = response.newStartPageToken;
                }

                // Safety check to prevent infinite loops
                if (pagesProcessed > 100) {
                    console.warn(`[ChangeDetection] Too many pages (${pagesProcessed}), stopping and bootstrapping fresh`);
                    const startToken = await this.bootstrapChangeDetection(folderId, options);
                    return { changes: [], newPageToken: startToken, wasBootstrapped: true };
                }

            } catch (error) {
                // Handle 400 Invalid page token with fresh bootstrap
                if (error.message?.includes('400')) {
                    console.log(`[ChangeDetection] Invalid page token detected (${currentPageToken}), checking for infinite loop`);

                    // Check if Google Drive might return the same invalid token again
                    // This can happen due to Google Drive API sync issues
                    const testToken = await this.getStartPageToken(options);

                    if (testToken === currentPageToken) {
                        console.warn(`[ChangeDetection] Google Drive returned same invalid token (${testToken}), disabling change detection`);
                        throw new Error('Google Drive API returned same invalid token - change detection disabled for this session');
                    }

                    console.log(`[ChangeDetection] Got different token (${testToken}), bootstrapping fresh`);
                    const startToken = await this.bootstrapChangeDetection(folderId, options);
                    return { changes: [], newPageToken: startToken, wasBootstrapped: true };
                }
                throw error;
            }
        }

        // Store the new page token with updated metadata
        await this.storePageTokenWithMetadata(currentPageToken, {
            isBootstrapped: true,
            syncCount: tokenData.syncCount + 1,
            folderId: folderId || tokenData.folderId
        });

        console.log(`[ChangeDetection] Incremental sync complete: ${allChanges.length} changes found across ${pagesProcessed} pages`);

        return { changes: allChanges, newPageToken: currentPageToken, wasBootstrapped: false };
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
     * Bootstrap change detection with a fresh start page token
     */
    async bootstrapChangeDetection(folderId?: string, options: ChangeDetectionOptions = {}): Promise<string> {
        console.log('[ChangeDetection] Bootstrapping change detection with fresh start page token');

        // Get a fresh start page token from Google Drive
        const startToken = await this.getStartPageToken(options);

        // Store with bootstrap metadata
        await this.storePageTokenWithMetadata(startToken, {
            isBootstrapped: true,
            syncCount: 0,
            folderId
        });

        console.log(`[ChangeDetection] Change detection bootstrapped successfully with token: ${startToken}`);
        return startToken;
    }

    /**
     * Initialize change detection for a new sync setup
     */
    async initializeChangeDetection(options: ChangeDetectionOptions = {}): Promise<string> {
        return await this.bootstrapChangeDetection(undefined, options);
    }

    /**
     * Reset change detection (useful after errors or re-sync)
     */
    async resetChangeDetection(options: ChangeDetectionOptions = {}): Promise<void> {
        console.log(`[ChangeDetection] Resetting change detection`);
        await this.clearStoredPageToken();
        await this.initializeChangeDetection(options);
    }

    /**
     * Force clear all tokens and reset change detection completely
     */
    async forceResetChangeDetection(options: ChangeDetectionOptions = {}): Promise<void> {
        console.log(`[ChangeDetection] Force resetting change detection - clearing all tokens`);

        // Clear from plugin settings
        if (this.plugin && this.plugin.settings) {
            this.plugin.settings.changeDetectionToken = undefined;
            await this.plugin.saveSettings();
        }

        // Clear from localStorage
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(this.pageTokenStorageKey);
        }

        // Initialize fresh
        await this.initializeChangeDetection(options);
    }

    /**
     * Store page token with metadata for persistence across sessions
     */
    private async storePageTokenWithMetadata(token: string, metadata: Partial<PageTokenData> = {}): Promise<void> {
        try {
            const tokenData: PageTokenData = {
                token,
                timestamp: Date.now(),
                isBootstrapped: metadata.isBootstrapped || false,
                syncCount: metadata.syncCount || 0,
                folderId: metadata.folderId,
                ...metadata
            };

            let stored = false;

            // Use plugin data storage if available, otherwise fall back to localStorage
            if (this.plugin && this.plugin.settings) {
                this.plugin.settings.changeDetectionToken = JSON.stringify(tokenData);
                await this.plugin.saveSettings();
                stored = true;
                console.log(`[ChangeDetection] Stored token with metadata:`, {
                    token,
                    isBootstrapped: tokenData.isBootstrapped,
                    syncCount: tokenData.syncCount,
                    folderId: tokenData.folderId
                });
            } else if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.pageTokenStorageKey, JSON.stringify(tokenData));
                stored = true;
                console.log(`[ChangeDetection] Stored token in localStorage: ${token}`);
            }

            if (!stored) {
                console.warn(`[ChangeDetection] Failed to store token - no storage available`);
            }
        } catch (error) {
            console.error('Failed to store page token:', error);
        }
    }

    /**
     * Store page token for persistence across sessions (legacy method)
     */
    private async storePageToken(token: string): Promise<void> {
        await this.storePageTokenWithMetadata(token);
    }

    /**
     * Retrieve stored page token data with metadata
     */
    private async getStoredPageTokenData(): Promise<PageTokenData | null> {
        try {
            // Retrieve from plugin data or localStorage
            let tokenDataStr: string | null = null;
            let source = 'none';

            if (this.plugin && this.plugin.settings && this.plugin.settings.changeDetectionToken) {
                tokenDataStr = this.plugin.settings.changeDetectionToken;
                source = 'plugin-settings';
            } else if (typeof localStorage !== 'undefined') {
                tokenDataStr = localStorage.getItem(this.pageTokenStorageKey);
                source = 'localStorage';
            }

            console.log(`[ChangeDetection] Token retrieval: source=${source}, hasToken=${!!tokenDataStr}`);

            if (!tokenDataStr) {
                return null;
            }

            const tokenData: PageTokenData = JSON.parse(tokenDataStr);
            const tokenAge = Date.now() - tokenData.timestamp;

            console.log(`[ChangeDetection] Token details:`, {
                token: tokenData.token,
                ageMinutes: Math.round(tokenAge/1000/60),
                isBootstrapped: tokenData.isBootstrapped,
                syncCount: tokenData.syncCount,
                folderId: tokenData.folderId
            });

            return tokenData;
        } catch (error) {
            console.error('Failed to retrieve page token data:', error);
            return null;
        }
    }

    /**
     * Retrieve stored page token (legacy method)
     */
    private async getStoredPageToken(): Promise<string | null> {
        const tokenData = await this.getStoredPageTokenData();
        return tokenData?.token || null;
    }

    /**
     * Check if a token is stale and should be refreshed
     */
    private isTokenStale(tokenData: PageTokenData): boolean {
        const tokenAge = Date.now() - tokenData.timestamp;
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

        if (tokenAge > maxAge) {
            console.log(`[ChangeDetection] Token is stale (age: ${Math.round(tokenAge/1000/60/60)}h)`);
            return true;
        }

        return false;
    }

    /**
     * Clear stored page token
     */
    private async clearStoredPageToken(): Promise<void> {
        try {
            // Clear from plugin data and localStorage
            if (this.plugin && this.plugin.settings) {
                this.plugin.settings.changeDetectionToken = undefined;
                await this.plugin.saveSettings();
            }
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
        // Check plugin data first, then localStorage
        let tokenDataStr: string | null = null;

        if (this.plugin && this.plugin.settings && this.plugin.settings.changeDetectionToken) {
            tokenDataStr = this.plugin.settings.changeDetectionToken;
        } else if (typeof localStorage !== 'undefined') {
            tokenDataStr = localStorage.getItem(this.pageTokenStorageKey);
        }

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