import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Logger, LogLevel } from '../src/utils/logger';

console.log = () => undefined;
console.debug = () => undefined;
console.warn = () => undefined;
console.error = () => undefined;

function reset(): void {
    Logger.setLevel(LogLevel.INFO);
    Logger.clearEntries();
}

test('keeps only the most recent 500 entries', () => {
    reset();
    for (let i = 0; i < 520; i++) {
        Logger.info('Test', `entry ${i}`);
    }
    const entries = Logger.getEntries();
    assert.equal(entries.length, 500);
    assert.equal(entries[0].message, 'entry 20');
    assert.equal(entries[499].message, 'entry 519');
});

test('entries respect the log level', () => {
    reset();
    Logger.debug('Test', 'hidden');
    Logger.info('Test', 'shown');
    assert.deepEqual(Logger.getEntries().map(e => e.message), ['shown']);
});

test('last sync entries are the ones between startSync and endSync of the latest sync', () => {
    reset();
    Logger.startSync('Sync started');
    Logger.info('Test', 'first sync');
    Logger.endSync('Sync completed');
    Logger.info('Test', 'between syncs');
    Logger.startSync('Sync started');
    Logger.info('Test', 'second sync');
    Logger.endSync('Sync failed', { errors: 1 }, true);

    const messages = Logger.getLastSyncEntries().map(e => e.message);
    assert.equal(messages.length, 3);
    assert.equal(messages[0], 'Sync started');
    assert.equal(messages[1], 'second sync');
    assert.match(messages[2], /^Sync failed/);
});

test('sync markers are recorded even when the level hides info', () => {
    reset();
    Logger.setLevel(LogLevel.ERROR);
    Logger.startSync('Sync started');
    Logger.info('Test', 'hidden');
    Logger.endSync('Sync completed');
    assert.deepEqual(Logger.getLastSyncEntries().map(e => e.message), ['Sync started', 'Sync completed']);
});

test('messages and context are redacted before they are stored', () => {
    reset();
    Logger.info('Test', 'token ya29.secret-value', { refresh_token: '1//another-secret', path: 'a/b.md' });
    const text = Logger.formatEntries(Logger.getEntries());
    assert.doesNotMatch(text, /secret-value|another-secret/);
    assert.match(text, /a\/b\.md/);
});
