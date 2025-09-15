import { TokenManager } from '../auth/token-manager';
import { DriveFile } from './client';

/**
 * Upload progress callback
 */
export type UploadProgressCallback = (bytesUploaded: number, totalBytes: number) => void;

/**
 * Upload options
 */
export interface UploadOptions {
    onProgress?: UploadProgressCallback;
    parentId?: string;
    overwrite?: boolean;
}

/**
 * Download options
 */
export interface DownloadOptions {
    ifNoneMatch?: string; // ETag for conditional download
}

/**
 * Upload result
 */
export interface UploadResult {
    file: DriveFile;
    created: boolean; // true if new file, false if updated
}

/**
 * Google Drive file operations (upload/download)
 */
export class DriveFileOperations {
    private tokenManager: TokenManager;
    private uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files';
    private downloadUrl = 'https://www.googleapis.com/drive/v3/files';

    constructor(tokenManager: TokenManager) {
        this.tokenManager = tokenManager;
    }

    /**
     * Upload a file to Google Drive
     */
    async uploadFile(
        fileName: string,
        content: ArrayBuffer | Uint8Array | string,
        mimeType: string,
        options: UploadOptions = {}
    ): Promise<UploadResult> {
        const contentBuffer = typeof content === 'string'
            ? new TextEncoder().encode(content)
            : new Uint8Array(content);

        // Determine upload method based on file size
        const fileSize = contentBuffer.byteLength;
        const useResumableUpload = fileSize > 5 * 1024 * 1024; // 5MB threshold

        if (useResumableUpload) {
            return await this.resumableUpload(fileName, contentBuffer, mimeType, options);
        } else {
            return await this.multipartUpload(fileName, contentBuffer, mimeType, options);
        }
    }

