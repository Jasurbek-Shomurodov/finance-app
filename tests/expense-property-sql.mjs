import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`78000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/148_expense_property.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);await d.exec(sql);await d.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;`);return d;}
const save=(d,record)=>d.query('SELECT save_finance_record($1::jsonb)',[JSON.stringify({quantity:1,cost:0,rate:0,frequency:'Once',notes:'',currency:'USD',date:'2026-10-01',...record})]);
const propertyOf=async(d,n)=>(await d.query('SELECT property_id FROM finance_records WHERE id=$1',[id(n)])).rows[0].property_id;

test('migration 148 is in setup.sql, safe to re-run, and bumps the schema version the app requires',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 148');
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+);/)[1])>=148);
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec('RESET ROLE');await d.exec(migration);await d.exec(migration);assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,148);}finally{await d.close();}
});

test('an expense links to one of the workspace\'s own properties and nothing else',async()=>{
 const d=await db(setup);
 try{
  await save(d,{id:id(10),name:'Flat',kind:'Property',amount:200000});
  await save(d,{id:id(11),name:'Café',kind:'Business',amount:5000});
  await save(d,{id:id(20),name:'Boiler repair',kind:'Other expense',amount:300,property_id:id(10)});
  assert.equal(await propertyOf(d,20),id(10));
  await assert.rejects(save(d,{id:id(21),name:'Wrong',kind:'Other expense',amount:1,property_id:id(11)}),/Choose one of your properties/);
  await assert.rejects(save(d,{id:id(22),name:'Rent',kind:'Rent income',amount:1,property_id:id(10)}),/finance_records_property_expense/);
  await assert.rejects(save(d,{id:id(23),name:'Flat 2',kind:'Property',amount:1,property_id:id(10)}),/finance_records_property_expense/);
  // Someone else's property is not found, so the link is dropped rather than pointing across workspaces.
  await d.exec(`SET request.jwt.claim.sub='${id(2)}'`);
  await save(d,{id:id(30),name:'Other flat',kind:'Property',amount:1});
  await d.exec(`SET request.jwt.claim.sub='${id(1)}'`);
  await save(d,{id:id(24),name:'Sneaky',kind:'Living expense',amount:1,property_id:id(30)});
  assert.equal(await propertyOf(d,24),null);
 }finally{await d.close();}
});

test('a deleted property leaves its expenses alone, an edit keeps the link, and a payment of a bill takes its property',async()=>{
 const d=await db(setup);
 try{
  await save(d,{id:id(10),name:'Flat',kind:'Property',amount:200000});
  await save(d,{id:id(20),name:'Service charge',kind:'Other expense',amount:80,property_id:id(10)});
  await d.query('DELETE FROM finance_records WHERE id=$1',[id(10)]);
  assert.equal(await propertyOf(d,20),id(10),'the expense keeps the id, so restoring the property links it again');
  const revision=(await d.query('SELECT revision FROM finance_records WHERE id=$1',[id(20)])).rows[0].revision;
  await d.query('SELECT save_finance_record($1::jsonb,$2)',[JSON.stringify({id:id(20),name:'Service charge',kind:'Other expense',amount:90,quantity:1,cost:0,rate:0,frequency:'Once',notes:'',currency:'USD',date:'2026-10-01',property_id:id(10)}),revision]);
  assert.equal(await propertyOf(d,20),id(10),'an edit that leaves the link unchanged saves');
  await save(d,{id:id(11),name:'House',kind:'Property',amount:300000});
  await save(d,{id:id(40),name:'Insurance',kind:'Other expense',amount:50,frequency:'Monthly',property_id:id(11)});
  await d.exec('RESET ROLE');
  await d.query(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,occurrence_record_id,occurrence_due_on) VALUES($1,$2,'Insurance','Other expense','USD',50,'2026-10-01','Once',$3,'2026-10-01')`,[id(41),id(1),id(40)]);
  assert.equal(await propertyOf(d,41),id(11));
 }finally{await d.close();}
});

test('a payment whose property was cleared keeps it cleared when edited again',async()=>{
 const d=await db(setup);
 try{
  await save(d,{id:id(11),name:'House',kind:'Property',amount:300000});
  await save(d,{id:id(40),name:'Insurance',kind:'Other expense',amount:50,frequency:'Monthly',property_id:id(11)});
  await d.exec('RESET ROLE');
  await d.query(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,occurrence_record_id,occurrence_due_on) VALUES($1,$2,'Insurance','Other expense','USD',50,'2026-10-01','Once',$3,'2026-10-01')`,[id(41),id(1),id(40)]);
  await d.query('UPDATE finance_records SET property_id=NULL WHERE id=$1',[id(41)]);
  await d.exec('SET ROLE authenticated');
  const row=(await d.query('SELECT to_jsonb(r) AS r FROM finance_records r WHERE id=$1',[id(41)])).rows[0].r;
  await d.query('SELECT save_finance_record($1::jsonb,$2)',[JSON.stringify({id:id(41),name:'Insurance',kind:'Other expense',amount:55,quantity:1,cost:0,rate:0,frequency:'Once',notes:'',currency:'USD',date:'2026-10-01'}),row.revision]);
  assert.equal(await propertyOf(d,41),null);
 }finally{await d.close();}
});
