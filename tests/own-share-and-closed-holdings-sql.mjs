import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Migration 174: a "Whole business" transaction moves its cash account by the owner's share, and a stock or coin is
// closed only with no units left (the 28 November 2026 audit).
const id=n=>`17400000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/174_own_share_and_closed_holdings.sql','utf8');
const roles=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`;
async function database(sql=setup){const db=new PGlite();await db.exec(roles);await db.exec(sql);await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';SET request.headers='{}';`);return db;}
const one=async(db,sql,params=[])=>(await db.query(sql,params)).rows[0];
const balance=async(db,n=10)=>Number((await one(db,'SELECT amount FROM finance_records WHERE id=$1',[id(n)])).amount);
const functions=db=>one(db,`SELECT md5(string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid::regprocedure::text)) AS sum FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'`).then(row=>row.sum);

test('migration 174 is in setup.sql, moves the schema version and is safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 174');
 assert.match(fs.readFileSync('lib/database-capabilities.ts','utf8'),/requiredSchemaVersion = 174/);
 const db=await database(setup.slice(0,setup.indexOf(migration)));
 try{
  await db.exec('RESET ROLE');
  await db.exec(migration);
  const once=await functions(db);
  await db.exec(migration);
  assert.equal(await functions(db),once,'a second run leaves every function as it was');
  assert.equal((await one(db,'SELECT finance_capabilities() AS c')).c.schema_version,174);
 }finally{await db.close();}
});

test('a whole-business income or expense moves its cash account by the owner\'s share',async()=>{
 const db=await database();
 try{
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,date) VALUES('${id(10)}','Wallet','Cash','USD',1000,'2026-01-01');
   INSERT INTO finance_records(id,name,kind,currency,amount,ownership_percentage,date) VALUES('${id(20)}','Shop','Business','USD',100000,25,'2026-01-01');`);
  // A 10,000 sale entered for the whole business is 2,500 of the owner's money.
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,date,business_id,amount_basis,account_id) VALUES('${id(30)}','Sale','Business income','USD',10000,'2026-03-01','${id(20)}','whole','${id(10)}')`);
  assert.equal(await balance(db),3500);
  // 800 of costs for the whole business takes 200 from the account.
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,date,business_id,amount_basis,account_id) VALUES('${id(31)}','Supplies','Other expense','USD',800,'2026-03-02','${id(20)}','whole','${id(10)}')`);
  assert.equal(await balance(db),3300);
  // Switching to My share moves it by the full figure; switching back and deleting undoes it exactly.
  await db.exec(`UPDATE finance_records SET amount_basis='mine' WHERE id='${id(30)}'`);
  assert.equal(await balance(db),10800);
  await db.exec(`UPDATE finance_records SET amount_basis='whole' WHERE id='${id(30)}'`);
  assert.equal(await balance(db),3300);
  const legs=(await db.query(`SELECT key,amount::float8 AS amount FROM public.account_statement_legs('${id(10)}','-infinity'::date,'infinity'::date) ORDER BY key`)).rows;
  assert.deepEqual(legs.filter(leg=>leg.key.startsWith('record:')).map(leg=>leg.amount).sort((a,b)=>a-b),[-200,2500],'the statement shows what moved the account');
  await db.exec(`DELETE FROM finance_records WHERE id IN ('${id(30)}','${id(31)}')`);
  assert.equal(await balance(db),1000);
  // Fractions stay exact: a third of 100 is kept at full precision, never rounded.
  await db.exec(`UPDATE finance_records SET ownership_percentage=33.333333 WHERE id='${id(20)}'`);
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,date,business_id,amount_basis,account_id) VALUES('${id(32)}','Sale','Business income','USD',100,'2026-03-03','${id(20)}','whole','${id(10)}')`);
  assert.equal(await balance(db),1033.333333);
 }finally{await db.close();}
});

test('a stock is closed only with no units left, whatever its price',async()=>{
 const db=await database();
 try{
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,quantity,date) VALUES('${id(40)}','AAPL','Stock','USD',0,5,'2026-01-01')`);
  await assert.rejects(db.query('SELECT public.close_finance_record($1,NULL)',[id(40)]),/Bring the balance to zero before closing/);
  await db.exec(`UPDATE finance_records SET quantity=0,amount=190 WHERE id='${id(40)}'`);
  await db.query('SELECT public.close_finance_record($1,NULL)',[id(40)]);
  assert.ok((await one(db,'SELECT closed_on FROM finance_records WHERE id=$1',[id(40)])).closed_on);
 }finally{await db.close();}
});
