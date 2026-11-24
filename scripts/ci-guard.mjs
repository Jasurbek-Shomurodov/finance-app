// Keeps a red CI from going unnoticed. The pre-push hook (.githooks/pre-push) runs it twice:
//   node scripts/ci-guard.mjs status <branch>  says whether the branch's last finished "Project checks" run failed, and
//                                              which jobs and steps, so the push that follows can carry the fix;
//   node scripts/ci-guard.mjs watch <sha>      started in the background after the hook's checks, waits for the run of
//                                              that commit and raises a desktop notification when it fails.
//   node scripts/ci-guard.mjs main-ready <sha> run for a push to main: refuses a commit CI has not passed yet, so main
//                                              only receives commits that were green on their feature branch.
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

const docsOnly = files => files.length > 0 && files.every(file => /^docs\/|\.md$/.test(file));

/** Whether a commit may go to main, and if not, what to say. `facts` reads git and GitHub, so the rule tests alone:
 *  runs(sha) the CI runs of a commit (null when GitHub cannot be read), onMain(sha) whether origin/main already holds it,
 *  parents(sha) its parents, changed(sha) the files it changes against origin/main. */
export function mainReadiness(sha, facts) {
 const runs = facts.runs(sha);
 if (runs === null) return { ok: true, note: 'ci-guard: could not read CI (gh missing, signed out or offline); not checking that this commit passed.' };
 if (runs.some(run => run.conclusion === 'success')) return { ok: true, note: 'ci-guard: CI passed this commit; it may go to main.' };
 if (docsOnly(facts.changed(sha))) return { ok: true, note: 'ci-guard: documentation only; it may go to main.' };
 // A merge of a green branch into a newer main: each side is either main already or a commit CI passed.
 const parents = facts.parents(sha);
 if (parents.length > 1 && parents.every(parent => facts.onMain(parent) || (facts.runs(parent) ?? []).some(run => run.conclusion === 'success')))
  return { ok: true, note: 'ci-guard: a merge of commits CI passed; it may go to main.' };
 const running = runs.find(run => run.status !== 'completed');
 const short = sha.slice(0, 8);
 if (running) return { ok: false, note: `ci-guard: CI is still running for ${short} (gh run watch ${running.databaseId}). Push to main once it is green.` };
 if (runs.some(run => run.conclusion === 'cancelled') && !runs.some(run => run.conclusion === 'failure'))
  return { ok: false, note: `ci-guard: CI stopped for ${short}, usually because CI committed redrawn Linux pictures on top of it. git pull, then push the newer commit once its run is green.` };
 const failed = runs.find(run => run.status === 'completed');
 if (failed) return { ok: false, note: `ci-guard: CI ${failed.conclusion === 'failure' ? 'failed' : failed.conclusion} for ${short} (gh run view ${failed.databaseId} --log-failed). Fix it on the feature branch first.` };
 return { ok: false, note: `ci-guard: CI has not run ${short} yet. Main only takes commits CI passed:\n  1. git push -u origin HEAD:feature/<short-description>\n  2. wait for the run to go green; a UI change gets its Linux pictures committed to the branch by CI, then a second run\n  3. git pull (to take the pictures commit), then git push origin HEAD:main` };
}

function gitLines(args) {
 try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); } catch { return []; }
}

function mainReady(sha) {
 const facts = {
  runs: commit => gh(['run', 'list', '--workflow', workflow, '--commit', commit, '--limit', '10', '--json', 'databaseId,status,conclusion']),
  onMain: commit => { try { execFileSync('git', ['merge-base', '--is-ancestor', commit, 'origin/main'], { stdio: 'ignore' }); return true; } catch { return false; } },
  parents: commit => gitLines(['rev-list', '--parents', '-n', '1', commit]).join(' ').split(' ').slice(1),
  changed: commit => gitLines(['diff', '--name-only', 'origin/main', commit]),
 };
 const { ok, note } = mainReadiness(sha, facts);
 (ok ? console.log : console.error)(note);
 return ok;
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
 else if (command === 'main-ready') process.exit(mainReady(value) ? 0 : 1);
 else { console.error('usage: ci-guard.mjs status <branch> | watch <sha> | spawn-watch <sha> | main-ready <sha>'); process.exit(2); }
}
