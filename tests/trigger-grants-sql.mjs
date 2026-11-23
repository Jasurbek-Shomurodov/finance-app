import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/165_trigger_grants_and_reference_indexes.sql','utf8');
const skip=!process.env.PGLITE_MODULE;

test('migration 165 is in setup.sql and the app asks for at least it',()=>{
 assert.ok(setup.includes(migration));
 assert.match(migration,/'schema_version',165/);
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+)/)[1])>=165);
 // It only tightens grants and adds indexes: no row is written.
 assert.doesNotMatch(migration,/\b(UPDATE|DELETE FROM|INSERT INTO)\b/);
});

test('no trigger function can be called by name, triggers still fire, and every reference it names is indexed',{skip},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const id=n=>`16500000-0000-4000-8000-${String(n).padStart(12,'0')}`,owner=id(1);
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}');`);
  await db.exec(setup);
  const rows=async sql=>(await db.query(sql)).rows;
  assert.equal((await rows("SELECT finance_capabilities()->>'schema_version' AS v"))[0].v,'165');
  const open=await rows(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prorettype IN ('trigger'::regtype,'event_trigger'::regtype) AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))`);
  assert.deepEqual(open,[]);
  assert.equal((await rows("SELECT proconfig::text AS c FROM pg_proc WHERE proname='protect_category_direction'"))[0].c,'{search_path=public}');
  // Functions the app calls keep their grant.
  assert.equal((await rows("SELECT has_function_privilege('authenticated','public.planning_action(text,jsonb)','EXECUTE') AS run"))[0].run,true);
  // A guarded write still runs its triggers for a signed-in person: the revision trigger stamps the row.
  await db.exec(`SET request.jwt.claim.sub='${owner}';SET request.headers='{}';SET ROLE authenticated;`);
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES($1,$2,'Wallet','Cash','USD',100,current_date)",[id(10),owner]);
  await db.query('UPDATE finance_records SET amount=120 WHERE id=$1',[id(10)]);
  const [saved]=await rows(`SELECT amount,revision FROM finance_records WHERE id='${id(10)}'`);
  assert.equal(Number(saved.amount),120);assert.ok(Number(saved.revision)>=1);
  await db.exec('RESET ROLE');
  const names=[...migration.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map(match=>match[1]);
  assert.equal(names.length,17);
  const found=(await rows(`SELECT indexname FROM pg_indexes WHERE schemaname='public'`)).map(row=>row.indexname);
  for(const name of names)assert.ok(found.includes(name),name);
  // Applying it again changes nothing.
  await db.exec(migration);
  assert.equal((await rows(`SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public'`))[0].n,found.length);
 }finally{await db.close();}
});
