import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const migration=fs.readFileSync('migrations/163_new_goals_join_funding.sql','utf8');
const {fundingPlan,unassignedSurplus}=loadTS('lib/goal-funding.ts');
const goal=(id,extra={})=>({id,name:id,kind:'savings',currency:'USD',funding_enabled:true,funding_priority:10,target:1000,allocated:0,...extra});

test('migration 163 is in setup.sql, moves only the default and touches no existing goal',()=>{
 assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(migration.trimEnd()));
 assert.match(migration,/ALTER COLUMN funding_enabled SET DEFAULT true/);
 assert.doesNotMatch(migration,/UPDATE public\.savings_goals/);
 assert.match(migration,/'schema_version',163/);
 assert.match(fs.readFileSync('lib/database-capabilities.ts','utf8'),/requiredSchemaVersion = 172/);
});

test('a new goal is in the funding plan, and one without a budget asks for nothing rather than hiding the plan',()=>{
 const funded=goal('car',{funding_monthly:300}),fresh=goal('trip'),holdings=goal('shares',{kind:'investment',monthly_contribution:50});
 const plan=fundingPlan([funded,fresh,holdings],500,'USD','2026-11-14');
 assert.deepEqual(plan.rows.map(row=>[row.goal.id,row.requested]),[['car',300],['shares',0],['trip',0]]);
 assert.equal(plan.remaining,200);assert.equal(plan.complete,true);
 assert.equal(unassignedSurplus([fresh],500,'USD','2026-11-14'),500);
 // A goal the person took out of the plan stays out.
 assert.equal(fundingPlan([goal('idea',{funding_enabled:false,funding_monthly:90})],500,'USD','2026-11-14').rows.length,0);
});

test('a goal created through the app is included in monthly funding; an edit keeps a switched-off goal off',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();const id=n=>`c3000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const owner=id(1);
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const save=extra=>db.query("SELECT planning_action('goal',$1)",[{id:id(20),name:'Trip',account_id:null,kind:'net_worth',currency:'USD',target:500,allocated:0,target_date:'2027-01-01',...extra}]);
  const enabled=async()=>(await db.query('SELECT funding_enabled FROM savings_goals WHERE id=$1',[id(20)])).rows[0].funding_enabled;
  await save();assert.equal(await enabled(),true);
  await db.query('SELECT configure_goal_funding($1)',[{goal_id:id(20),priority:1,monthly:null,enabled:false,paused_until:null,mode:'one_time'}]);
  await save({name:'Trip to the coast',expected_allocated:0});assert.equal(await enabled(),false);
 }finally{await db.close();}
});
