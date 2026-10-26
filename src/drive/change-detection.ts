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
    syncCount: number;
    folderId?: string;
    lastFullScan?: number; // Set when the token was taken right before a full scan of folderId
}

/**
 * Result of reading changes since the last committed page token
 */
export interface ChangesSinceLastCheck {
    needsFullScan: boolean; // No usable token: the whole folder must be listed
    changes: DriveChange[];
    newPageToken?: string; // Token to commit after a successful sync (when needsFullScan is false)
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

        // Add parameters consistently with how they'll be used in listChanges
        const isDriveSpecific = !!(options.driveId);

        if (isDriveSpecific) {
            // Drive-specific token
            params.append('driveId', options.driveId!);
            params.append('supportsAllDrives', 'true');
        } else {
            // User-level token - no additional parameters needed for startPageToken
            // The token scope will be determined by the absence of driveId
        }

        // Add other optional parameters if specified
        if (options.supportsTeamDrives) params.append('supportsTeamDrives', 'true');
        if (options.teamDriveId) params.append('teamDriveId', options.teamDriveId);

        const url = `${this.baseUrl}/changes/startPageToken${params.toString() ? '?' + params.toString() : ''}`;

        // Full debug logging for startPageToken request
        console.log(`[ChangeDetection] DEBUG: getStartPageToken request`);
        console.log(`[ChangeDetection] DEBUG: URL: ${url}`);
        console.log(`[ChangeDetection] DEBUG: Access Token Length: ${accessToken.length}`);
        console.log(`[ChangeDetection] DEBUG: Options:`, JSON.stringify(options, null, 2));
        console.log(`[ChangeDetection] DEBUG: Request Headers:`, {
            'Authorization': `Bearer ${accessToken.substring(0, 20)}...`,
            'Content-Type': 'application/json'
        });

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`[ChangeDetection] DEBUG: getStartPageToken response`);
        console.log(`[ChangeDetection] DEBUG: Response Status: ${response.status}`);
        console.log(`[ChangeDetection] DEBUG: Response Headers:`, {
            'content-type': response.headers.get('content-type'),
            'cache-control': response.headers.get('cache-control'),
            'x-goog-api-version': response.headers.get('x-goog-api-version'),
            'server': response.headers.get('server')
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`[ChangeDetection] DEBUG: Error Response Body:`, errorText);

            let errorDetails = '';
            try {
                const errorJson = JSON.parse(errorText);
                errorDetails = JSON.stringify(errorJson, null, 2);
                console.log(`[ChangeDetection] DEBUG: Parsed Error:`, errorJson);
            } catch {
                errorDetails = errorText;
            }

            throw new Error(`Failed to get start page token: ${response.status} ${response.statusText}\nDetails: ${errorDetails}`);
        }

        const data = await response.json();
        console.log(`[ChangeDetection] DEBUG: Success Response Body:`, JSON.stringify(data, null, 2));
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
            fields: 'changes(time,removed,fileId,file(id,name,mimeType,size,modifiedTime,parents,md5Checksum,trashed)),nextPageToken,newStartPageToken'
        });

        // Determine if this is a drive-specific or user-level token based on options
        const isDriveSpecific = !!(options.driveId);

        if (isDriveSpecific) {
            // Drive-specific token - include driveId and related parameters
            params.append('driveId', options.driveId!);
            params.append('supportsAllDrives', 'true');
            params.append('includeRemoved', 'true');
            params.append('spaces', 'drive');
        } else {
            // User-level token - include parameters for all drives access
            params.append('supportsAllDrives', 'true');
            params.append('includeItemsFromAllDrives', 'true');
            params.append('includeRemoved', 'true');
            params.append('spaces', 'drive');
        }

        // Add page size
        params.append('pageSize', (options.pageSize || 100).toString());

        // Add other optional parameters if specified
        if (options.restrictToMyDrive) params.append('restrictToMyDrive', 'true');
        if (options.includeCorpusRemovals) params.append('includeCorpusRemovals', 'true');
        if (options.includePermissionsForView) params.append('includePermissionsForView', options.includePermissionsForView);
        if (options.includeLabels) params.append('includeLabels', options.includeLabels);
        if (options.includeTeamDriveItems) params.append('includeTeamDriveItems', 'true');
        if (options.supportsTeamDrives) params.append('supportsTeamDrives', 'true');
        if (options.teamDriveId) params.append('teamDriveId', options.teamDriveId);

        const url = `${this.baseUrl}/changes?${params.toString()}`;

        // Full debug logging for changes.list request
        console.log(`[ChangeDetection] DEBUG: listChanges request`);
        console.log(`[ChangeDetection] DEBUG: URL: ${url}`);
        console.log(`[ChangeDetection] DEBUG: Page Token: "${pageToken}"`);
        console.log(`[ChangeDetection] DEBUG: Page Token Length: ${pageToken.length}`);
        console.log(`[ChangeDetection] DEBUG: Page Token Type: ${typeof pageToken}`);
        console.log(`[ChangeDetection] DEBUG: Page Token Numeric: ${/^\d+$/.test(pageToken)}`);
        console.log(`[ChangeDetection] DEBUG: Access Token Length: ${accessToken.length}`);
        console.log(`[ChangeDetection] DEBUG: Options:`, JSON.stringify(options, null, 2));
        console.log(`[ChangeDetection] DEBUG: All Params:`, Object.fromEntries(params.entries()));
        console.log(`[ChangeDetection] DEBUG: Request Headers:`, {
            'Authorization': `Bearer ${accessToken.substring(0, 20)}...`,
            'Content-Type': 'application/json'
        });

        const requestHeaders = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        };

        const response = await fetch(url, {
            headers: requestHeaders
        });

        console.log(`[ChangeDetection] DEBUG: Response Status: ${response.status}`);
        console.log(`[ChangeDetection] DEBUG: Response Headers:`, {
            'content-type': response.headers.get('content-type'),
            'cache-control': response.headers.get('cache-control'),
            'x-goog-api-version': response.headers.get('x-goog-api-version'),
            'server': response.headers.get('server')
        });

        if (!response.ok) {
            const responseText = await response.text();
            console.log(`[ChangeDetection] DEBUG: Error Response Body:`, responseText);

            let errorDetails = '';
            try {
                const errorJson = JSON.parse(responseText);
                errorDetails = JSON.stringify(errorJson, null, 2);
                console.log(`[ChangeDetection] DEBUG: Parsed Error:`, errorJson);
            } catch {
                errorDetails = responseText;
            }

            throw new Error(`Failed to list changes: ${response.status} ${response.statusText}\nDetails: ${errorDetails}`);
        }

        const responseJson = await response.json();
        console.log(`[ChangeDetection] DEBUG: Full Success Response:`, JSON.stringify(responseJson, null, 2));
        console.log(`[ChangeDetection] DEBUG: Success Response Summary:`, {
            changesCount: responseJson.changes?.length || 0,
            hasNextPageToken: !!responseJson.nextPageToken,
            nextPageToken: responseJson.nextPageToken,
            newStartPageToken: responseJson.newStartPageToken
        });

        return responseJson;
    }

    /**
     * Get all changes since the last committed page token.
     * Nothing is persisted here: call commitPageToken() once the sync that
     * consumed the changes has succeeded, so a failed sync sees them again.
     * needsFullScan is true when there is no usable token for this folder;
     * the caller must then list the whole folder.
     */
    async getAllChangesSinceLastCheck(
        folderId: string,
        options: ChangeDetectionOptions = {}
    ): Promise<ChangesSinceLastCheck> {
        const tokenData = await this.getStoredPageTokenData();

        // A token is usable only after a full scan of the same folder completed
        if (!tokenData || !tokenData.lastFullScan || tokenData.folderId !== folderId || this.isTokenStale(tokenData)) {
            console.log('[ChangeDetection] No usable token for this folder, full scan required');
            return { needsFullScan: true, changes: [] };
        }

        const allChanges: DriveChange[] = [];
        let currentPageToken = tokenData.token;
        let pagesProcessed = 0;

        console.log(`[ChangeDetection] Starting incremental sync from token: ${currentPageToken}`);

        while (true) {
            let response: ChangesResponse;
            try {
                response = await this.listChanges(currentPageToken, {
                    ...options,
                    pageSize: options.pageSize || 100
                });
            } catch (error) {
                // 400 means the stored page token is no longer valid
                if (error.message?.includes('400')) {
                    console.log(`[ChangeDetection] Invalid page token (${currentPageToken}), full scan required`);
                    return { needsFullScan: true, changes: [] };
                }
                throw error;
            }

            allChanges.push(...response.changes);
            pagesProcessed++;

            console.log(`[ChangeDetection] Page ${pagesProcessed}: Found ${response.changes.length} changes`);

            if (!response.nextPageToken) {
                console.log(`[ChangeDetection] Incremental sync complete: ${allChanges.length} changes found across ${pagesProcessed} pages`);
                return { needsFullScan: false, changes: allChanges, newPageToken: response.newStartPageToken };
            }
            currentPageToken = response.nextPageToken;

            // Safety check to prevent infinite loops
            if (pagesProcessed > 100) {
                console.warn(`[ChangeDetection] Too many pages (${pagesProcessed}), full scan required`);
                return { needsFullScan: true, changes: [] };
            }
        }
    }

    /**
     * Persist the page token after a successful sync.
     * fullScan marks the token as taken right before a full scan of folderId.
     */
    async commitPageToken(token: string, folderId: string, fullScan: boolean): Promise<void> {
        const existingData = await this.getStoredPageTokenData();
        await this.storePageTokenWithMetadata(token, {
            folderId,
            lastFullScan: fullScan ? Date.now() : existingData?.lastFullScan,
            syncCount: (existingData?.syncCount || 0) + 1
        });
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
     * Force clear all tokens; the next sync performs a full scan
     */
    async forceResetChangeDetection(): Promise<void> {
        console.log(`[ChangeDetection] Force resetting change detection - clearing all tokens`);
        await this.clearStoredPageToken();
    }

    /**
     * Store page token with metadata for persistence across sessions
     */
    private async storePageTokenWithMetadata(token: string, metadata: Partial<PageTokenData> = {}): Promise<void> {
        try {
            const tokenData: PageTokenData = {
                token,
                timestamp: Date.now(),
                syncCount: metadata.syncCount || 0,
                folderId: metadata.folderId,
                lastFullScan: metadata.lastFullScan
            };

            let stored = false;

            // Use plugin data storage if available, otherwise fall back to localStorage
            if (this.plugin && this.plugin.settings) {
                this.plugin.settings.changeDetectionToken = JSON.stringify(tokenData);
                await this.plugin.saveSettings();
                stored = true;
                console.log(`[ChangeDetection] Stored token with metadata:`, {
                    token,
                    syncCount: tokenData.syncCount,
                    folderId: tokenData.folderId,
                    lastFullScan: tokenData.lastFullScan
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
                lastFullScan: tokenData.lastFullScan,
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