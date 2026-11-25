import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`17100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/171_income_source_day.sql','utf8');
const auth=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`;
async function db(sql){const d=new PGlite();await d.exec(auth);await d.exec(sql);await d.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}'`);return d;}
const source={id:id(10),name:'Snoonu',kind:'Salary',currency:'USD',mode:'fixed',amount:5700,frequency:'Monthly',start_date:'2026-09-28',end_date:null,linked_record_id:null};
const save=(d,data)=>d.query('SELECT save_income_source($1) AS data',[{...source,...data}]);
const receive=(d,n,due)=>d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,earning_source_id,earning_due_on) VALUES($1,$2,'Snoonu','Salary','USD',5700,$3,'Once',$4,$3)",[id(n),id(1),due,id(10)]);
const occurrences=async d=>(await d.query('SELECT due_on::text AS due,transaction_id FROM payment_occurrences WHERE record_id=$1 ORDER BY due_on',[id(10)])).rows.map(row=>[row.due,row.transaction_id]);
const receipt=async(d,n)=>(await d.query('SELECT date::text AS date,earning_due_on::text AS earning,occurrence_due_on::text AS occurrence FROM finance_records WHERE id=$1',[id(n)])).rows[0];
const refused=/Keep the type, currency and schedule compatible with recorded payments/;
// Snoonu pays on the 28th: September and October are received, November is skipped.
async function workspace(d){
 await save(d,{});
 await receive(d,20,'2026-09-28');await receive(d,21,'2026-10-28');
 await d.exec('RESET ROLE');await d.query("INSERT INTO payment_occurrences(id,user_id,record_id,due_on,status) VALUES($1,$2,$3,'2026-11-28','dismissed')",[id(30),id(1),id(10)]);await d.exec('SET ROLE authenticated');
 assert.deepEqual(await occurrences(d),[['2026-09-28',id(20)],['2026-10-28',id(21)],['2026-11-28',null]]);
}

test('migration 171 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 171');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec('RESET ROLE');await d.exec(migration);await d.exec(migration);assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,171);}finally{await d.close();}
});

test('a monthly income source with payments moves to another day: its schedule, occurrences and receipts follow',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await save(d,{start_date:'2026-09-25',amount:6000});
  assert.equal((await d.query('SELECT start_date::text AS s FROM income_sources WHERE id=$1',[id(10)])).rows[0].s,'2026-09-25');
  assert.equal((await d.query('SELECT date::text AS s FROM finance_records WHERE id=$1',[id(10)])).rows[0].s,'2026-09-25','the schedule moves with its source');
  assert.deepEqual(await occurrences(d),[['2026-09-25',id(20)],['2026-10-25',id(21)],['2026-11-25',null]]);
  assert.deepEqual(await receipt(d,21),{date:'2026-10-28',earning:'2026-10-25',occurrence:'2026-10-25'},'a receipt keeps the day it was received and pays the moved date');
  // The 31st falls on the last day of a shorter month: September and November have 30 days.
  await save(d,{start_date:'2026-09-30'});
  assert.deepEqual(await occurrences(d),[['2026-09-30',id(20)],['2026-10-30',id(21)],['2026-11-30',null]]);
  // A new receipt is recorded on the new day.
  await receive(d,22,'2026-12-30');
  assert.deepEqual((await occurrences(d)).at(-1),['2026-12-30',id(22)]);
 }finally{await d.close();}
});

test('the end date may change unless it cuts off a received payment; another start month, the cadence and the type stay',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await save(d,{end_date:'2027-06-28'});
  assert.equal((await d.query('SELECT end_date::text AS e FROM income_sources WHERE id=$1',[id(10)])).rows[0].e,'2027-06-28');
  await save(d,{end_date:null});
  await assert.rejects(save(d,{end_date:'2026-10-01'}),/compatible with settled payments/);
  await assert.rejects(save(d,{start_date:'2026-08-28'}),refused,'another month is another start date');
  await assert.rejects(save(d,{start_date:'2026-10-05'}),refused);
  await assert.rejects(save(d,{frequency:'Yearly'}),refused);
  await assert.rejects(save(d,{kind:'Other income'}),refused);
  assert.deepEqual(await occurrences(d),[['2026-09-28',id(20)],['2026-10-28',id(21)],['2026-11-28',null]]);
 }finally{await d.close();}
});

test('a weekly source keeps its start date: its weekday is its cadence',async()=>{
 const d=await db(setup);
 try{
  await save(d,{frequency:'Weekly',start_date:'2026-09-07'});
  await receive(d,20,'2026-09-14');
  await assert.rejects(save(d,{frequency:'Weekly',start_date:'2026-09-08'}),refused);
 }finally{await d.close();}
});