    /**
     * Download a file from Google Drive
     */
    async downloadFile(fileId: string, options: DownloadOptions = {}): Promise<ArrayBuffer> {
        const accessToken = await this.tokenManager.getValidAccessToken();

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${accessToken}`
        };

        // Add conditional download header if ETag provided
        if (options.ifNoneMatch) {
            headers['If-None-Match'] = options.ifNoneMatch;
        }

        const response = await fetch(`${this.downloadUrl}/${fileId}?alt=media`, {
            headers
        });

        if (response.status === 304) {
            // File hasn't changed (ETag match)
            throw new Error('File not modified');
        }

        if (!response.ok) {
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }

        return await response.arrayBuffer();
    }

    /**
     * Update an existing file
     */
    async updateFile(
        fileId: string,
        content: ArrayBuffer | Uint8Array | string,
        options: UploadOptions = {}
    ): Promise<DriveFile> {
        const contentBuffer = typeof content === 'string'
            ? new TextEncoder().encode(content)
            : new Uint8Array(content);

        const fileSize = contentBuffer.byteLength;
        const useResumableUpload = fileSize > 5 * 1024 * 1024;

        if (useResumableUpload) {
            return await this.resumableUpdate(fileId, contentBuffer, options);
        } else {
            return await this.multipartUpdate(fileId, contentBuffer, options);
        }
    }

    /**
     * Multipart upload for files ≤5MB
     */
    private async multipartUpload(
        fileName: string,
        content: Uint8Array,
        mimeType: string,
        options: UploadOptions
    ): Promise<UploadResult> {
        const accessToken = await this.tokenManager.getValidAccessToken();

        // Prepare metadata
        const metadata = {
            name: fileName,
            parents: options.parentId ? [options.parentId] : undefined
        };

        // Create multipart body
        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelim = `\r\n--${boundary}--`;

        const metadataBlob = new TextEncoder().encode(
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata)
        );

        const contentBlob = new TextEncoder().encode(
            delimiter +
            `Content-Type: ${mimeType}\r\n\r\n`
        );

        const closeBlob = new TextEncoder().encode(closeDelim);

        // Combine all parts
        const totalSize = metadataBlob.byteLength + contentBlob.byteLength + content.byteLength + closeBlob.byteLength;
        const body = new Uint8Array(totalSize);
        let offset = 0;

        body.set(metadataBlob, offset);
        offset += metadataBlob.byteLength;

        body.set(contentBlob, offset);
        offset += contentBlob.byteLength;

        body.set(content, offset);
        offset += content.byteLength;

        body.set(closeBlob, offset);

        // Send request
        const response = await fetch(`${this.uploadUrl}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,md5Checksum`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary="${boundary}"`
            },
            body
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }

        const file: DriveFile = await response.json();

        // Report final progress
        if (options.onProgress) {
            options.onProgress(content.byteLength, content.byteLength);
        }

        return { file, created: true };
    }

    /**
     * Resumable upload for files >5MB
     */
    private async resumableUpload(
        fileName: string,
        content: Uint8Array,
        mimeType: string,
        options: UploadOptions
    ): Promise<UploadResult> {
        const accessToken = await this.tokenManager.getValidAccessToken();

        // Step 1: Initiate resumable upload
        const metadata = {
            name: fileName,
            parents: options.parentId ? [options.parentId] : undefined
        };

        const initResponse = await fetch(`${this.uploadUrl}?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime,md5Checksum`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Upload-Content-Type': mimeType,
                'X-Upload-Content-Length': content.byteLength.toString()
            },
            body: JSON.stringify(metadata)
        });

        if (!initResponse.ok) {
            throw new Error(`Upload initiation failed: ${initResponse.status} ${initResponse.statusText}`);
        }

        const uploadUri = initResponse.headers.get('Location');
        if (!uploadUri) {
            throw new Error('No upload URI received');
        }

        // Step 2: Upload content in chunks
        return await this.uploadChunks(uploadUri, content, mimeType, options);
    }

    /**
     * Upload content in chunks for resumable uploads
     */
    private async uploadChunks(
        uploadUri: string,
        content: Uint8Array,
        mimeType: string,
        options: UploadOptions
    ): Promise<UploadResult> {
        const chunkSize = 256 * 1024; // 256KB chunks
        const totalSize = content.byteLength;
        let uploadedBytes = 0;

        while (uploadedBytes < totalSize) {
            const chunk = content.slice(uploadedBytes, Math.min(uploadedBytes + chunkSize, totalSize));
            const isLastChunk = uploadedBytes + chunk.byteLength === totalSize;

            const response = await fetch(uploadUri, {
                method: 'PUT',
                headers: {
                    'Content-Type': mimeType,
                    'Content-Range': `bytes ${uploadedBytes}-${uploadedBytes + chunk.byteLength - 1}/${totalSize}`
                },
                body: chunk
            });

            if (isLastChunk && response.ok) {
                // Upload complete
                const file: DriveFile = await response.json();

                if (options.onProgress) {
                    options.onProgress(totalSize, totalSize);
                }

                return { file, created: true };
            } else if (response.status === 308) {
                // Chunk uploaded, continue
                uploadedBytes += chunk.byteLength;

                if (options.onProgress) {
                    options.onProgress(uploadedBytes, totalSize);
                }
            } else {
                throw new Error(`Chunk upload failed: ${response.status} ${response.statusText}`);
            }
        }

        throw new Error('Upload completed but no file returned');
    }

    /**
     * Multipart update for existing files ≤5MB
     */
    private async multipartUpdate(
        fileId: string,
        content: Uint8Array,
        options: UploadOptions
    ): Promise<DriveFile> {
        const accessToken = await this.tokenManager.getValidAccessToken();

        const response = await fetch(`${this.uploadUrl}/${fileId}?uploadType=media&fields=id,name,mimeType,size,modifiedTime,md5Checksum`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/octet-stream'
            },
            body: content
        });

        if (!response.ok) {
            throw new Error(`Update failed: ${response.status} ${response.statusText}`);
        }

        if (options.onProgress) {
            options.onProgress(content.byteLength, content.byteLength);
        }

        return await response.json();
    }

    /**
     * Resumable update for existing files >5MB
     */
    private async resumableUpdate(
        fileId: string,
        content: Uint8Array,
        options: UploadOptions
    ): Promise<DriveFile> {
        const accessToken = await this.tokenManager.getValidAccessToken();

        // Step 1: Initiate resumable update
        const initResponse = await fetch(`${this.uploadUrl}/${fileId}?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime,md5Checksum`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Upload-Content-Length': content.byteLength.toString()
            }
        });

        if (!initResponse.ok) {
            throw new Error(`Update initiation failed: ${initResponse.status} ${initResponse.statusText}`);
        }

        const uploadUri = initResponse.headers.get('Location');
        if (!uploadUri) {
            throw new Error('No upload URI received');
        }

        // Step 2: Upload content in chunks
        const result = await this.uploadChunks(uploadUri, content, 'application/octet-stream', options);
        return result.file;
    }

    /**
     * Get download URL for a file (for external downloads)
     */
    getDownloadUrl(fileId: string): string {
        return `${this.downloadUrl}/${fileId}?alt=media`;
    }

    /**
     * Check if file exists and get its ETag
     */
    async getFileETag(fileId: string): Promise<string | null> {
        try {
            const accessToken = await this.tokenManager.getValidAccessToken();

            const response = await fetch(`${this.downloadUrl}/${fileId}?fields=id`, {
                method: 'HEAD',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (response.ok) {
                return response.headers.get('ETag');
            }

            return null;
        } catch {
            return null;
        }
    }
}