import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Logger, LogLevel } from '../src/utils/logger';
import { createSyncFixture, fileChange, remoteFile, ROOT_FOLDER_ID } from './helpers/sync-fixture';

// The sync engine logs every file; keep test output readable
Logger.setLevel(LogLevel.ERROR);
console.log = () => undefined;
console.error = () => undefined;

const MY_DRIVE_ROOT = 'my-drive-root';

test('changes outside the sync folder are not downloaded', async () => {
    const { engine, vault, drive, changeDetection } = await createSyncFixture([]);
    drive.metadata.set('invoices', remoteFile('invoices', 'Invoices', { parents: [MY_DRIVE_ROOT] }));
    drive.metadata.set(MY_DRIVE_ROOT, remoteFile(MY_DRIVE_ROOT, 'My Drive', { parents: undefined }));
    changeDetection.result = {
        needsFullScan: false,
        changes: [fileChange(remoteFile('id-x', '2026.md', { parents: ['invoices'] }))],
        newPageToken: 'token-2'
    };

    const result = await engine.performSync();

    assert.equal(result.success, true);
    assert.deepEqual([...vault.files.keys()], []);
});

test('changes in a subfolder of the sync folder get the subfolder path', async () => {
    const { engine, vault, drive, changeDetection } = await createSyncFixture([]);
    drive.metadata.set('id-sub', remoteFile('id-sub', 'notes', { parents: [ROOT_FOLDER_ID] }));
    changeDetection.result = {
        needsFullScan: false,
        changes: [fileChange(remoteFile('id-x', 'x.md', { parents: ['id-sub'] }))],
        newPageToken: 'token-2'
    };

    const result = await engine.performSync();

    assert.equal(result.success, true);
    assert.deepEqual([...vault.files.keys()], ['notes/x.md']);
});

test('a synced file moved out of the sync folder is moved to local trash', async () => {
    const { engine, vault, drive, changeDetection } = await createSyncFixture([
        { path: 'a.md', driveId: 'id-a' },
        { path: 'b.md', driveId: 'id-b' }
    ]);
    drive.metadata.set('elsewhere', remoteFile('elsewhere', 'Elsewhere', { parents: [MY_DRIVE_ROOT] }));
    changeDetection.result = {
        needsFullScan: false,
        changes: [fileChange(remoteFile('id-a', 'a.md', { parents: ['elsewhere'] }))],
        newPageToken: 'token-2'
    };

    const result = await engine.performSync();

    assert.equal(result.success, true);
    assert.deepEqual(vault.trashed, ['a.md']);
    assert.ok(vault.files.has('b.md'));
});

test('a failing parent lookup does not commit the change token and falls back to a full listing', async () => {
    const { engine, drive, changeDetection, settings } = await createSyncFixture([]);
    drive.getFileMetadata = async () => {
        throw new Error('Drive API error 500: Backend Error');
    };
    changeDetection.result = {
        needsFullScan: false,
        changes: [fileChange(remoteFile('id-x', 'x.md', { parents: ['id-sub'] }))],
        newPageToken: 'token-2'
    };

    await engine.performSync();

    assert.deepEqual(changeDetection.commits, [], 'the change must be read again next time');
    assert.equal(settings.changeDetectionFailureCount, 1);
});
