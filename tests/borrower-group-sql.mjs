import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`79000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/152_borrower_group.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);await d.exec(sql);await d.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;`);return d;}
const save=(d,record)=>d.query('SELECT save_finance_record($1::jsonb)',[JSON.stringify({quantity:1,cost:0,rate:0,frequency:'Once',notes:'',currency:'USD',date:'2026-10-01',lent_date:'2026-09-01',...record})]);
const groupOf=async(d,n)=>(await d.query('SELECT borrower_group FROM finance_records WHERE id=$1',[id(n)])).rows[0].borrower_group;

test('migration 152 is in setup.sql, safe to re-run, and bumps the schema version the app requires',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 152');
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+);/)[1])>=152);
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec('RESET ROLE');await d.exec(migration);await d.exec(migration);assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,152);}finally{await d.close();}
});

test('money lent saves its borrower group, an edit changes it, and nothing else may carry one',async()=>{
 const d=await db(setup);
 try{
  await save(d,{id:id(10),name:'School fees',kind:'Money lent',amount:500,borrower_group:'Family'});
  assert.equal(await groupOf(d,10),'Family');
  const revision=(await d.query('SELECT revision FROM finance_records WHERE id=$1',[id(10)])).rows[0].revision;
  await d.query('SELECT save_finance_record($1::jsonb,$2)',[JSON.stringify({id:id(10),name:'School fees',kind:'Money lent',amount:500,quantity:1,cost:0,rate:0,frequency:'Once',notes:'',currency:'USD',date:'2026-10-01',lent_date:'2026-09-01',borrower_group:null}),revision]);
  assert.equal(await groupOf(d,10),null,'an edit can clear the group');
  await assert.rejects(save(d,{id:id(11),name:'Café',kind:'Business',amount:1,borrower_group:'Family'}),/finance_records_borrower_group/);
  await assert.rejects(save(d,{id:id(12),name:'Loan',kind:'Money lent',amount:1,borrower_group:' Family'}),/finance_records_borrower_group/);
  await assert.rejects(save(d,{id:id(13),name:'Loan',kind:'Money lent',amount:1,borrower_group:'x'.repeat(121)}),/finance_records_borrower_group/);
 }finally{await d.close();}
});
