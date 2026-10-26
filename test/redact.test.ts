import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { maskEmail, redact } from '../src/utils/redact';

test('removes Google tokens and client secrets', () => {
    const text = 'access ya29.a0AfH6SMBx-y_z.123 refresh 1//0gAbC-dEf_123 secret GOCSPX-AbC_123-xyz';
    assert.equal(redact(text), 'access *** refresh *** secret ***');
});

test('removes secret values in JSON, query strings and headers', () => {
    const json = '{"access_token": "abc", "refreshToken":"def", "client_secret": "ghi", "name": "note.md"}';
    assert.equal(
        redact(json),
        '{"access_token": "***", "refreshToken":"***", "client_secret": "***", "name": "note.md"}'
    );
    assert.equal(redact('grant_type=refresh_token&refresh_token=xyz&client_id=1'), 'grant_type=refresh_token&refresh_token=***&client_id=1');
    assert.equal(redact('Authorization: Bearer abc.def-123'), 'Authorization: Bearer ***');
});

test('masks email addresses', () => {
    assert.equal(maskEmail('john.doe@gmail.com'), 'j***@gmail.com');
    assert.equal(redact('connected as john.doe@gmail.com'), 'connected as j***@gmail.com');
});

test('keeps paths, file names and ordinary text', () => {
    const text = 'Failed to upload Projects/2026/notes.md (size 123, id 1AbCdEf)';
    assert.equal(redact(text), text);
});
