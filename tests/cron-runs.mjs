import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadTS} from './helpers/load-ts.mjs';
import {deliveryTable} from './helpers/telegram-cron.mjs';
const {recordCronRun,cronRunDays}=loadTS('lib/cron-runs.ts');
const {deliverToSubscribers}=loadTS('lib/telegram-owner.ts');
const digest={kind:'digest',period:'2026-10-22'};

test('a claim a cut-off run left undelivered is taken over, while a delivered or still-fresh one is never sent again',async()=>{
 // 20–22 October 2026: Vercel stopped the digest run at its time limit after claiming every owner, and the claims
 // skipped them for the rest of the day, so neither the picture nor the text arrived.
 const stale=new Set(['cut-off']);
 const deliveries=deliveryTable([
  {user_id:'cut-off',...digest,delivered:false},
  {user_id:'in-flight',...digest,delivered:false},
  {user_id:'done',...digest,delivered:true},
 ],{stale:row=>stale.has(row.user_id)});
 const subscribers=[{user_id:'cut-off',chat_id:1},{user_id:'in-flight',chat_id:2},{user_id:'done',chat_id:3},{user_id:'new',chat_id:4}];
 const sent=[];
 const counts=await deliverToSubscribers({read:async()=>subscribers,write:deliveries.write},digest,async({chat_id})=>{sent.push(chat_id);return true;});
 assert.deepEqual(counts,{sent:2,failed:0,blocked:0});
 assert.deepEqual(sent.sort(),[1,4]);
 assert.ok(deliveries.rows.every(row=>row.user_id==='in-flight'||row.delivered),'every message that arrived is marked delivered');
 // Delivered now, so even a stale-looking claim is not sent a second time.
 stale.add('new');
 const again=[];
 await deliverToSubscribers({read:async()=>subscribers,write:deliveries.write},digest,async({chat_id})=>{again.push(chat_id);return true;});
 assert.deepEqual(again,[]);
});

test('a message that arrived but could not be marked delivered still counts as sent and is reported',async()=>{
 const reported=[];
 const {deliverToSubscribers:deliver}=loadTS('lib/telegram-owner.ts',{'./monitoring':{reportError:async(...args)=>{reported.push(args);}}});
 const deliveries=deliveryTable();
 const write=(path,init)=>init.method==='PATCH'?Promise.resolve(new Response(null,{status:500})):deliveries.write(path,init);
 assert.deepEqual(await deliver({read:async()=>[{user_id:'a',chat_id:1}],write},digest,async()=>true),{sent:1,failed:0,blocked:0});
 assert.equal(reported.length,1);assert.equal(reported[0][0],'telegram-delivery');
});

function runsTable({failInsert=false}={}){
 const rows=[],deletes=[];
 return {rows,deletes,async write(path,init){
  if(failInsert)return new Response(null,{status:404});
  if(init.method==='POST'){const row={id:rows.length+1,status:'running',...JSON.parse(init.body)};rows.push(row);return Response.json([row],{status:201});}
  if(init.method==='PATCH'){const id=Number(/id=eq\.(\d+)/.exec(path)[1]);Object.assign(rows.find(row=>row.id===id),JSON.parse(init.body));return new Response(null,{status:204});}
  if(init.method==='DELETE'){deletes.push(path);return new Response(null,{status:204});}
  throw Error('unexpected '+path);
 }};
}
const clock=(...times)=>{let index=0;return ()=>new Date(times[Math.min(index++,times.length-1)]);};

test('each cron run is recorded with its status, duration and answer, and old runs are dropped',async()=>{
 const table=runsTable();
 let rowWhileRunning;
 const response=await recordCronRun(table,'telegram-digest',async()=>{rowWhileRunning={...table.rows[0]};return Response.json({sent:0,failed:2,blocked:0,error:'Telegram did not accept the message.'},{status:503});},clock('2026-10-22T04:00:00.000Z','2026-10-22T04:00:41.500Z'));
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{sent:0,failed:2,blocked:0,error:'Telegram did not accept the message.'},'the job\'s own answer is returned untouched');
 // While the job runs its row says so: a row that stays 'running' is a run the platform cut off.
 assert.deepEqual(rowWhileRunning,{id:1,status:'running',job:'telegram-digest'});
 assert.deepEqual(table.rows[0],{id:1,job:'telegram-digest',status:'failed',finished_at:'2026-10-22T04:00:41.500Z',result:{status:503,ms:41500,sent:0,failed:2,blocked:0,error:'Telegram did not accept the message.'}});
 assert.equal(cronRunDays,90);
 assert.deepEqual(table.deletes,['/rest/v1/cron_runs?job=eq.telegram-digest&started_at=lt.2026-07-24T04:00:41.500Z']);
 // A job that throws is recorded as failed with its reason.
 const thrown=await recordCronRun(table,'telegram-recap',async()=>{throw Error('render crashed');},clock('2026-10-22T15:00:00.000Z','2026-10-22T15:00:02.000Z'));
 assert.equal(thrown.status,500);
 assert.deepEqual(table.rows[1].result,{status:500,ms:2000,error:'render crashed'});assert.equal(table.rows[1].status,'failed');
 const ok=await recordCronRun(table,'portfolio-snapshots',async()=>Response.json({captured:3,skipped:0,celebrated:0}));
 assert.equal(ok.status,200);assert.equal(table.rows[2].status,'ok');
});

