import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { App, Plugin } from 'obsidian';
import DriveLinkPlugin from '../src/main';
import { TokenManager, TOKEN_STORAGE_KEY } from '../src/auth/token-manager';
import { IndexManager, INDEX_STORAGE_KEY } from '../src/sync/index-manager';

function createPlugin(initialData?: object): DriveLinkPlugin {
    const plugin = new DriveLinkPlugin(new App() as any, {} as any);
    if (initialData) {
        (plugin as unknown as Plugin & { storedJson: string }).storedJson = JSON.stringify(initialData);
    }
    return plugin;
}

function stored(plugin: DriveLinkPlugin): any {
    return JSON.parse((plugin as unknown as { storedJson: string }).storedJson);
}

const SAMPLE_TOKENS = JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 });

test('saveSettings keeps tokens and index written after startup (fresh install)', async () => {
    const plugin = createPlugin();
    await plugin.loadSettings();

    const tokenManager = new TokenManager(plugin);
    assert.equal(await tokenManager.importSimpleTokenData(SAMPLE_TOKENS), true);
    const indexManager = new IndexManager(plugin);
    await indexManager.clearIndex();

    plugin.settings.lastSyncTime = '2026-10-26T00:00:00.000Z';
    await plugin.saveSettings();

    const data = stored(plugin);
    assert.equal(data[TOKEN_STORAGE_KEY].accessToken, 'access-1');
    assert.ok(data[INDEX_STORAGE_KEY], 'index must survive saveSettings');
    assert.equal(data.lastSyncTime, '2026-10-26T00:00:00.000Z');
});

test('saveSettings does not roll the index back to its startup snapshot', async () => {
    const plugin = createPlugin({
        driveFolderId: 'folder-1',
        [INDEX_STORAGE_KEY]: { version: '1.0.0', lastUpdated: 1, files: { 'old.md': { path: 'old.md', size: 1, mtime: 1 } }, driveToLocal: {} },
    });
    await plugin.loadSettings();

    assert.equal(plugin.settings.driveFolderId, 'folder-1');
    assert.equal((plugin.settings as any)[INDEX_STORAGE_KEY], undefined, 'settings must not carry the index');

    await plugin.updateData(data => {
        data[INDEX_STORAGE_KEY] = { version: '1.0.0', lastUpdated: 2, files: { 'new.md': { path: 'new.md', size: 2, mtime: 2 } }, driveToLocal: {} };
    });
    await plugin.saveSettings();

    const files = stored(plugin)[INDEX_STORAGE_KEY].files;
    assert.deepEqual(Object.keys(files), ['new.md']);
});

test('saveSettings does not resurrect tokens cleared after startup', async () => {
    const plugin = createPlugin({ [TOKEN_STORAGE_KEY]: { accessToken: 'stale' } });
    await plugin.loadSettings();

    await new TokenManager(plugin).clearTokens();
    await plugin.saveSettings();

    assert.equal(stored(plugin)[TOKEN_STORAGE_KEY], undefined);
});

test('concurrent updateData calls do not lose writes', async () => {
    const plugin = createPlugin({});

    await Promise.all(Array.from({ length: 20 }, (_, i) =>
        plugin.updateData(data => {
            data[`key-${i}`] = i;
        })
    ));

    const data = stored(plugin);
    for (let i = 0; i < 20; i++) {
        assert.equal(data[`key-${i}`], i);
    }
});

test('a failing write does not block later writes', async () => {
    const plugin = createPlugin({});

    await assert.rejects(plugin.updateData(() => {
        throw new Error('boom');
    }), /boom/);
    await plugin.updateData(data => {
        data.after = true;
    });

    assert.equal(stored(plugin).after, true);
});
