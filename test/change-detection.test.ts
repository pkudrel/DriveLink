import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { DriveChangeDetection, ChangesResponse } from '../src/drive/change-detection';

console.log = () => undefined;

const FOLDER = 'folder-1';

function createDetection(storedToken?: object) {
    const plugin = {
        settings: { changeDetectionToken: storedToken ? JSON.stringify(storedToken) : undefined } as any,
        saveSettings: async (): Promise<void> => undefined
    };
    const detection = new DriveChangeDetection({} as any, plugin);
    const stored = (): any => JSON.parse(plugin.settings.changeDetectionToken);
    return { detection, stored };
}

function respondWith(detection: DriveChangeDetection, response: ChangesResponse | Error) {
    (detection as any).listChanges = async () => {
        if (response instanceof Error) throw response;
        return response;
    };
}

const VALID_TOKEN = { token: 'token-1', timestamp: Date.now(), syncCount: 3, folderId: FOLDER, lastFullScan: Date.now() };

test('requires a full scan without a stored token', async () => {
    const { detection } = createDetection();
    assert.equal((await detection.getAllChangesSinceLastCheck(FOLDER)).needsFullScan, true);
});

test('requires a full scan when the token belongs to another folder', async () => {
    const { detection } = createDetection({ ...VALID_TOKEN, folderId: 'other-folder' });
    assert.equal((await detection.getAllChangesSinceLastCheck(FOLDER)).needsFullScan, true);
});

test('requires a full scan for a token stored without a completed full scan (old format)', async () => {
    const { detection } = createDetection({ token: 'token-1', timestamp: Date.now(), isBootstrapped: true, syncCount: 0 });
    assert.equal((await detection.getAllChangesSinceLastCheck(FOLDER)).needsFullScan, true);
});

test('requires a full scan when Drive rejects the page token', async () => {
    const { detection } = createDetection(VALID_TOKEN);
    respondWith(detection, new Error('Failed to list changes: 400 Bad Request'));
    assert.equal((await detection.getAllChangesSinceLastCheck(FOLDER)).needsFullScan, true);
});

test('reading changes does not move the stored token; commit does', async () => {
    const { detection, stored } = createDetection(VALID_TOKEN);
    respondWith(detection, {
        changes: [{ fileId: 'id-a', removed: true, time: '', type: 'file' }],
        newStartPageToken: 'token-2'
    });

    const result = await detection.getAllChangesSinceLastCheck(FOLDER);

    assert.equal(result.needsFullScan, false);
    assert.equal(result.changes.length, 1);
    assert.equal(result.newPageToken, 'token-2');
    assert.equal(stored().token, 'token-1', 'token must not move before the sync succeeded');

    await detection.commitPageToken(result.newPageToken!, FOLDER, false);

    assert.equal(stored().token, 'token-2');
    assert.equal(stored().lastFullScan, VALID_TOKEN.lastFullScan);
    assert.equal(stored().folderId, FOLDER);
});
