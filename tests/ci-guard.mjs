import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { failureLines, gh, mainReadiness, statusMessage } from '../scripts/ci-guard.mjs';

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
 assert.match(hook, /refs\/heads\/main[\s\S]*ci-guard\.mjs main-ready "\$local_sha" \|\| exit 1[\s\S]*done \|\| exit 1/);
 assert.ok(fs.statSync('.githooks/pre-push').mode & 0o111, 'the hook is executable');
});

test('main takes only a commit CI passed, a docs-only change, or a merge of passed commits into main', () => {
 const facts = (runs, more = {}) => ({ runs: sha => runs[sha] ?? [], onMain: () => false, parents: () => ['p'], changed: () => ['lib/a.ts'], ...more });
 const green = { status: 'completed', conclusion: 'success', databaseId: 1 };
 assert.equal(mainReadiness('abc', facts({ abc: [green] })).ok, true);
 // Offline or signed out: CI cannot be read, so the push is not held (CI still runs on main).
 assert.equal(mainReadiness('abc', facts({}, { runs: () => null })).ok, true);
 assert.equal(mainReadiness('abc', facts({}, { changed: () => ['docs/agents/a.md', 'AGENTS.md'] })).ok, true);
 const merge = { parents: () => ['main1', 'feat'], onMain: sha => sha === 'main1' };
 assert.equal(mainReadiness('m', facts({ feat: [green] }, merge)).ok, true);
 assert.equal(mainReadiness('m', facts({}, merge)).ok, false);
 // Not run yet, still running, failed, or stopped for a pictures commit: refused, each saying what to do.
 assert.match(mainReadiness('abcdef1234', facts({})).note, /has not run abcdef12 yet[\s\S]*feature\/<short-description>/);
 assert.match(mainReadiness('abc', facts({ abc: [{ status: 'in_progress', databaseId: 7 }] })).note, /still running .*gh run watch 7/);
 assert.match(mainReadiness('abc', facts({ abc: [{ status: 'completed', conclusion: 'failure', databaseId: 8 }] })).note, /failed .*gh run view 8 --log-failed/);
 const stopped = mainReadiness('abc', facts({ abc: [{ status: 'completed', conclusion: 'cancelled', databaseId: 9 }] }));
 assert.equal(stopped.ok, false);
 assert.match(stopped.note, /git pull/);
 // A docs change with no files (an empty diff) is not a free pass.
 assert.equal(mainReadiness('abc', facts({}, { changed: () => [] })).ok, false);
});

test('CI shards the tests, skips a commit that already passed, and commits redrawn Linux pictures only off main', () => {
 const workflow = fs.readFileSync('.github/workflows/checks.yml', 'utf8');
 assert.match(workflow, /group: checks-\$\{\{ github\.sha \}\}/);
 assert.match(workflow, /head_sha=\$GITHUB_SHA&status=success/);
 assert.match(workflow, /npx playwright test --shard=\$\{\{ matrix\.shard \}\}\/3/);
 assert.match(workflow, /REDRAW: \$\{\{ github\.event_name == 'push' && github\.ref != 'refs\/heads\/main' \}\}/);
 assert.match(workflow, /--update-snapshots=changed/);
 assert.match(workflow, /gh workflow run checks\.yml[\s\S]*gh run cancel "\$GITHUB_RUN_ID"/);
 assert.match(fs.readFileSync('playwright.config.mjs', 'utf8'), /fullyParallel: true/);
});
