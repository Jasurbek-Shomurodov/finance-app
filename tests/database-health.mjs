import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRenderer,hostModule,language,text,byText,byType} from './helpers/component-tree.mjs';
import {loadTS} from './helpers/load-ts.mjs';

const {requiredSchemaVersion,schemaVersionOf,supportsDatabase}=loadTS('lib/database-capabilities.ts');
const current={schema_version:requiredSchemaVersion,record_revisions:true,verified_restore:true};
const updateMessage='The app database needs an update. Ask the administrator to apply the latest migrations.';
const unreachable='Could not check the database. Please try again.';

test('the app requires the newest migration in migrations/',()=>{
 const newest=Math.max(...fs.readdirSync('migrations').map(file=>Number(file.slice(0,3))).filter(Number.isFinite));
 assert.equal(requiredSchemaVersion,newest);
});

test('a database is supported only at or above the required version with both capability flags',()=>{
 assert.equal(supportsDatabase(current),true);
 assert.equal(supportsDatabase({...current,schema_version:requiredSchemaVersion+1}),true,'a newer database still serves this app');
 assert.equal(supportsDatabase({...current,schema_version:requiredSchemaVersion-1}),false,'one missing migration fails the check');
 assert.equal(supportsDatabase({...current,record_revisions:false}),false);
 assert.equal(supportsDatabase({...current,verified_restore:undefined}),false);
 for(const value of [null,undefined,'146',[],{...current,schema_version:'146'},{...current,schema_version:146.5}])assert.equal(supportsDatabase(value),false);
 assert.equal(schemaVersionOf(current),requiredSchemaVersion);
 assert.equal(schemaVersionOf({schema_version:'146'}),null);
 assert.equal(schemaVersionOf(null),null);
});

function route({signedIn=true,answer}={}){
 const calls=[];
 const {GET}=loadTS('app/api/database-status/route.ts',{'@/lib/supabase':{session:async()=>signedIn?{token:'owner'}:null,supa:async(path,init,token)=>{calls.push({path,init,token});return answer();}}});
 const check=async()=>{const response=await GET();return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};};
 return {check,calls};
}

test('database status asks finance_capabilities with the caller token and reports both versions',async()=>{
 const {check,calls}=route({answer:()=>Response.json(current)});
 assert.deepEqual(await check(),{status:200,body:{compatible:true,schemaVersion:requiredSchemaVersion,requiredVersion:requiredSchemaVersion},cache:'no-store'});
 assert.deepEqual(calls,[{path:'/rest/v1/rpc/finance_capabilities',init:{method:'POST',body:'{}'},token:'owner'}]);
});

test('database status reports an unapplied migration with the version the database is at',async()=>{
 const {check}=route({answer:()=>Response.json({...current,schema_version:requiredSchemaVersion-2})});
 assert.deepEqual(await check(),{status:503,body:{error:updateMessage,compatible:false,schemaVersion:requiredSchemaVersion-2,requiredVersion:requiredSchemaVersion},cache:'no-store'});
});

test('database status fails a current version that lacks a capability flag',async()=>{
 const {check}=route({answer:()=>Response.json({...current,verified_restore:false})});
 const result=await check();
 assert.equal(result.status,503);assert.equal(result.body.compatible,false);assert.equal(result.body.schemaVersion,requiredSchemaVersion);
});

test('a database without finance_capabilities needs every migration and reports no version',async()=>{
 const {check}=route({answer:()=>Response.json({code:'PGRST202',message:'Could not find the function'},{status:404})});
 assert.deepEqual(await check(),{status:503,body:{error:updateMessage,compatible:false,schemaVersion:null,requiredVersion:requiredSchemaVersion},cache:'no-store'});
});

test('an unreachable database or a server error is a failed check, never a version verdict',async()=>{
 const thrown=route({answer:()=>{throw Error('network');}});
 assert.deepEqual(await thrown.check(),{status:503,body:{error:unreachable},cache:'no-store'});
 const failed=route({answer:()=>Response.json({code:'XX000'},{status:500})});
 const result=await failed.check();
 assert.equal(result.status,503);assert.deepEqual(result.body,{error:unreachable});
});

test('database status needs a signed-in session and never reaches the database without one',async()=>{
 const {check,calls}=route({signedIn:false,answer:()=>Response.json(current)});
 assert.equal((await check()).status,401);assert.equal(calls.length,0);
});

const {checkDatabaseHealth}=loadTS('lib/database-health.ts');
const replying=(body,status=200)=>async(url,init)=>{assert.equal(url,'/api/database-status');assert.equal(init.cache,'no-store');return typeof body==='string'?new Response(body,{status}):Response.json(body,{status});};

