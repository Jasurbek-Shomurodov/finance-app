import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadTS} from './helpers/load-ts.mjs';

const {keptHistory,historyFreshForMs,stockFullEveryMs}=loadTS('lib/price-history-cache.ts');
const {shiftDay}=loadTS('lib/calendar-days.ts');
const NOW=Date.parse('2026-10-29T10:00:00Z');
const days=(from,to,close=100)=>{const out=[];for(let day=from;day<=to;day=shiftDay(day,1))out.push({date:day,close});return out;};
const row=(series,points,{checked_to=points.at(-1).date,fetched=0,full=0}={})=>({series,points,first_day:points[0].date,checked_to,fetched_at:new Date(NOW-fetched).toISOString(),full_at:new Date(NOW-full).toISOString()});
function database(rows=[]){
 const writes=[];
 return {writes,db:{read:async path=>rows.filter(r=>decodeURIComponent(path).includes(`series=eq.${r.series}`)),write:async(path,init)=>{writes.push({path,row:JSON.parse(init.body)});return new Response(null,{status:201});}}};
}
const feed=(make=(from,to)=>days(from,to,200))=>{const asked=[];return {asked,live:async(from,to)=>{asked.push([from,to]);return make(from,to);}};};

test('a kept series that reaches the period answers with no feed asked',async()=>{
 const {db}=database([row('crypto:BTC',days('2026-01-01','2026-10-29'))]),{asked,live}=feed();
 const points=await keptHistory('crypto:BTC','2026-10-01','2026-10-29',live,{db,now:()=>NOW,later:()=>assert.fail('fresh rows are not refreshed')});
 assert.equal(asked.length,0);
 assert.equal(points[0].date,'2026-10-01');assert.equal(points.at(-1).date,'2026-10-29');assert.equal(points.length,29);
});

test('an hour-old row answers now and reads only its last days again after the reply',async()=>{
 const {db,writes}=database([row('crypto:BTC',days('2026-01-01','2026-10-28'),{fetched:historyFreshForMs+1,checked_to:'2026-10-29'})]),{asked,live}=feed(),later=[];
 const points=await keptHistory('crypto:BTC','2026-10-01','2026-10-29',live,{db,now:()=>NOW,later:work=>later.push(work)});
 assert.equal(points.at(-1).date,'2026-10-28','the reader is not held for the refresh');
 assert.equal(asked.length,0);
 for(const work of later)await work();
 assert.deepEqual(asked,[['2026-10-26','2026-10-29']],'three days back from the last asked day');
 const kept=writes[0].row;
 assert.equal(kept.first_day,'2026-01-01');assert.equal(kept.points.at(-1).close,200,'the new closes replace the kept ones');assert.equal(kept.points.find(p=>p.date==='2026-10-01').close,100);
});

test('a period ending after the kept row reads the missing days before replying, and keeps them',async()=>{
 const {db,writes}=database([row('crypto:ETH',days('2026-01-01','2026-10-20'))]),{asked,live}=feed(),later=[];
 const points=await keptHistory('crypto:ETH','2026-10-01','2026-10-29',live,{db,now:()=>NOW,later:work=>later.push(work)});
 assert.deepEqual(asked,[['2026-10-17','2026-10-29']]);
 assert.equal(points.at(-1).date,'2026-10-29');assert.equal(points.length,29);
 for(const work of later)await work();
 assert.equal(writes[0].row.checked_to,'2026-10-29');assert.equal(writes[0].row.first_day,'2026-01-01');
});

test('a period starting before the kept row, or a stock row a week old, reads the whole span again',async()=>{
 const {db}=database([row('crypto:SOL',days('2026-06-01','2026-10-29'))]),{asked,live}=feed();
 await keptHistory('crypto:SOL','2026-01-01','2026-10-29',live,{db,now:()=>NOW,later:()=>{}});
 assert.deepEqual(asked,[['2026-01-01','2026-10-29']]);
 // A dividend changes every earlier adjusted close, so a stock's whole kept span is read once a week.
 const old=database([row('stock:SPY',days('2025-10-20','2026-10-29'),{fetched:historyFreshForMs+1,full:stockFullEveryMs+1})]),spy=feed(),later=[];
 const points=await keptHistory('stock:SPY','2026-01-01','2026-10-29',spy.live,{db:old.db,now:()=>NOW,later:work=>later.push(work)});
 assert.equal(points[0].date,shiftDay('2026-01-01',-10),'a stock answers from ten days before the start, as its feed does');
 for(const work of later)await work();
 assert.deepEqual(spy.asked,[['2025-10-20','2026-10-29']]);
 assert.equal(old.writes[0].row.full_at,new Date(NOW).toISOString());
});

test('a failing feed leaves kept closes standing within a week of the end, and fails beyond it',async()=>{
 const down=async()=>{throw Error('Unavailable');};
 const {db}=database([row('stock:BIL',days('2025-01-01','2026-10-24'))]);
 const points=await keptHistory('stock:BIL','2026-01-01','2026-10-29',down,{db,now:()=>NOW,later:()=>{}});
 assert.equal(points.at(-1).date,'2026-10-24');
 const gone=database([row('stock:HYG',days('2025-01-01','2026-10-10'))]);
 await assert.rejects(keptHistory('stock:HYG','2026-01-01','2026-10-29',down,{db:gone.db,now:()=>NOW,later:()=>{}}),/Unavailable/);
 // A coin with no close on the start day yet answers from its latest close, as its feed does.
 const today=database([row('crypto:BTC',days('2026-10-01','2026-10-28'),{checked_to:'2026-10-29'})]);
 assert.deepEqual((await keptHistory('crypto:BTC','2026-10-29','2026-10-29',down,{db:today.db,now:()=>NOW})).map(p=>p.date),['2026-10-28']);
});

test('before migration 157, or without the server key, every series is read from the feeds',async()=>{
 const failing={read:async()=>{throw Error('relation does not exist');},write:async()=>new Response(null,{status:404})};
 const {asked,live}=feed();
 assert.equal((await keptHistory('crypto:BTC','2026-10-01','2026-10-29',live,{db:failing,now:()=>NOW})).length,29);
 await keptHistory('crypto:BTC','2026-10-01','2026-10-29',live,{db:null,now:()=>NOW});
 assert.equal(asked.length,2);
});

test('migration 157 is in setup.sql, safe to re-run, and keeps the table to the server',async()=>{
 const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/157_price_history.sql','utf8');
 assert.ok(setup.includes(migration));
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+);/)[1])>=157);
 const d=new PGlite();
 try{
  await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;`);
  await d.exec(setup.slice(0,setup.indexOf(migration)));await d.exec(migration);await d.exec(migration);
  assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,157);
  await d.query(`INSERT INTO price_history(series,points,first_day,checked_to) VALUES('stock:BRK.B','[]','2026-01-01','2026-01-02')`);
  for(const series of ['stock:spy','fund:SPY','crypto:'])await assert.rejects(d.query(`INSERT INTO price_history(series,points,first_day,checked_to) VALUES($1,'[]','2026-01-01','2026-01-02')`,[series]),/check/i,series);
  await assert.rejects(d.query(`INSERT INTO price_history(series,points,first_day,checked_to) VALUES('stock:SPY','[]','2026-01-02','2026-01-01')`),/check/i,'asked through before it starts');
  await d.exec('SET ROLE authenticated');await assert.rejects(d.query('SELECT * FROM price_history'),/permission denied/);
 }finally{await d.close();}
});
