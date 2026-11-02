import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

test('a failure without a JSON body never reads as a blank message', async t => {
 const { requestJson } = loadTS('lib/api-client.ts');
 t.mock.method(globalThis, 'fetch', async () => new Response('<html>Payload too large</html>', { status: 413 }));
 await assert.rejects(requestJson('/api/backup', { body: {} }), error => error.message === 'Could not save changes.' && error.confirmedFailure === true && error.status === 413);
 await assert.rejects(requestJson('/api/backup', { body: {}, fallback: 'Could not restore.' }), { message: 'Could not restore.' });
 t.mock.restoreAll();
 t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'File is too large.' }, { status: 413 }));
 await assert.rejects(requestJson('/api/backup', { body: {} }), { message: 'File is too large.' }, 'the server\'s own words win');
});
