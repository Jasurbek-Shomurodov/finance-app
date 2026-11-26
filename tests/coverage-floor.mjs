import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('CI measures coverage against a floor and a shrinking list of files no test runs yet',()=>{
 const floor=JSON.parse(fs.readFileSync('scripts/coverage-floor.json','utf8'));
 for(const key of ['lines','branches','functions'])assert.ok(Number.isFinite(floor[key])&&floor[key]>0&&floor[key]<=100,key);
 // Every listed file still exists, the list stays sorted, and nothing is listed twice.
 for(const file of floor.untested)assert.ok(fs.existsSync(file),`remove deleted file from the untested list: ${file}`);
 assert.deepEqual(floor.untested,[...new Set(floor.untested)].sort());
 // CI runs every test in one job, measuring coverage, and checks the floor in the same run.
 const workflow=fs.readFileSync('.github/workflows/checks.yml','utf8');
 assert.match(workflow,/- run: node scripts\/test\.mjs --coverage --concurrency=\$\(nproc\)\n/);
 assert.match(fs.readFileSync('package.json','utf8'),/"test:coverage": "node scripts\/test\.mjs --coverage"/);
});

test('a file loaded twice counts once: a line is run when either copy ran it, branches and functions take the better copy',async()=>{
 const {lcovFiles,totals,percent}=await import('../scripts/lcov.mjs');
 const root='/repo/';
 const report=[
  'SF:/repo/lib/a.ts\nDA:1,1\nDA:2,0\nDA:3,0\nBRF:4\nBRH:1\nFNF:2\nFNH:1\nend_of_record',
  'SF:/repo/lib/a.ts\nDA:1,0\nDA:2,5\nDA:3,0\nBRF:4\nBRH:3\nFNF:2\nFNH:2\nend_of_record',
  'SF:/repo/lib/b.ts\nDA:1,1\nBRF:0\nBRH:0\nFNF:0\nFNH:0\nend_of_record',
 ].join('\n');
 const files=lcovFiles(report,root);
 assert.deepEqual([...files.keys()],['lib/a.ts','lib/b.ts']);
 const sum=totals(files);
 assert.deepEqual(sum,{lines:{found:4,hit:3},branches:{found:4,hit:3},functions:{found:2,hit:2}});
 assert.equal(percent(sum.lines),75);assert.equal(percent({found:0,hit:0}),100);
});

test('shard reports merge into one: copies of a file add their counts line by line, a load-ts copy stays apart for lcovFiles',async()=>{
 const {lcovFiles,mergeLcov,totals}=await import('../scripts/lcov.mjs');
 const shard=(da2,brda,fnda)=>`SF:/repo/lib/a.ts\nFN:1,f\nFN:2,g\nFNDA:${fnda},f\nFNDA:0,g\nFNF:2\nFNH:1\nBRDA:1,0,0,1\nBRDA:1,0,1,${brda}\nBRF:2\nBRH:1\nDA:1,1\nDA:2,${da2}\nLH:1\nLF:2\nend_of_record\n`;
 // One shard ran line 2 and the second branch, the other neither: merged, both count as run, unlike "the better copy".
 const merged=mergeLcov([shard(0,0,1),shard(3,'-',0).replace('BRDA:1,0,1,-','BRDA:1,0,1,2')]);
 assert.equal(merged.match(/^SF:/gm).length,1);
 assert.match(merged,/^DA:2,3$/m);assert.match(merged,/^BRDA:1,1,0,2$/m);assert.match(merged,/^FNDA:1,f$/m);
 assert.match(merged,/^BRF:2\nBRH:2$/m);assert.match(merged,/^FNF:2\nFNH:1$/m);assert.match(merged,/^LH:2\nLF:2$/m);
 assert.deepEqual(totals(lcovFiles(merged,'/repo/')),{lines:{found:2,hit:2},branches:{found:2,hit:2},functions:{found:2,hit:1}});
 // A shard that never called g lists fewer functions and branches, and numbers its anonymous functions differently:
 // matched by line and name, g still counts as run, the anonymous function on line 3 is one function, and the branch
 // only the other shard saw is kept.
 const fewer='SF:/repo/lib/a.ts\nFN:1,f\nFN:3,anonymous_1\nFNDA:1,f\nFNDA:0,anonymous_1\nBRDA:1,0,0,-\nDA:1,1\nDA:2,0\nend_of_record\n';
 const more='SF:/repo/lib/a.ts\nFN:1,f\nFN:2,g\nFN:3,anonymous_2\nFNDA:0,f\nFNDA:1,g\nFNDA:2,anonymous_2\nBRDA:1,0,0,0\nBRDA:1,1,0,4\nDA:1,0\nDA:2,1\nend_of_record\n';
 const shapes=mergeLcov([fewer,more]);
 assert.equal(shapes.match(/^SF:/gm).length,1);
 assert.match(shapes,/^FNF:3\nFNH:3$/m);assert.match(shapes,/^BRF:2\nBRH:1$/m);assert.match(shapes,/^LH:2\nLF:2$/m);
 // A copy loaded through load-ts has its functions on other lines: it stays its own entry, and lcovFiles takes the better.
 const loaded='SF:/repo/lib/a.ts\nFN:5,f\nFNDA:0,f\nBRDA:5,0,0,-\nDA:1,0\nDA:2,0\nend_of_record\n';
 const both=mergeLcov([shard(0,0,1),loaded]);
 assert.equal(both.match(/^SF:/gm).length,2);
 assert.match(both,/^BRDA:5,0,0,0$/m);
 assert.deepEqual(totals(lcovFiles(both,'/repo/')).functions,{found:2,hit:1});
 assert.equal(mergeLcov([]),'\n');
});