test('a run that cannot be recorded still runs and answers as usual',async()=>{
 const table=runsTable({failInsert:true});let ran=false;
 const response=await recordCronRun(table,'telegram-digest',async()=>{ran=true;return Response.json({sent:1,failed:0,blocked:0});});
 assert.ok(ran);assert.equal(response.status,200);assert.deepEqual(await response.json(),{sent:1,failed:0,blocked:0});
 // An answer without the new row (a stand-in, or a proxy in between) is not a run id.
 const odd={write:async()=>Response.json(true)};
 assert.deepEqual(await (await recordCronRun(odd,'telegram-digest',async()=>Response.json({sent:1}))).json(),{sent:1});
 const offline={write:async()=>{throw Error('offline');}};
 assert.equal((await recordCronRun(offline,'telegram-digest',async()=>new Response(null,{status:401}))).status,401);
});

test('every scheduled job records its runs, and a whole-run failure records its cause',()=>{
 const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 for(const {path} of vercel.crons){
  const job=path.split('/').pop(),source=fs.readFileSync(`app${path}/route.ts`,'utf8');
  assert.match(source,new RegExp(`recordCronRun\\(db,'${job}',`),path);
  assert.match(source,/cause:runFailure\(error\)/,path);
 }
});

const id=n=>`53000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/153_cron_runs_and_stale_claims.sql','utf8');
async function database(sql){
 const d=new PGlite();
 // Supabase's service role bypasses row security.
 await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 await d.exec(sql);return d;
}
const claim=async(d,user,period='2026-10-22')=>(await d.query('SELECT claim_telegram_delivery($1,$2,$3) AS c',[user,'digest',period])).rows[0].c;

test('migration 153 is in setup.sql, safe to re-run, keeps older claims delivered and bumps the schema version',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 153');
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+);/)[1])>=153);
 const d=await database(setup.slice(0,setup.indexOf(migration)));
 try{
  await d.exec(`INSERT INTO telegram_deliveries(user_id,kind,period) VALUES('${id(1)}','digest',current_date-5),('${id(1)}','digest',current_date)`);
  await d.exec(migration);await d.exec(migration);
  assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,153);
  const rows=(await d.query('SELECT period=current_date AS today,delivered FROM telegram_deliveries ORDER BY period')).rows;
  assert.deepEqual(rows,[{today:false,delivered:true},{today:true,delivered:false}],'only a claim from today or yesterday may be retried');
 }finally{await d.close();}
});

test('claim_telegram_delivery takes a new claim or one left undelivered for five minutes, and cron_runs is server-only',async()=>{
 const d=await database(setup);
 try{
  await d.exec('SET ROLE service_role');
  assert.equal(await claim(d,id(1)),true);
  assert.equal(await claim(d,id(1)),false,'a run still sending keeps its claim');
  await d.exec('RESET ROLE');await d.exec(`UPDATE telegram_deliveries SET sent_at=now()-interval '6 minutes'`);await d.exec('SET ROLE service_role');
  assert.equal(await claim(d,id(1)),true,'a claim a cut-off run left behind is taken over');
  assert.equal(await claim(d,id(1)),false,'and taken over only once');
  await d.exec(`UPDATE telegram_deliveries SET delivered=true,sent_at=now()-interval '1 day'`);
  assert.equal(await claim(d,id(1)),false,'a delivered message is never claimed again');
  assert.equal(await claim(d,id(2)),true);
  const run=(await d.query(`INSERT INTO cron_runs(job) VALUES('telegram-digest') RETURNING status,finished_at`)).rows[0];
  assert.deepEqual(run,{status:'running',finished_at:null});
  await assert.rejects(d.query(`INSERT INTO cron_runs(job) VALUES('Not a job')`),/cron_runs_job_check/);
  await assert.rejects(d.query(`UPDATE cron_runs SET status='done'`),/cron_runs_status_check/);
  for(const role of ['anon','authenticated']){
   await d.exec('SET ROLE '+role);
   await assert.rejects(d.query('SELECT * FROM cron_runs'),/permission denied/,role);
   await assert.rejects(d.query('SELECT claim_telegram_delivery($1,$2,$3)',[id(1),'digest','2026-10-23']),/permission denied/,role);
  }
 }finally{await d.close();}
});
