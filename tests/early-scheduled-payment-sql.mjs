import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`77000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/155_early_scheduled_payments.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);await d.exec(sql);await d.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;`);return d;}

test('migration 155 is in setup.sql, safe to re-run, and bumps the schema version the app requires',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 155');
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+);/)[1])>=155);
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec('RESET ROLE');await d.exec(migration);await d.exec(migration);assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,155);}finally{await d.close();}
});

// A salary due on the 1st of every month that arrived today, ahead of next month's due date.
test('Record payment settles an upcoming due date with a payment dated today, never a later day',async()=>{
 const d=await db(setup);
 try{
  const {today,start,next,tomorrow}=(await d.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS today,date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)::date::text AS start,(date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)+interval '1 month')::date::text AS next,((now() AT TIME ZONE 'Asia/Tashkent')::date+1)::text AS tomorrow")).rows[0];
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Cash','Cash','USD',1000,$3,$3)",[id(10),id(1),start]);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Snoonu','Salary','USD',5700,$3,'Monthly')",[id(20),id(1),start]);
  const pay=(n,paid_on)=>d.query("SELECT planning_action_with_actual_amount('occurrence',$1)",[{id:id(n),account_id:id(10),target_id:id(20),date:next,amount:5700,notes:'',...(paid_on?{paid_on}:{})}]);
  const cash=async()=>Number((await d.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount);
  const settled=async()=>(await d.query('SELECT count(*)::int AS n FROM payment_occurrences WHERE record_id=$1',[id(20)])).rows[0].n;
  await assert.rejects(pay(30),/Check the payment date/,'without the day it was paid the transaction would be dated ahead');
  await assert.rejects(pay(31,tomorrow),/Check the payment date/,'the money cannot have moved tomorrow');
  assert.equal(await settled(),0);
  assert.equal(await cash(),1000);
  await pay(32,today);
  assert.deepEqual((await d.query('SELECT date::text AS date,occurrence_due_on::text AS due FROM finance_records WHERE id=$1',[id(32)])).rows[0],{date:today,due:next},'dated today, settling next month');
  assert.deepEqual((await d.query('SELECT status,transaction_id FROM payment_occurrences WHERE record_id=$1 AND due_on=$2',[id(20),next])).rows[0],{status:'paid',transaction_id:id(32)});
  assert.equal(await cash(),6700);
  // A transfer still may not be dated ahead.
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Card','Cash','USD',0,$3,$3)",[id(11),id(1),start]);
  await assert.rejects(d.query("SELECT planning_action_with_actual_amount('transfer',$1)",[{id:id(40),account_id:id(10),target_id:id(11),date:tomorrow,amount:10,received:10,notes:'',paid_on:today}]),/Check the payment date/);
  // Another person's schedule stays out of reach.
  await d.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  await assert.rejects(pay(50,today),/Record not found/);
 }finally{await d.close();}
});
