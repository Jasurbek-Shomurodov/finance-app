import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {shiftDay}=loadTS('lib/calendar-days.ts');
const {historicalRate}=loadTS('lib/benchmark-data.ts');
const table=uzs=>({USD:1,UZS:uzs,EUR:.9});
/** A stand-in for exchange_rate_days: the kept days, and every range read asked of it. */
function kept(days){
 const reads=[];
 return {reads,db:{read:async path=>{reads.push(path);const from=path.match(/day=gte\.([\d-]+)/)[1],to=path.match(/day=lte\.([\d-]+)/)[1];return Object.entries(days).filter(([day])=>day>=from&&day<=to).sort().map(([day,rates])=>({day,rates}));},write:async()=>new Response(null,{status:201})}};
}
const monthEnds=(from,to)=>{const out={};for(let y=Number(from.slice(0,4));y<=Number(to.slice(0,4));y++)for(let m=1;m<=12;m++){const end=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);if(end>=from&&end<=to)out[end]=table(10000+y-2000+m/100);}return out;};

test('a long comparison reads its rates from kept days in one request, a day a month, never the archive',async()=>{
 const {benchmarkFx}=loadTS('lib/benchmark-fx.ts');
 const days={...monthEnds('2019-12-31','2026-09-30'),'2026-10-29':table(12004)};
 const {db,reads}=kept(days);
 const points=await benchmarkFx('2020-01-01','2026-10-29',{db,today:'2026-10-29',fetchDay:async()=>assert.fail('the archive is not asked'),later:()=>{}});
 assert.equal(reads.length,1);assert.match(reads[0],/day=gte\.2019-11-17&day=lte\.2026-10-29/);
 assert.equal(points[0].date,'2019-12-31','the latest kept day on or before the start');
 assert.equal(points.at(-1).date,'2026-10-29');
 assert.ok(points.length<=42,`${points.length} points`);
 assert.equal(historicalRate(points,'UZS','2020-01-01'),days['2019-12-31'].UZS);
 assert.equal(historicalRate(points,'UZS','2026-10-29'),12004);
 // The same period read on another day keeps the same month grid, so the same kept days answer it.
 const again=await benchmarkFx('2020-01-01','2026-10-30',{db,today:'2026-10-30',fetchDay:async()=>{throw Error('down');},later:()=>{},budgetMs:50});
 assert.deepEqual(again.slice(1,-1).map(p=>p.date),points.slice(1,-1).map(p=>p.date));
});

test('an edge no kept day covers is asked of the archive, and the comparison fails only when nothing covers it',async()=>{
 const {benchmarkFx}=loadTS('lib/benchmark-fx.ts');
 const asked=[];
 const {db}=kept({'2026-09-30':table(12100)});
 const points=await benchmarkFx('2026-09-14','2026-10-29',{db,today:'2026-10-29',fetchDay:async day=>{asked.push(day);return table(day==='2026-09-14'?12050:12004);},later:()=>{}});
 assert.deepEqual(asked.sort(),['2026-09-12','2026-09-13','2026-09-14','2026-10-27','2026-10-28','2026-10-29']);
 assert.deepEqual(points.map(p=>p.date),['2026-09-14','2026-09-30','2026-10-29']);
 // Nothing on or before the start, and the archive down: the gap is reported, never guessed.
 await assert.rejects(benchmarkFx('2026-09-14','2026-10-29',{db,today:'2026-10-29',fetchDay:async()=>{throw Error('down');},later:()=>{},budgetMs:50}),/Historical exchange rates are unavailable/);
 // A latest kept day more than a week before the end does not stand for it.
 const old=kept({'2026-08-31':table(12000),'2026-10-10':table(12010)});
 await assert.rejects(benchmarkFx('2026-09-01','2026-10-29',{db:old.db,today:'2026-10-29',fetchDay:async()=>{throw Error('down');},later:()=>{},budgetMs:50}));
 const recent=kept({'2026-08-31':table(12000),'2026-10-24':table(12010)});
 assert.equal((await benchmarkFx('2026-09-01','2026-10-29',{db:recent.db,today:'2026-10-29',fetchDay:async()=>{throw Error('down');},later:()=>{},budgetMs:50})).at(-1).date,'2026-10-24');
});

test('an archive that does not answer is rested, so later days fail at once instead of each waiting out the timeout',async()=>{
 const {dayTables,archiveRestMs,keptDaysBetween}=loadTS('lib/day-rate-tables.ts',{'./service-role':{serviceDatabase:()=>null}});
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Object.assign(new Error('timed out'),{name:'TimeoutError'});};
 try{
  assert.equal((await dayTables(['2026-01-01'],{db:null,today:'2026-10-29',budgetMs:1000})).size,0);
  assert.equal(calls,1);
  assert.equal((await dayTables(['2026-01-02','2026-01-03'],{db:null,today:'2026-10-29',budgetMs:1000})).size,0);
  assert.equal(calls,1,'rested: no second wait');
  assert.equal(archiveRestMs,600000);
  // A refused or reset connection is not a timeout and does not rest it.
  const fresh=loadTS('lib/day-rate-tables.ts',{'./service-role':{serviceDatabase:()=>null}});
  globalThis.fetch=async()=>{calls++;throw Error('reset');};
  await fresh.dayTables(['2026-01-01'],{db:null,today:'2026-10-29'});await fresh.dayTables(['2026-01-02'],{db:null,today:'2026-10-29'});
  assert.equal(calls,3);
 }finally{globalThis.fetch=original;}
 assert.equal((await keptDaysBetween('2026-01-01','2026-01-31',null)).size,0);
 assert.equal((await keptDaysBetween('bad','2026-01-31',{read:async()=>assert.fail()})).size,0);
 assert.equal((await keptDaysBetween('2026-01-01','2026-01-31',{read:async()=>{throw Error('missing table');}})).size,0);
});

test('a day still loading when the budget is spent does not hold the reply',async()=>{
 const {dayTables}=loadTS('lib/day-rate-tables.ts',{'./service-role':{serviceDatabase:()=>null}});
 const started=Date.now();
 const tables=await dayTables(['2026-01-01','2026-01-02'],{db:null,today:'2026-10-29',budgetMs:100,fetchDay:day=>day==='2026-01-01'?Promise.resolve(table(1)):new Promise(resolve=>setTimeout(()=>resolve(table(2)),2000))});
 assert.ok(Date.now()-started<1000,`waited ${Date.now()-started} ms`);
 assert.deepEqual([...tables.keys()],['2026-01-01']);
 assert.equal(shiftDay('2026-01-01',1),'2026-01-02');
});
