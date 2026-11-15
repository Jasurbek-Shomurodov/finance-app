import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { failureLines, gh, statusMessage } from '../scripts/ci-guard.mjs';

const run = (conclusion, title = 'A commit') => ({ status: 'completed', conclusion, headBranch: 'main', displayTitle: title, url: 'https://example.test/run', createdAt: '2026-11-14T10:00:00Z' });

test('a passed or unknown last run says nothing; a failed one names the branch, the commit and how long it has been red', () => {
 assert.equal(statusMessage([run('success')]), null);
 assert.equal(statusMessage([]), null);
 assert.equal(statusMessage(null), null);
 // A run still in progress is passed over for the last finished one.
 assert.equal(statusMessage([{ status: 'in_progress' }, run('success')]), null);
 const message = statusMessage([{ status: 'queued' }, run('failure', 'Dashboard: a change')], '2026-11-14');
 assert.match(message, /^CI is failure on main \(red since 2026-11-14\): "Dashboard: a change"/);
 assert.match(message, /https:\/\/example\.test\/run/);
});

test('only failed jobs and their failed steps are listed', () => {
 const lines = failureLines({ jobs: [
  { name: 'verify', conclusion: 'failure', steps: [{ name: 'npm ci', conclusion: 'success' }, { name: 'Run npm run test:coverage', conclusion: 'failure' }] },
  { name: 'e2e', conclusion: 'success', steps: [] },
  { name: 'lint', conclusion: 'failure', steps: [] },
 ] });
 assert.deepEqual(lines, ['  verify: Run npm run test:coverage', '  lint: failed']);
 assert.deepEqual(failureLines(null), []);
});

test('gh answers parsed JSON, and a missing, signed-out or offline gh reads as unknown instead of failing the push', () => {
 assert.deepEqual(gh(['run', 'list'], () => '[{"status":"completed"}]'), [{ status: 'completed' }]);
 assert.equal(gh(['run', 'list'], () => { throw new Error('gh: command not found'); }), null);
 assert.equal(gh(['run', 'list'], () => 'not json'), null);
});

test('the pre-push hook warns about a red CI, refuses a failing type check and watches the pushed commit', () => {
 const hook = fs.readFileSync('.githooks/pre-push', 'utf8');
 assert.match(hook, /ci-guard\.mjs status/);
 assert.match(hook, /npm run typecheck[\s\S]*exit 1/);
 assert.match(hook, /ci-guard\.mjs spawn-watch "\$local_sha"/);
 assert.ok(fs.statSync('.githooks/pre-push').mode & 0o111, 'the hook is executable');
});
