import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Logger, LogLevel } from '../src/utils/logger';
import {
    createSyncFixture,
    remoteFile,
    removedChange,
    trashedChange,
    ROOT_FOLDER_ID
} from './helpers/sync-fixture';

const SYNCED = [
    { path: 'a.md', driveId: 'id-a' },
    { path: 'b.md', driveId: 'id-b' }
];

// The sync engine logs every file; keep test output readable
Logger.setLevel(LogLevel.ERROR);
console.log = () => undefined;
console.error = () => undefined;

test('incremental sync with no remote changes deletes nothing', async () => {
    const { engine, vault, drive, changeDetection } = await createSyncFixture(SYNCED);
    changeDetection.result = { needsFullScan: false, changes: [], newPageToken: 'token-2' };

    const result = await engine.performSync();

    assert.equal(result.success, true);
    assert.deepEqual(vault.trashed, []);
    assert.deepEqual(drive.trashedIds, []);
    assert.deepEqual([...vault.files.keys()].sort(), ['a.md', 'b.md']);
    assert.deepEqual(changeDetection.commits, [{ token: 'token-2', folderId: ROOT_FOLDER_ID, fullScan: false }]);
});

test('files reported removed or trashed by Drive are moved to local trash', async () => {
    const { engine, vault, indexManager, changeDetection } = await createSyncFixture([
        ...SYNCED,
        { path: 'c.md', driveId: 'id-c' }
    ]);
    changeDetection.result = {
        needsFullScan: false,
        changes: [removedChange('id-a'), trashedChange(remoteFile('id-b', 'b.md'))],
        newPageToken: 'token-2'
    };

    const result = await engine.performSync();

    assert.equal(result.success, true);
    assert.deepEqual(vault.trashed.sort(), ['a.md', 'b.md']);
    assert.deepEqual([...vault.files.keys()], ['c.md']);
    assert.equal(indexManager.getFileEntry('a.md'), undefined);
});

test('full scan treats files missing from Drive as deleted and commits the start token', async () => {
    const { engine, vault, drive, changeDetection } = await createSyncFixture(SYNCED);
    changeDetection.result = { needsFullScan: true, changes: [] };
    drive.folders.set(ROOT_FOLDER_ID, [remoteFile('id-b', 'b.md')]);

    const result = await engine.performSync();

    assert.equal(result.success, true);
    assert.deepEqual(vault.trashed, ['a.md']);
    assert.deepEqual(changeDetection.commits, [{ token: 'start-token', folderId: ROOT_FOLDER_ID, fullScan: true }]);
});

test('local deletion moves the Drive file to trash instead of deleting it', async () => {
    const { engine, vault, drive, changeDetection } = await createSyncFixture(SYNCED);
    changeDetection.result = { needsFullScan: false, changes: [], newPageToken: 'token-2' };
    vault.files.delete('a.md');
    vault.contents.delete('a.md');

    const result = await engine.performSync();

    assert.equal(result.success, true);
    assert.deepEqual(drive.trashedIds, ['id-a']);
});

test('failed sync keeps the old change token and last sync time', async () => {
    const { engine, drive, changeDetection, settings } = await createSyncFixture(SYNCED);
    settings.lastSyncTime = '2026-01-01T00:00:00.000Z';
    changeDetection.result = {
        needsFullScan: false,
        changes: [{ fileId: 'id-new', file: remoteFile('id-new', 'new.md'), time: '', type: 'file' }],
        newPageToken: 'token-2'
    };
    drive.downloadError = new Error('network down');

    const result = await engine.performSync();

    assert.equal(result.success, false);
    assert.deepEqual(changeDetection.commits, []);
    assert.equal(settings.lastSyncTime, '2026-01-01T00:00:00.000Z');
});

test('timestamp fallback walks unchanged subfolders and deletes nothing', async () => {
    const { engine, vault, drive, settings } = await createSyncFixture(SYNCED);
    settings.disableChangeDetection = true;
    settings.lastSyncTime = '2026-01-01T00:00:00.000Z';

    const subfolder = remoteFile('id-sub', 'notes');
    const nested = remoteFile('id-nested', 'nested.md', { parents: ['id-sub'] });
    drive.folders.set(ROOT_FOLDER_ID, [...(drive.folders.get(ROOT_FOLDER_ID) || []), subfolder]);
    drive.folders.set('id-sub', [nested]);
    drive.recentlyModified.add('id-nested');

    const result = await engine.performSync();

    assert.equal(result.success, true);
    assert.ok(vault.files.has('notes/nested.md'), 'file in an unchanged subfolder must be downloaded');
    assert.deepEqual(vault.trashed, []);
});

test('each sync is logged between a start and an end marker', async () => {
    const { engine, changeDetection } = await createSyncFixture(SYNCED);
    changeDetection.result = { needsFullScan: false, changes: [], newPageToken: 'token-2' };

    await engine.performSync();

    const messages = Logger.getLastSyncEntries().map(e => e.message);
    assert.match(messages[0], /^Sync started/);
    assert.match(messages[messages.length - 1], /^Sync completed/);
});
