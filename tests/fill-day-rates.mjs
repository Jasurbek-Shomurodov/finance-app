import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {defaultDays,fill} from '../scripts/fill-day-rates.mjs';

test('the fill asks every month end since December 2015 and the last two weeks, never a day ahead',()=>{
 const days=defaultDays('2026-10-29');
 assert.equal(days[0],'2015-12-31');assert.ok(days.includes('2024-02-29'),'leap February');assert.ok(days.includes('2026-09-30'));
 assert.ok(days.includes('2026-10-16')&&!days.includes('2026-10-15'),'fourteen recent days');
 assert.ok(!days.some(day=>day>'2026-10-29'));assert.equal(new Set(days).size,days.length);
});

test('the fill reads only the days not kept yet, keeps what the archive answers and names the rest',async()=>{
 const writes=[],logs=[];
 const keptRows=[{day:'2026-10-01',rates:{USD:1,UZS:12000}}];
 const db={read:async path=>keptRows.filter(row=>decodeURIComponent(path).includes(row.day)||/day=gte/.test(path)),write:async(path,init)=>{writes.push(JSON.parse(init.body));return new Response(null,{status:201});}};
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{if(String(url).endsWith('/json/USD/'))return Response.json([{Ccy:'USD',Rate:'12100',Nominal:'1',Date:'29.10.2026'}]);const day=String(url).split('/').filter(Boolean).at(-1);if(day==='2026-10-03')return new Response('',{status:503});return Response.json([{Ccy:'USD',Rate:'12100',Nominal:'1',Date:day.split('-').reverse().join('.')}]);};
 try{
  const stubbed=(file,overrides={})=>file==='lib/service-role.ts'?{serviceDatabase:()=>db}:loadTS(file,overrides);
  const result=await fill(['2026-10-01','2026-10-02','2026-10-03'],{env:{},loadTS:stubbed,today:'2026-10-29',log:line=>logs.push(line)});
  assert.deepEqual(result,{kept:1,missing:['2026-10-03'],current:true});
  assert.deepEqual(writes[0].map(row=>row.day),['2026-10-02']);
  assert.deepEqual(writes[1].map(row=>row.key),['fx'],'today\'s dollar rate is kept for the top bar');assert.equal(writes[1][0].data.rate,12100);
  assert.match(logs[0],/3 days asked, 1 already kept, 2 to read/);assert.match(logs[1],/not answered: 2026-10-03/);assert.match(logs[2],/kept today's CBU rate: 12100/);
  await assert.rejects(fill(['2026-10-01'],{env:{},loadTS,today:'2026-10-29'}),/SUPABASE_SERVICE_ROLE_KEY/);
 }finally{globalThis.fetch=original;}
});
