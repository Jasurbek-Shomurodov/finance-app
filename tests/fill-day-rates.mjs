import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {defaultDays,fill} from '../scripts/fill-day-rates.mjs';

test('the fill asks every day since December 2015, so a gap closes by itself, never a day ahead',()=>{
 const days=defaultDays('2026-10-29');
 assert.equal(days[0],'2015-12-31');assert.ok(days.includes('2024-02-29'),'leap February');assert.ok(days.includes('2026-10-13'));
 assert.equal(days.at(-1),'2026-10-29');assert.equal(new Set(days).size,days.length);assert.equal(days.length,3956);
});

test('the fill reports what the rate service kept and needs the server key',async()=>{
 const logs=[],calls=[];
 const stubbed=(file)=>file==='lib/service-role.ts'?{serviceDatabase:()=>({})}:{refreshExchangeRates:async(days,deps)=>{calls.push([days,deps.today]);return {asked:3,kept:1,missing:['2026-10-03'],dollar:12100,global:'fresh'};}};
 const result=await fill(['2026-10-01'],{env:{},loadTS:stubbed,today:'2026-10-29',log:line=>logs.push(line)});
 assert.equal(result.kept,1);assert.deepEqual(calls,[[['2026-10-01'],'2026-10-29']]);
 assert.match(logs[0],/3 days asked, kept 1 new days; not answered: 2026-10-03/);assert.match(logs[1],/12100/);assert.match(logs[2],/fresh/);
 await assert.rejects(fill(['2026-10-01'],{env:{},loadTS,today:'2026-10-29'}),/SUPABASE_SERVICE_ROLE_KEY/);
});
