import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { lcovFiles, mergeLcov, percent, totals } from './lcov.mjs';
// node scripts/test.mjs                      every test
// node scripts/test.mjs --integration        the integration test only
// node scripts/test.mjs --coverage           every test, then the coverage check below
// node scripts/test.mjs --coverage --shard=2/6
//                                            one CI shard's share of the test files; writes coverage/lcov.info and
//                                            leaves the check to the merge, since one shard runs only part of the code
// node scripts/test.mjs --check-coverage=<folder>
//                                            merges every lcov.info under the folder (the shards) and runs the check
//
// The coverage check fails when line, branch or function coverage drops below scripts/coverage-floor.json, or when an
// app file that no test runs is not on that file's `untested` list, so new pages and helpers arrive with tests and
// the list only ever shrinks.
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const integration=process.argv.includes('--integration');
const coverage=process.argv.includes('--coverage');
const shard=option('shard');
const merged=option('check-coverage');
const folders=['lib','components','hooks','app'];
// Third-party UI wrappers (components/ui) are library code, not app logic, so they are left out of the count.
const excluded='components/ui';

function runTests(){
 const files=readdirSync(new URL('../tests/',import.meta.url)).filter(name=>name.endsWith('.mjs')&&(integration?name==='google-auth.mjs':name!=='google-auth.mjs')).sort().map(name=>'tests/'+name);
 if(coverage)mkdirSync('coverage',{recursive:true});
 const measured=coverage?['--enable-source-maps','--experimental-test-coverage',...folders.map(folder=>`--test-coverage-include=${folder}/**`),`--test-coverage-exclude=${excluded}/**`,'--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=lcov','--test-reporter-destination=coverage/lcov.info']:[];
 const sharded=shard?[`--test-shard=${shard}`]:[];
 const result=spawnSync(process.execPath,[...measured,'--experimental-strip-types','--experimental-specifier-resolution=node','--test','--test-concurrency=2',...sharded,...files],{stdio:'inherit',env:{...process.env,PGLITE_MODULE:process.env.PGLITE_MODULE??import.meta.resolve('@electric-sql/pglite')}});
 if(result.error)throw result.error;
 return result.status??1;
}

function checkCoverage(report){
 const floor=JSON.parse(readFileSync(new URL('./coverage-floor.json',import.meta.url),'utf8'));
 const root=process.cwd()+'/';
 const files=lcovFiles(report,root);
 const run=new Set(files.keys());
 const walk=folder=>readdirSync(folder).flatMap(name=>{const file=`${folder}/${name}`;return statSync(file).isDirectory()?walk(file):/\.tsx?$/.test(name)&&!name.endsWith('.d.ts')?[file]:[];});
 const untested=folders.flatMap(walk).filter(file=>!run.has(file)&&!file.startsWith(excluded+'/')).sort();
 const allowed=new Set(floor.untested);
 const fresh=untested.filter(file=>!allowed.has(file)),covered=floor.untested.filter(file=>!untested.includes(file));
 if(covered.length)console.log(`\nNow tested, remove from scripts/coverage-floor.json "untested":\n  ${covered.join('\n  ')}`);
 if(fresh.length){console.error(`\nNo test runs these files. Add tests for them:\n  ${fresh.join('\n  ')}`);return 1;}
 const total=totals(files);
 console.log(`\nCoverage: ${percent(total.lines).toFixed(2)}% lines, ${percent(total.branches).toFixed(2)}% branches, ${percent(total.functions).toFixed(2)}% functions; ${run.size} app files run by tests, ${untested.length} still untested (listed in scripts/coverage-floor.json).`);
 const short=['lines','branches','functions'].filter(key=>percent(total[key])<floor[key]);
 if(short.length){console.error(`Coverage below the floor in scripts/coverage-floor.json: ${short.map(key=>`${key} ${percent(total[key]).toFixed(2)}% < ${floor[key]}%`).join(', ')}`);return 1;}
 return 0;
}

if(merged){
 const walk=folder=>readdirSync(folder).flatMap(name=>{const file=path.join(folder,name);return statSync(file).isDirectory()?walk(file):name==='lcov.info'?[file]:[];});
 const reports=walk(merged);
 if(!reports.length){console.error(`No lcov.info under ${merged}.`);process.exit(1);}
 console.log(`Merging ${reports.length} coverage reports from ${merged}.`);
 const report=mergeLcov(reports.map(file=>readFileSync(file,'utf8')));
 mkdirSync('coverage',{recursive:true});
 writeFileSync('coverage/lcov.info',report);
 process.exit(checkCoverage(report));
}
const status=runTests();
if(coverage&&!shard&&existsSync('coverage/lcov.info')&&checkCoverage(readFileSync('coverage/lcov.info','utf8')))process.exit(1);
process.exit(status);
