import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`76000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/143_payment_after_schedule_start.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`);await d.exec(sql);await d.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;`);return d;}

test('migration 143 is in setup.sql, safe to re-run, and bumps the schema version the app requires',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 143');
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+);/)[1])>=143);
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec('RESET ROLE');await d.exec(migration);await d.exec(migration);assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,143);}finally{await d.close();}
});

test('migration 143 keeps one copy of the future-date check where an earlier double run of 110 left two',async()=>{
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{
  await d.exec('RESET ROLE');
  const definition=async()=>(await d.query("SELECT pg_get_functiondef('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure) AS f")).rows[0].f;
  const ahead="IF (p_data->>'paid_on')::date>(now() AT TIME ZONE 'Asia/Tashkent')::date THEN RAISE EXCEPTION 'Check the payment date.'; END IF;";
  const line='   '+ahead;
  await d.exec((await definition()).replace(line,line+'\n'+line));
  assert.equal((await definition()).split(ahead).length-1,2);
  await d.exec(migration);await d.exec(migration);
  const patched=await definition();
  assert.equal(patched.split(ahead).length-1,1);
  assert.equal(patched.split("(p_data->>'paid_on')::date<r.date").length-1,1);
 }finally{await d.close();}
});

// A monthly gift set up to start on the 12th of last month, paid from cash.
test('Record payment refuses a payment date before the schedule starts and keeps its due date open',async()=>{
 const d=await db(setup);
 try{
  const {start,before}=(await d.query("SELECT (date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)-interval '1 month'+interval '11 days')::date::text AS start,(date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)-interval '2 months'+interval '11 days')::date::text AS before")).rows[0];
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Cash','Cash','USD',1000,$3,$3)",[id(10),id(1),before]);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Mother-in-law','Charity','USD',400,$3,'Monthly')",[id(20),id(1),start]);
  const pay=(n,paid_on,extra=false)=>d.query(extra?'SELECT record_occurrence_extra($1)':'SELECT planning_action_with_actual_amount(\'occurrence\',$1)',[{id:id(n),account_id:id(10),target_id:id(20),date:start,amount:400,notes:'',paid_on}]);
  const cash=async()=>Number((await d.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount);
  await assert.rejects(pay(30,before),/Check the payment date/,'a month before the schedule existed');
  assert.equal((await d.query('SELECT count(*)::int AS n FROM payment_occurrences WHERE record_id=$1',[id(20)])).rows[0].n,0,'the first due date stays open');
  assert.equal(await cash(),1000);
  // On the start date itself it is recorded and dated that day.
  await pay(31,start);
  assert.equal((await d.query('SELECT date::text AS date,occurrence_due_on::text AS due FROM finance_records WHERE id=$1',[id(31)])).rows[0].date,start);
  assert.equal(await cash(),600);
  // A later payment of the same due date follows the same rule.
  await assert.rejects(pay(32,before,true),/Check the payment date/);
  await pay(33,start,true);
  assert.equal((await d.query('SELECT count(*)::int AS n FROM finance_records WHERE occurrence_record_id=$1',[id(20)])).rows[0].n,2);
 }finally{await d.close();}
});
