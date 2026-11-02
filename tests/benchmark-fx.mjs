import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {historicalRate}=loadTS('lib/benchmark-data.ts');
const table=uzs=>({USD:1,UZS:uzs,EUR:.9});
/** A stand-in for exchange_rate_days: the kept days, and every range read asked of it. */
function kept(days){
 const reads=[];
 return {reads,db:{read:async path=>{reads.push(path);const listed=path.match(/day=in\.\((.*?)\)/)?.[1].split(',');const from=path.match(/day=gte\.([\d-]+)/)?.[1],to=path.match(/day=lte\.([\d-]+)/)?.[1];return Object.entries(days).filter(([day])=>listed?listed.includes(day):day>=from&&day<=to).sort().map(([day,rates])=>({day,rates}));},write:async()=>new Response(null,{status:201})}};
}
const monthEnds=(from,to)=>{const out={};for(let y=Number(from.slice(0,4));y<=Number(to.slice(0,4));y++)for(let m=1;m<=12;m++){const end=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);if(end>=from&&end<=to)out[end]=table(10000+y-2000+m/100);}return out;};

test('a long comparison lists the kept days, reads a day a month of them, and never asks the archive',async()=>{
 const {benchmarkFx}=loadTS('lib/benchmark-fx.ts');
 const days={...monthEnds('2019-12-31','2026-09-30'),'2026-10-29':table(12004)};
 const {db,reads}=kept(days);
 const points=await benchmarkFx('2020-01-01','2026-10-29',{db,today:'2026-10-29'});
 assert.equal(reads.length,2);assert.match(reads[0],/select=day&day=gte\.2019-11-17&day=lte\.2026-10-29/);assert.match(reads[1],/day=in\./);
 assert.equal(points[0].date,'2019-12-31','the latest kept day on or before the start');
 assert.equal(points.at(-1).date,'2026-10-29');
 assert.ok(points.length<=42,`${points.length} points`);
 assert.equal(historicalRate(points,'UZS','2020-01-01'),days['2019-12-31'].UZS);
 assert.equal(historicalRate(points,'UZS','2026-10-29'),12004);
 // The same period read on another day keeps the same month grid, so the same kept days answer it.
 const again=await benchmarkFx('2020-01-01','2026-10-30',{db,today:'2026-10-30'});
 assert.deepEqual(again.slice(1,-1).map(p=>p.date),points.slice(1,-1).map(p=>p.date));
});

test('the comparison fails only when no kept day covers an edge',async()=>{
 const {benchmarkFx}=loadTS('lib/benchmark-fx.ts');
 const {db}=kept({'2026-09-30':table(12100)});
 // Nothing on or before the start: the gap is reported, never guessed.
 await assert.rejects(benchmarkFx('2026-09-14','2026-10-29',{db,today:'2026-10-29'}),/Historical exchange rates are unavailable/);
 // A latest kept day more than a week before the end does not stand for it.
 const old=kept({'2026-08-31':table(12000),'2026-10-10':table(12010)});
 await assert.rejects(benchmarkFx('2026-09-01','2026-10-29',{db:old.db,today:'2026-10-29'}));
 const recent=kept({'2026-08-31':table(12000),'2026-10-24':table(12010)});
 assert.equal((await benchmarkFx('2026-09-01','2026-10-29',{db:recent.db,today:'2026-10-29'})).at(-1).date,'2026-10-24');
});

test('an empty or missing database reads as nothing kept',async()=>{
 const {keptDaysBetween}=loadTS('lib/day-rate-tables.ts',{'./service-role':{serviceDatabase:()=>null}});
 assert.equal((await keptDaysBetween('2026-01-01','2026-01-31',null)).length,0);
 assert.equal((await keptDaysBetween('bad','2026-01-31',{read:async()=>assert.fail()})).length,0);
 assert.equal((await keptDaysBetween('2026-01-01','2026-01-31',{read:async()=>{throw Error('missing table');}})).length,0);
});