test('the client check reads up to date, behind, missing and unreachable answers',async()=>{
 assert.deepEqual(await checkDatabaseHealth(replying({compatible:true,schemaVersion:146,requiredVersion:146})),{compatible:true,schemaVersion:146,requiredVersion:146,error:''});
 assert.deepEqual(await checkDatabaseHealth(replying({error:updateMessage,compatible:false,schemaVersion:144,requiredVersion:146},503)),{compatible:false,schemaVersion:144,requiredVersion:146,error:updateMessage});
 assert.deepEqual(await checkDatabaseHealth(replying({error:updateMessage,compatible:false,schemaVersion:null,requiredVersion:146},503)),{compatible:false,schemaVersion:null,requiredVersion:146,error:updateMessage});
 assert.deepEqual(await checkDatabaseHealth(replying({error:'Please sign in again.'},401)),{compatible:false,schemaVersion:null,requiredVersion:null,error:'Please sign in again.'});
 assert.deepEqual(await checkDatabaseHealth(replying('<html>Bad gateway</html>',502)),{compatible:false,schemaVersion:null,requiredVersion:null,error:unreachable});
 assert.deepEqual(await checkDatabaseHealth(async()=>{throw TypeError('Failed to fetch');}),{compatible:false,schemaVersion:null,requiredVersion:null,error:unreachable});
 assert.equal((await checkDatabaseHealth(replying({compatible:'yes'}))).compatible,false,'only a literal true is up to date');
});

function panel({demo=false}={}){
 const r=createRenderer(),pending=[];
 const {DatabaseHealth}=r.load('components/database-health.tsx',{
  '@/components/language-provider':language('en'),'@/components/ui/button':hostModule(),'@/components/presentation-foundation/info-hint':hostModule(),'lucide-react':hostModule(),
  '@/lib/database-health':{checkDatabaseHealth:()=>new Promise(resolve=>pending.push(resolve))},
 });
 r.render(r.react.createElement(DatabaseHealth,{demo}));
 const button=()=>r.find(node=>node.type==='Button');
 const click=async(result)=>{r.fire(button(),'onClick');const busy=text(button());pending.shift()(result);await r.flush();return busy;};
 return {r,button,click};
}

test('the Settings button reports an up-to-date database with both versions',async()=>{
 const p=panel();
 assert.equal(text(p.button()),'Check database');
 assert.equal(p.r.all(node=>node.props?.role==='status').length,0,'nothing is reported before a check');
 assert.equal(await p.click({compatible:true,schemaVersion:146,requiredVersion:146,error:''}),'Checking database…');
 assert.equal(text(p.button()),'Check database');assert.equal(p.button().props.disabled,false);
 assert.equal(p.r.find(byText('span','Up to date')).props.className,'status-badge is-paid');
 assert.ok(p.r.find(byText('p','Database version 146; the app needs 146.')));
 assert.match(text(p.r.find(byType('span','Checked '))),/^Checked \d{1,2} \w+ \d{4} \d{2}:\d{2}$/);
 assert.equal(p.r.all(node=>node.props?.role==='alert').length,0);
});

test('the Settings button names the missing migrations and the update message',async()=>{
 const p=panel();
 await p.click({compatible:false,schemaVersion:144,requiredVersion:146,error:updateMessage});
 assert.equal(p.r.find(byText('span','Update needed')).props.className,'status-badge is-overdue');
 assert.ok(p.r.find(byText('p','Database version 144; the app needs 146.')));
 assert.equal(text(p.r.find(node=>node.props?.role==='alert')),updateMessage);
 // A database without the capabilities function is behind too, with no version to show.
 await p.click({compatible:false,schemaVersion:null,requiredVersion:146,error:updateMessage});
 assert.ok(p.r.find(byText('span','Update needed')));
 assert.equal(p.r.all(byType('p','Database version')).length,0);
});

test('the Settings button shows a failed check, not an update, when the database cannot be reached',async()=>{
 const p=panel();
 await p.click({compatible:false,schemaVersion:null,requiredVersion:null,error:unreachable});
 assert.ok(p.r.find(byText('span','Check failed')));
 assert.equal(p.r.all(byText('span','Update needed')).length,0);
 assert.equal(text(p.r.find(node=>node.props?.role==='alert')),unreachable);
 // Checking again replaces the earlier result.
 await p.click({compatible:true,schemaVersion:146,requiredVersion:146,error:''});
 assert.ok(p.r.find(byText('span','Up to date')));assert.equal(p.r.all(node=>node.props?.role==='alert').length,0);
});

test('the sample workspace has no database check',()=>{
 const p=panel({demo:true});
 assert.equal(p.r.all(node=>node.type==='Button').length,0);
 assert.ok(p.r.find(byText('p','The sample workspace has no database to check.')));
});

test('Settings shows the database check in Import & backup',()=>{
 const screen=fs.readFileSync('components/workspace/screens/settings-screen.tsx','utf8');
 assert.match(screen,/data-tools=\{<>[^\n]*<DatabaseHealth demo=\{demo\}\/>/);
});
