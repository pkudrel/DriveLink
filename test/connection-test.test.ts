import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ConnectionTestDeps, runConnectionTest } from '../src/drive/connection-test';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function deps(overrides: Partial<{ token: () => Promise<string>; user: () => Promise<any>; folder: () => Promise<any>; changes: () => Promise<string>; folderId: string }> = {}): ConnectionTestDeps {
    return {
        tokenManager: {
            getValidAccessToken: overrides.token || (async () => 'ya29.token'),
            getTokenStatus: async () => ({ connected: true, expiresAt: Date.now() + 42 * 60000, source: 'simple_token' as const })
        },
        driveClient: {
            getUserInfo: overrides.user || (async () => ({ emailAddress: 'john@gmail.com', displayName: 'John' })),
            getFileMetadata: overrides.folder || (async () => ({ id: 'f', name: 'Vault', mimeType: FOLDER_MIME, modifiedTime: '' })),
            listFiles: async () => ({ files: [{ id: '1', name: 'a.md', mimeType: 'text/markdown', modifiedTime: '' }] })
        } as any,
        getStartPageToken: overrides.changes || (async () => '123'),
        folderId: overrides.folderId ?? 'f'
    };
}

test('all steps pass with a working setup', async () => {
    const checks = await runConnectionTest(deps());
    assert.deepEqual(checks.map(c => c.status), ['ok', 'ok', 'ok', 'ok']);
    assert.match(checks[0].detail, /expires in 4[12] min/);
    assert.equal(checks[1].detail, 'connected as j***@gmail.com');
    assert.equal(checks[2].detail, '"Vault", 1 item(s) at the top level');
});

test('a token failure skips the steps that need it and gives a hint', async () => {
    const checks = await runConnectionTest(deps({
        token: async () => { throw new Error('Token refresh failed: HTTP 400 invalid_grant'); }
    }));
    assert.deepEqual(checks.map(c => c.status), ['failed', 'skipped', 'skipped', 'skipped']);
    assert.ok(checks[0].hint);
});

test('a missing or trashed folder fails only the folder step', async () => {
    const missing = await runConnectionTest(deps({ folderId: '' }));
    assert.deepEqual(missing.map(c => c.status), ['ok', 'ok', 'failed', 'ok']);
    assert.match(missing[2].detail, /no Drive folder configured/);

    const trashed = await runConnectionTest(deps({
        folder: async () => ({ id: 'f', name: 'Vault', mimeType: FOLDER_MIME, modifiedTime: '', trashed: true })
    }));
    assert.match(trashed[2].detail, /in the Drive trash/);
});

test('error messages are redacted', async () => {
    const checks = await runConnectionTest(deps({
        user: async () => { throw new Error('Drive API error 401: bad token ya29.leaked'); }
    }));
    assert.doesNotMatch(checks[1].detail, /leaked/);
});
