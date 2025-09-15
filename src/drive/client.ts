import { TokenManager } from '../auth/token-manager';
import { Logger } from '../utils/logger';

/**
 * Google Drive API file metadata
 */
export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime: string;
    parents?: string[];
    md5Checksum?: string;
    path?: string; // Full path from root (added by sync engine)
}

/**
 * Drive API list response
 */
interface DriveListResponse {
    files: DriveFile[];
    nextPageToken?: string;
    incompleteSearch?: boolean;
}

/**
 * Drive API error response
 */
interface DriveError {
    error: {
        code: number;
        message: string;
        errors: Array<{
            domain: string;
            reason: string;
            message: string;
        }>;
    };
}

/**
 * Google Drive API client wrapper
 */
export class DriveClient {
    private tokenManager: TokenManager;
    private baseUrl = 'https://www.googleapis.com/drive/v3';
    private logger = Logger.createComponentLogger('DriveClient');

    constructor(tokenManager: TokenManager) {
        this.tokenManager = tokenManager;
    }

    /**
     * Make authenticated request to Google Drive API
     */
    private async makeRequest(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<Response> {
        const url = `${this.baseUrl}${endpoint}`;
        const startTime = Date.now();

        this.logger.debug(`API Request: ${options.method || 'GET'} ${url}`, {
            endpoint,
            method: options.method || 'GET'
        });

        const accessToken = await this.tokenManager.getValidAccessToken();
        this.logger.debug('Retrieved access token for API request', {
            hasToken: !!accessToken,
            tokenLength: accessToken?.length || 0,
            tokenPrefix: accessToken?.substring(0, 20) + '...'
        });

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${accessToken?.substring(0, 20)}...`,
            'Content-Type': 'application/json',
            ...options.headers as Record<string, string>
        };

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...options.headers as Record<string, string>
            }
        });

        const duration = Date.now() - startTime;
        this.logger.debug(`API Response: ${response.status} ${response.statusText}`, {
            url,
            status: response.status,
            statusText: response.statusText,
            duration,
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length')
        });

        if (!response.ok) {
            const errorData: DriveError = await response.json().catch(() => ({
                error: {
                    code: response.status,
                    message: response.statusText,
                    errors: []
                }
            }));

            this.logger.error(`Drive API error ${errorData.error.code}: ${errorData.error.message}`, undefined, {
                url,
                status: response.status,
                statusText: response.statusText,
                duration,
                errorData: errorData.error,
                endpoint
            });

            throw new Error(
                `Drive API error ${errorData.error.code}: ${errorData.error.message}`
            );
        }

        return response;
    }

    /**
     * List files in a specific folder with optional filtering and ordering
     */
    async listFiles(
        folderId: string,
        pageToken?: string,
        pageSize: number = 100,
        orderBy?: string,
        modifiedSince?: string
    ): Promise<DriveListResponse> {
        // Build the query string
        let query = `'${folderId}' in parents and trashed=false`;

        // Add timestamp filter if provided
        if (modifiedSince) {
            query += ` and modifiedTime > '${modifiedSince}'`;
        }

        const params = new URLSearchParams({
            q: query,
            fields: 'files(id,name,mimeType,size,modifiedTime,parents,md5Checksum),nextPageToken,incompleteSearch',
            pageSize: pageSize.toString()
        });

        // Add ordering if provided
        if (orderBy) {
            params.append('orderBy', orderBy);
        }

        if (pageToken) {
            params.append('pageToken', pageToken);
        }

        this.logger.debug(`Listing files with enhanced filtering`, {
            folderId,
            query,
            orderBy,
            modifiedSince,
            pageSize
        });

        const response = await this.makeRequest(`/files?${params.toString()}`);
        return await response.json();
    }

    /**
     * Get file metadata by ID
     */
    async getFileMetadata(fileId: string): Promise<DriveFile> {
        const params = new URLSearchParams({
            fields: 'id,name,mimeType,size,modifiedTime,parents,md5Checksum'
        });

        const response = await this.makeRequest(`/files/${fileId}?${params.toString()}`);
        return await response.json();
    }

    /**
     * Create or find a folder by name
     */
    async createOrFindFolder(name: string, parentId?: string): Promise<string> {
        // First try to find existing folder
        const searchQuery = parentId
            ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
            : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

        const params = new URLSearchParams({
            q: searchQuery,
            fields: 'files(id,name)'
        });

        const searchResponse = await this.makeRequest(`/files?${params.toString()}`);
        const searchResult: DriveListResponse = await searchResponse.json();

        if (searchResult.files.length > 0) {
            return searchResult.files[0].id;
        }

        // Folder doesn't exist, create it
        const folderMetadata = {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : undefined
        };

        const response = await this.makeRequest('/files', {
            method: 'POST',
            body: JSON.stringify(folderMetadata)
        });

        const createdFolder: DriveFile = await response.json();
        return createdFolder.id;
    }

    /**
     * Delete a file by ID
     */
    async deleteFile(fileId: string): Promise<void> {
        await this.makeRequest(`/files/${fileId}`, {
            method: 'DELETE'
        });
    }

    /**
     * Get user information
     */
    async getUserInfo(): Promise<{ emailAddress: string; displayName: string }> {
        const response = await this.makeRequest('/about?fields=user');
        const data = await response.json();
        return {
            emailAddress: data.user.emailAddress,
            displayName: data.user.displayName
        };
    }

    /**
     * Check if we have the required permissions
     */
    async checkPermissions(): Promise<boolean> {
        try {
            // Try to list files in the root folder
            await this.listFiles('root', undefined, 1);
            return true;
        } catch (error) {
            console.error('Permission check failed:', error);
            return false;
        }
    }

    /**
     * Get storage quota information
     */
    async getStorageQuota(): Promise<{
        limit: string;
        usage: string;
        usageInDrive: string;
    }> {
        const response = await this.makeRequest('/about?fields=storageQuota');
        const data = await response.json();
        return data.storageQuota;
    }

    /**
     * Batch request multiple file metadata
     */
    async batchGetFileMetadata(fileIds: string[]): Promise<DriveFile[]> {
        if (fileIds.length === 0) return [];

        // Google Drive API supports batch requests, but for simplicity,
        // we'll make individual requests with Promise.all
        const promises = fileIds.map(id => this.getFileMetadata(id));

        try {
            return await Promise.all(promises);
        } catch (error) {
            // If batch fails, fall back to individual requests
            const results: DriveFile[] = [];
            for (const fileId of fileIds) {
                try {
                    const metadata = await this.getFileMetadata(fileId);
                    results.push(metadata);
                } catch (err) {
                    console.warn(`Failed to get metadata for file ${fileId}:`, err);
                }
            }
            return results;
        }
    }

    /**
     * Search for files with a query
     */
    async searchFiles(
        query: string,
        pageToken?: string,
        pageSize: number = 100
    ): Promise<DriveListResponse> {
        const params = new URLSearchParams({
            q: query,
            fields: 'files(id,name,mimeType,size,modifiedTime,parents,md5Checksum),nextPageToken',
            pageSize: pageSize.toString()
        });

        if (pageToken) {
            params.append('pageToken', pageToken);
        }

        const response = await this.makeRequest(`/files?${params.toString()}`);
        return await response.json();
    }
}