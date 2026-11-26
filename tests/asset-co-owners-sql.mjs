import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const id=n=>`17300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,stranger]=[1,2].map(id);
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/173_asset_co_owners.sql','utf8');
const auth=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${stranger}');`;
const as=(d,user)=>d.exec(`RESET ROLE;SET request.jwt.claim.sub='${user}';SET request.headers='{}';SET ROLE authenticated;`);
async function db(sql=setup){const d=new PGlite();await d.exec(auth);await d.exec(sql);await as(d,owner);return d;}
const cafe=(extra={})=>({id:id(10),name:'Cafe',kind:'Business',currency:'USD',amount:42000,quantity:1,date:'2026-10-01',frequency:'Once',notes:'',ownership_percentage:50,...extra});
const save=(d,record,revision=null)=>d.query('SELECT save_finance_record($1,$2) AS r',[record,revision]).then(r=>r.rows[0].r[0]);
const stored=(d,n=10)=>d.query('SELECT co_owners,ownership_percentage::float8 AS share,revision FROM finance_records WHERE id=$1',[id(n)]).then(r=>r.rows[0]);
const aziz={id:id(101),name:'Aziz',percentage:30},dilshod={id:id(102),name:'Dilshod',percentage:20};

test('migration 173 is in setup.sql, moves the schema version and is safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 173');
 assert.match(fs.readFileSync('lib/database-capabilities.ts','utf8'),/requiredSchemaVersion = 173/);
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,ownership_percentage) VALUES($1,$2,'Old cafe','Business','USD',1000,'2026-01-01',40)",[id(11),owner]);
  await d.exec('RESET ROLE');
  const before=(await d.query("SELECT pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure) AS f")).rows[0].f;
  await d.exec(migration);
  const after=(await d.query("SELECT pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure) AS f")).rows[0].f;
  await d.exec(migration);
  assert.equal((await d.query("SELECT pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure) AS f")).rows[0].f,after,'a second run changes nothing');
  assert.notEqual(before,after);
  assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,173);
  // An existing record keeps its share and gets an empty list.
  assert.deepEqual(await stored(d,11).then(({co_owners,share})=>({co_owners,share})),{co_owners:[],share:40});
 }finally{await d.close();}
});

test('the record form saves, reorders, shortens and clears the co-owners',async()=>{
 const d=await db();
 try{
  await save(d,cafe({co_owners:[aziz,dilshod]}));
  assert.deepEqual((await stored(d)).co_owners,[aziz,dilshod]);
  let {revision}=await stored(d);
  await save(d,cafe({co_owners:[dilshod,aziz]}),revision);
  assert.deepEqual((await stored(d)).co_owners,[dilshod,aziz],'the order is the person\'s');
  ({revision}=await stored(d));
  // A shorter list is contained in the longer one, but it is a change, not a retry of the same save.
  await save(d,cafe({co_owners:[aziz]}),revision);
  assert.deepEqual((await stored(d)).co_owners,[aziz]);
  ({revision}=await stored(d));
  await save(d,cafe({co_owners:[]}),revision);
  assert.deepEqual((await stored(d)).co_owners,[]);
  // Retrying the identical save is still harmless (no revision needed).
  await save(d,cafe({co_owners:[]}));
  // A save without the field leaves the list alone.
  ({revision}=await stored(d));
  await save(d,cafe({co_owners:[aziz]}),revision);
  ({revision}=await stored(d));
  await save(d,cafe({name:'Zar Cafe'}),revision);
  assert.deepEqual((await stored(d)).co_owners,[aziz]);
 }finally{await d.close();}
});

test('shares add up to at most 100 and each entry is well formed',async()=>{
 const d=await db();
 try{
  const refused=async(co_owners,extra={},message=/co_owners_check/)=>{await assert.rejects(save(d,cafe({co_owners,...extra})),message);};
  await refused([aziz,{...dilshod,percentage:20.0001}]);
  await refused([aziz,dilshod],{ownership_percentage:60});
  await refused([{...aziz,name:''}]);
  await refused([{...aziz,name:' Aziz'}]);
  await refused([{...aziz,name:'x'.repeat(61)}]);
  await refused([{...aziz,percentage:0}]);
  await refused([{...aziz,percentage:'30'}]);
  await refused([aziz,{...dilshod,id:aziz.id}]);
  await refused([{...aziz,id:'not-a-uuid'}]);
  await refused([{...aziz,email:'a@b.c'}]);
  await refused(Array.from({length:13},(_,n)=>({id:id(200+n),name:'P'+n,percentage:1})),{ownership_percentage:10});
  await refused({name:'Aziz'});
  // Only an asset valued by hand names co-owners.
  await assert.rejects(save(d,{...cafe({co_owners:[aziz]}),kind:'Stock',ownership_percentage:100}),/co_owners_check|Check the record/);
  // A third of each, exactly.
  await save(d,cafe({ownership_percentage:33.34,co_owners:[{...aziz,percentage:33.33},{...dilshod,percentage:33.33}]}));
  assert.equal((await stored(d)).co_owners.length,2);
 }finally{await d.close();}
});

test('another owner cannot read or change the list',async()=>{
 const d=await db();
 try{
  await save(d,cafe({co_owners:[aziz]}));
  await as(d,stranger);
  assert.equal((await d.query('SELECT co_owners FROM finance_records WHERE id=$1',[id(10)])).rows.length,0);
  await assert.rejects(save(d,cafe({co_owners:[dilshod]})),/Record not found/);
  await as(d,owner);
  assert.deepEqual((await stored(d)).co_owners,[aziz]);
 }finally{await d.close();}
});
