import { App, TFile } from 'obsidian';
import DriveLinkPlugin from '../../src/main';
import { DEFAULT_SETTINGS, DriveLinkSettings } from '../../src/settings';
import { SyncEngine } from '../../src/sync/sync-engine';
import { IndexManager } from '../../src/sync/index-manager';
import { ChangesSinceLastCheck, DriveChange } from '../../src/drive/change-detection';
import { DriveFile } from '../../src/drive/client';

export const ROOT_FOLDER_ID = 'root-folder';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const OLD_REMOTE_TIME = '2020-01-01T00:00:00.000Z';

/**
 * In-memory vault with just the API surface the sync engine uses
 */
export class FakeVault {
    files = new Map<string, TFile>();
    folders = new Set<string>();
    contents = new Map<string, Uint8Array>();
    trashed: string[] = [];

    adapter = {
        stat: async (path: string) => {
            const content = this.contents.get(path);
            return content ? { type: 'file', size: content.byteLength, mtime: 1000, ctime: 1000 } : null;
        }
    };

    addFile(path: string, content = 'content'): TFile {
        const name = path.split('/').pop()!;
        const file = Object.assign(new TFile(), {
            path,
            name,
            extension: name.includes('.') ? name.split('.').pop() : ''
        });
        this.files.set(path, file);
        this.contents.set(path, new TextEncoder().encode(content));
        return file;
    }

    getFiles(): TFile[] {
        return [...this.files.values()];
    }

    getAbstractFileByPath(path: string): unknown {
        return this.files.get(path) ?? (this.folders.has(path) ? { path } : null);
    }

    async trash(file: TFile, _system: boolean): Promise<void> {
        this.trashed.push(file.path);
        this.files.delete(file.path);
        this.contents.delete(file.path);
    }

    async createFolder(path: string): Promise<void> {
        this.folders.add(path);
    }

    async createBinary(path: string, data: Uint8Array): Promise<TFile> {
        const file = this.addFile(path);
        this.contents.set(path, data);
        return file;
    }

    async modifyBinary(file: TFile, data: Uint8Array): Promise<void> {
        this.contents.set(file.path, data);
    }

    async readBinary(file: TFile): Promise<ArrayBuffer> {
        return this.contents.get(file.path)!.buffer as ArrayBuffer;
    }
}

export function remoteFile(id: string, name: string, extra: Partial<DriveFile> = {}): DriveFile {
    return {
        id,
        name,
        mimeType: name.includes('.') ? 'text/markdown' : FOLDER_MIME,
        modifiedTime: OLD_REMOTE_TIME,
        parents: [ROOT_FOLDER_ID],
        ...extra
    };
}

/**
 * Fake Drive: folder contents by folder ID; files listed with modifiedSince
 * are returned only when present in recentlyModified
 */
export class FakeDrive {
    folders = new Map<string, DriveFile[]>();
    recentlyModified = new Set<string>();
    trashedIds: string[] = [];
    downloadError: Error | null = null;
    tokenManager = {};

    async listFiles(folderId: string, _pageToken?: string, _pageSize?: number, _orderBy?: string, modifiedSince?: string) {
        const files = this.folders.get(folderId) || [];
        return { files: modifiedSince ? files.filter(f => this.recentlyModified.has(f.id)) : files };
    }

    async listSubfolders(folderId: string) {
        return { files: (this.folders.get(folderId) || []).filter(f => f.mimeType === FOLDER_MIME) };
    }

    async trashFile(fileId: string): Promise<void> {
        this.trashedIds.push(fileId);
    }

    async getFileMetadata(fileId: string): Promise<DriveFile> {
        throw new Error(`metadata not stubbed for ${fileId}`);
    }

    async downloadFile(_fileId: string): Promise<ArrayBuffer> {
        if (this.downloadError) throw this.downloadError;
        return new TextEncoder().encode('remote content').buffer as ArrayBuffer;
    }
}

/**
 * Fake change detection returning a fixed result and recording commits
 */
export class FakeChangeDetection {
    result: ChangesSinceLastCheck = { needsFullScan: false, changes: [], newPageToken: 'next-token' };
    commits: Array<{ token: string; folderId: string; fullScan: boolean }> = [];

    async getAllChangesSinceLastCheck(): Promise<ChangesSinceLastCheck> {
        return this.result;
    }

    async getStartPageToken(): Promise<string> {
        return 'start-token';
    }

    async commitPageToken(token: string, folderId: string, fullScan: boolean): Promise<void> {
        this.commits.push({ token, folderId, fullScan });
    }
}

export interface SyncFixture {
    engine: SyncEngine;
    vault: FakeVault;
    drive: FakeDrive;
    changeDetection: FakeChangeDetection;
    indexManager: IndexManager;
    settings: DriveLinkSettings;
}

/**
 * Sync engine wired to fakes. syncedFiles are present locally, indexed and on Drive (root folder).
 */
export async function createSyncFixture(syncedFiles: Array<{ path: string; driveId: string }>): Promise<SyncFixture> {
    const vault = new FakeVault();
    const app = Object.assign(new App(), { vault }) as any;
    const plugin = new DriveLinkPlugin(app, {} as any);
    const settings: DriveLinkSettings = { ...DEFAULT_SETTINGS, driveFolderId: ROOT_FOLDER_ID };
    plugin.settings = settings;

    const drive = new FakeDrive();
    const changeDetection = new FakeChangeDetection();
    const engine = new SyncEngine(app, drive as any, settings, plugin);
    const internals = engine as any;
    internals.changeDetection = changeDetection;
    internals.fileOperations = drive;

    const indexManager: IndexManager = internals.indexManager;
    const rootFiles: DriveFile[] = [];
    for (const { path, driveId } of syncedFiles) {
        const file = vault.addFile(path);
        await indexManager.updateFileEntry(file, driveId);
        rootFiles.push(remoteFile(driveId, path));
    }
    drive.folders.set(ROOT_FOLDER_ID, rootFiles);

    return { engine, vault, drive, changeDetection, indexManager, settings };
}

export function removedChange(fileId: string): DriveChange {
    return { fileId, removed: true, time: OLD_REMOTE_TIME, type: 'file' };
}

export function trashedChange(file: DriveFile): DriveChange {
    return { fileId: file.id, file: { ...file, trashed: true }, time: OLD_REMOTE_TIME, type: 'file' };
}
