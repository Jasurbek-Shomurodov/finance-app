import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/156_market_quotes.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;`);await d.exec(sql);return d;}

test('migration 156 is in setup.sql, safe to re-run, and bumps the schema version the app requires',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 156');
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+);/)[1])>=156);
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec(migration);await d.exec(migration);assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,156);}finally{await d.close();}
});

test('kept market prices are public feed answers only the server reads and writes, under checked keys',async()=>{
 const d=await db(setup);
 try{
  await d.query(`INSERT INTO market_quotes(key,data) VALUES('fx','{"rate":12500}'),('Crypto:BTC','{"usd":70000}'),('Stock:BRK.B','{"usd":480}')`);
  for(const key of ['Crypto:btc','Stock:../x','other','Crypto:'])await assert.rejects(d.query(`INSERT INTO market_quotes(key,data) VALUES($1,'{}')`,[key]),/check/i,key);
  await assert.rejects(d.query(`INSERT INTO market_quotes(key,data) VALUES('rates','[]')`),/check/i,'one answer is a JSON object');
  // A signed-in or anonymous reader never reaches the table itself.
  for(const role of ['authenticated','anon']){await d.exec(`SET ROLE ${role}`);await assert.rejects(d.query('SELECT * FROM market_quotes'),/permission denied/);await d.exec('RESET ROLE');}
 }finally{await d.close();}
});
