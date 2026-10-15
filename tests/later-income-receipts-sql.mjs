import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/145_later_income_receipts.sql','utf8');

// The receipts themselves are covered in tests/income-payments-one-link-sql.mjs.
test('migration 145 is in setup.sql, safe to re-run, and bumps the schema version the app requires',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 145');
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+);/)[1])>=145);
 const d=new PGlite();
 try{
  await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;`);
  await d.exec(setup.slice(0,setup.indexOf(migration)));
  await d.exec(migration);await d.exec(migration);
  assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,145);
  for(const fn of ['validate_earning_receipt()','validate_income_source()'])assert.doesNotMatch((await d.query(`SELECT pg_get_functiondef('public.${fn}'::regprocedure) AS f`)).rows[0].f,/already recorded/,fn);
 }finally{await d.close();}
});
