// Keeps a red CI from going unnoticed. The pre-push hook (.githooks/pre-push) runs it twice:
//   node scripts/ci-guard.mjs status <branch>  says whether the branch's last finished "Project checks" run failed, and
//                                              which jobs and steps, so the push that follows can carry the fix;
//   node scripts/ci-guard.mjs watch <sha>      started in the background after the hook's checks, waits for the run of
//                                              that commit and raises a desktop notification when it fails.
// It reads GitHub through the `gh` login already used for pushing. Without `gh` (or offline) it says so and never
// blocks a push: CI itself stays the judge.
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const workflow = 'checks.yml';
const pollSeconds = 30, giveUpMinutes = 60;

/** `gh` with JSON output, or null when it is missing, signed out or offline. */
export function gh(args, run = execFileSync) {
 try { return JSON.parse(run('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 })); }
 catch { return null; }
}

/** The failing jobs and steps of a run, as lines to print. */
export function failureLines(run) {
 return (run?.jobs ?? []).filter(job => job.conclusion === 'failure').map(job => {
  const steps = (job.steps ?? []).filter(step => step.conclusion === 'failure').map(step => step.name);
  return `  ${job.name}: ${steps.join(', ') || 'failed'}`;
 });
}

/** What `status` says about the latest finished run of a branch: null when it passed or nothing is known. */
export function statusMessage(runs, failedSince) {
 const last = runs?.find(run => run.status === 'completed');
 if (!last || last.conclusion === 'success') return null;
 const streak = failedSince ? ` (red since ${failedSince})` : '';
 return `CI is ${last.conclusion} on ${last.headBranch}${streak}: "${last.displayTitle}"\n  ${last.url}`;
}

/** The oldest commit date of the current run of failures, so a long-red branch says how long. */
function failedSince(runs) {
 const finished = runs.filter(run => run.status === 'completed');
 let oldest = null;
 for (const run of finished) { if (run.conclusion === 'success') break; oldest = run.createdAt; }
 return oldest?.slice(0, 10) ?? null;
}

function status(branch) {
 const runs = gh(['run', 'list', '--workflow', workflow, '--branch', branch, '--limit', '30', '--json', 'databaseId,status,conclusion,displayTitle,headBranch,url,createdAt']);
 if (!runs) { console.log('ci-guard: could not read CI (gh missing, signed out or offline); skipping the check.'); return; }
 const message = statusMessage(runs, failedSince(runs));
 if (!message) { console.log(`ci-guard: the last CI run on ${branch} passed.`); return; }
 const last = runs.find(run => run.status === 'completed');
 const detail = gh(['run', 'view', String(last.databaseId), '--json', 'jobs']);
 console.warn(`\nci-guard: ${message}`);
 for (const line of failureLines(detail)) console.warn(line);
 console.warn('  Read it with: gh run view ' + last.databaseId + ' --log-failed\n  Fix CI before (or with) this push.\n');
}

function notify(title, text) {
 if (process.platform !== 'darwin') return;
 const quote = value => JSON.stringify(value);
 try { execFileSync('osascript', ['-e', `display notification ${quote(text)} with title ${quote(title)}`], { stdio: 'ignore' }); } catch { /* no notification centre */ }
}

async function watch(sha) {
 const deadline = Date.now() + giveUpMinutes * 60_000;
 while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, pollSeconds * 1000));
  const run = gh(['run', 'list', '--workflow', workflow, '--commit', sha, '--limit', '1', '--json', 'databaseId,status,conclusion,displayTitle,url'])?.[0];
  if (!run || run.status !== 'completed') continue;
  if (run.conclusion !== 'success') notify('CI failed', `${run.displayTitle} · gh run view ${run.databaseId} --log-failed`);
  return;
 }
}

/** Starts `watch` detached from the hook, so the push is not held while CI runs. */
function spawnWatch(sha) {
 const child = spawn(process.execPath, [new URL(import.meta.url).pathname, 'watch', sha], { detached: true, stdio: 'ignore' });
 child.unref();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
 const [command, value] = process.argv.slice(2);
 if (command === 'status') status(value || 'main');
 else if (command === 'watch') await watch(value);
 else if (command === 'spawn-watch') spawnWatch(value);
 else { console.error('usage: ci-guard.mjs status <branch> | watch <sha> | spawn-watch <sha>'); process.exit(2); }
}
