import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';

/** Every TypeScript file the server or the browser runs. */
function sources(dir){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(dir,entry.name);
  return entry.isDirectory()?sources(file):/\.tsx?$/.test(entry.name)?[file]:[];
 });
}

test('every table and function the code asks PostgREST for exists in database/setup.sql',async()=>{
 // 20–22 October 2026: the digest and the recap read custom_categories, renamed to transaction_categories long before,
 // so every owner's report failed with "Database request failed." while the tests' stand-in still answered the old name.
 const tables=new Map(),functions=new Map();
 for(const file of ['lib','app','components'].flatMap(sources)){
  const source=fs.readFileSync(file,'utf8');
  for(const [,name] of source.matchAll(/\/rest\/v1\/rpc\/([a-z_]+)/g))functions.set(name,file);
  for(const [,name] of source.matchAll(/\/rest\/v1\/([a-z_]+)/g))if(name!=='rpc')tables.set(name,file);
 }
 assert.ok(tables.has('transaction_categories')&&functions.size>0,'the scan finds the queries');
 const d=new PGlite();
 try{
  await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;`);
  await d.exec(fs.readFileSync('database/setup.sql','utf8'));
  for(const [name,file] of tables)assert.notEqual((await d.query('SELECT to_regclass($1) AS r',['public.'+name])).rows[0].r,null,`${file} reads public.${name}, which does not exist`);
  for(const [name,file] of functions)assert.ok((await d.query(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1`,[name])).rows.length,`${file} calls public.${name}(), which does not exist`);
 }finally{await d.close();}
});
