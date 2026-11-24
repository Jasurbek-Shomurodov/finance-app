// Takes the Linux pictures of the screenshot tests (e2e/screens.spec.mjs) from a CI run. A push to a feature branch
// no longer needs it: CI redraws the changed Linux pictures and commits them to the branch itself (the `pictures` job
// in .github/workflows/checks.yml). This is for a strict run (main, a pull request) that failed on a picture: it
// copies what that run drew (`-actual.png` in its playwright-report-* artifacts) into e2e/<spec>-snapshots/ as the
// new -linux pictures. Look at each one before committing it.
//
//   npm run screenshots:ci            the latest failed run of this branch
//   npm run screenshots:ci -- <id>    a given run
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
const run = process.argv[2] ?? gh('run', 'list', '--workflow', 'checks.yml', '--branch', branch, '--status', 'failure', '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId');
if (!run) throw new Error(`No failed CI run on ${branch} to take pictures from.`);

const folder = mkdtempSync(path.join(tmpdir(), 'ci-screenshots-'));
try {
  gh('run', 'download', run, '--pattern', 'playwright-report*', '--dir', folder);
  const walk = dir => readdirSync(dir).flatMap(name => { const file = path.join(dir, name); return statSync(file).isDirectory() ? walk(file) : [file]; });
  const specs = readdirSync('e2e').filter(name => name.endsWith('.spec.mjs')).map(name => name.slice(0, -'.spec.mjs'.length));
  const copied = walk(folder).filter(file => file.endsWith('-actual.png')).map(file => {
    // test-results/<spec>-<test title>-<project>[-retry<n>]/<picture>-actual.png; a retry draws the same picture.
    const test = path.basename(path.dirname(file)).replace(/-retry\d+$/, ''), spec = specs.find(name => test.startsWith(name + '-'));
    if (!spec) throw new Error(`No spec in e2e/ matches ${test}.`);
    const project = test.slice(test.lastIndexOf('-') + 1);
    const target = path.join('e2e', `${spec}.spec.mjs-snapshots`, `${path.basename(file, '-actual.png')}-${project}-linux.png`);
    copyFileSync(file, target);
    return target;
  }).filter((target, index, all) => all.indexOf(target) === index);
  console.log(copied.length ? `From run ${run}:\n  ${copied.join('\n  ')}` : `Run ${run} drew no new pictures.`);
} finally {
  rmSync(folder, { recursive: true, force: true });
}
