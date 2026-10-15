import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`77000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/144_scheduled_payment_currency.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`);await d.exec(sql);await d.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;`);return d;}

test('migration 144 is in setup.sql, safe to re-run, and bumps the schema version the app requires',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 144');
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+);/)[1])>=144);
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec('RESET ROLE');await d.exec(migration);await d.exec(migration);assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,144);}finally{await d.close();}
});

// A USD salary paid into a UZS cash account, typed in the sum that arrived.
test('Record payment keeps a payment in the cash account currency as entered and refuses a third currency',async()=>{
 const d=await db(setup);
 try{
  const {start}=(await d.query("SELECT (date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)-interval '1 month')::date::text AS start")).rows[0];
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Cash','Cash','UZS',1000000,$3,$3)",[id(10),id(1),start]);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Wallet','Cash','USD',0,$3,$3)",[id(11),id(1),start]);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'EPAM Systems','Salary','USD',3450,$3,'Monthly')",[id(20),id(1),start]);
  const pay=(n,account,currency,amount,extra=false)=>d.query(extra?'SELECT record_occurrence_extra($1)':'SELECT planning_action_with_actual_amount(\'occurrence\',$1)',[{id:id(n),account_id:id(account),target_id:id(20),date:start,paid_on:start,amount,notes:'',currency}]);
  const cash=async()=>Number((await d.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount);
  await assert.rejects(pay(30,10,'EUR',500),/schedule's currency or the cash account's/);
  await assert.rejects(pay(30,11,'UZS',500),/schedule's currency or the cash account's/,'UZS is not the USD wallet\'s currency');
  assert.equal(await cash(),1000000);
  await pay(31,10,'UZS',30155000);
  const row=(await d.query('SELECT currency,amount::float AS amount,account_exchange_rate,occurrence_record_id FROM finance_records WHERE id=$1',[id(31)])).rows[0];
  assert.deepEqual(row,{currency:'UZS',amount:30155000,account_exchange_rate:null,occurrence_record_id:id(20)});
  assert.equal(await cash(),31155000,'the account moves by the sum entered');
  assert.equal((await d.query("SELECT transaction_id FROM payment_occurrences WHERE record_id=$1 AND status='paid'",[id(20)])).rows[0].transaction_id,id(31));
  // A later payment of the same due date may be in the account's currency too.
  await pay(32,10,'UZS',1000000,true);
  assert.equal((await d.query('SELECT currency FROM finance_records WHERE id=$1',[id(32)])).rows[0].currency,'UZS');
  assert.equal(await cash(),32155000);
 }finally{await d.close();}
});
