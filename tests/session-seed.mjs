import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createRenderer } from './helpers/component-tree.mjs';

const jar = values => ({ get: name => values[name] === undefined ? undefined : { value: values[name] }, has: name => name in values });

test('the page names the person its access cookie verifies, and nobody for a missing, forged or expired one', async () => {
 const env = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY };
 process.env.SUPABASE_URL = 'https://db.local'; process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable';
 try {
  const tokens = { good: { id: 'me', email: 'me@example.com' }, phone: { id: 'p', email: '', phone: '+998901234567' } };
  const verified = [];
  const lib = cookies => loadTS('lib/supabase.ts', { 'next/headers': { cookies: async () => jar(cookies) }, './supabase-jwt': { tokenVerifier: () => async token => { verified.push(token); return tokens[token] ?? null; } } });
  assert.deepEqual(await lib({ hf_access: 'good' }).cookieUser(), { email: 'me@example.com' });
  assert.deepEqual(await lib({ hf_access: 'phone' }).cookieUser(), { email: '+998901234567' }, 'as /api/auth names a phone account');
  assert.equal(await lib({ hf_access: 'forged' }).cookieUser(), null);
  assert.equal(await lib({ hf_refresh: 'refresh-only' }).cookieUser(), null, 'a refresh is left to the session check');
  assert.ok(!verified.includes('refresh-only'));
  const broken = loadTS('lib/supabase.ts', { 'next/headers': { cookies: async () => { throw Error('outside a request'); } } });
  assert.equal(await broken.cookieUser(), null);
 } finally { for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('a person the page already names starts signed in, and the session check still has the last word', async () => {
 const replies = [], answer = body => new Promise(resolve => replies.push(() => resolve({ json: async () => body })));
 let session = { configured: true, user: { email: 'me@example.com' } };
 globalThis.fetch = async url => { assert.equal(String(url), '/api/auth'); return answer(session); };
 const run = async known => {
  const r = createRenderer();
  const { useAuth } = r.load('components/workspace/state/use-auth.ts', { '@/components/visitor-context': { useVisitor: () => ({ signedOut: false, user: known, language: 'en' }) } });
  let auth;
  const Probe = () => { auth = useAuth({ setError: () => {}, setBusy: () => {} }); return null; };
  r.mount(React.createElement(Probe));
  const first = { user: auth.user, ready: auth.ready };
  return { first, auth: () => auth, settle: async () => { replies.shift()(); for (let i = 0; i < 3; i++) { await new Promise(resolve => setTimeout(resolve, 0)); r.update(); } } };
 };
 globalThis.window = { location: { href: 'https://app.test/' }, history: { replaceState() {} } };
 try {
  const seeded = await run('me@example.com');
  assert.deepEqual(seeded.first, { user: 'me@example.com', ready: true }, 'no wait for the session check');
  await seeded.settle();
  assert.equal(seeded.auth().user, 'me@example.com');
  // A session ended elsewhere: the check answers signed out, and the page follows it.
  session = { configured: true, user: null };
  const ended = await run('me@example.com');
  await ended.settle();
  assert.equal(ended.auth().user, null);
  // Without a verified cookie the page waits for the check, as before.
  session = { configured: true, user: { email: 'me@example.com' } };
  const unknown = await run(undefined);
  assert.deepEqual(unknown.first, { user: null, ready: false });
  await unknown.settle();
  assert.deepEqual({ user: unknown.auth().user, ready: unknown.auth().ready }, { user: 'me@example.com', ready: true });
 } finally { delete globalThis.window; }
});
