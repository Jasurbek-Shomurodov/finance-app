import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {harness} from './helpers/hooks.mjs';

const id=n=>`16800000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let auth=true,reply=()=>Response.json(null),calls=[];
const supabase={session:async()=>auth?{user:{id:'owner'},token:'owner-token'}:null,sameOrigin:req=>req.headers.get('origin')==='https://local',supa:async(path,init,token)=>{calls.push({path,body:init?.body?JSON.parse(init.body):undefined,token});return reply(path);}};
const api=loadTS('app/api/closing/route.ts',{'@/lib/supabase':supabase});
const post=(action,data,origin='https://local')=>api.POST(new Request('https://local/api/closing',{method:'POST',headers:{origin},body:JSON.stringify({action,data})}));
const refusal=(message,code='P0001',status=400)=>()=>Response.json({code,message},{status});

test('each closing action calls its database function with the signed-in person\'s token',async()=>{
 const cases=[
  ['close',{id:id(1),closed_on:'2026-11-20'},'close_finance_record',{p_id:id(1),p_closed_on:'2026-11-20'}],
  ['reopen',{id:id(1)},'reopen_finance_record',{p_id:id(1)}],
  ['close_account',{id:id(2),closed_on:'2026-11-20',move_to:id(3),close_holdings:false},'close_holding_account',{p_id:id(2),p_closed_on:'2026-11-20',p_move_to:id(3),p_close_holdings:false}],
  // Holdings that close with their account move nowhere, whatever the form still held.
  ['close_account',{id:id(2),closed_on:'2026-11-20',move_to:id(3),close_holdings:true},'close_holding_account',{p_id:id(2),p_closed_on:'2026-11-20',p_move_to:null,p_close_holdings:true}],
  ['reopen_account',{id:id(2)},'reopen_holding_account',{p_id:id(2)}],
  ['delete_account',{id:id(2)},'delete_holding_account',{p_id:id(2)}],
 ];
 for(const [action,data,name,args] of cases){
  calls=[];const response=await post(action,data);
  assert.equal(response.status,200,action);assert.deepEqual(await response.json(),{ok:true});
  assert.deepEqual(calls,[{path:'/rest/v1/rpc/'+name,body:args,token:'owner-token'}]);
 }
});

test('a malformed request, another site and a signed-out visitor never reach the database',async()=>{
 calls=[];
 for(const [action,data] of [['close',{id:'x',closed_on:'2026-11-20'}],['close',{id:id(1),closed_on:'20 November'}],['close_account',{id:id(1),closed_on:'2026-11-20',move_to:null}],['erase',{id:id(1)}]])assert.equal((await post(action,data)).status,400,action);
 assert.equal((await post('reopen',{id:id(1)},'https://other')).status,403);
 auth=false;assert.equal((await post('reopen',{id:id(1)})).status,401);assert.equal((await api.GET(new Request('https://local/api/closing?id='+id(1)))).status,401);auth=true;
 assert.equal((await api.GET(new Request('https://local/api/closing?id=nope'))).status,400);
 assert.equal(calls.length,0);
});

test('the database\'s own words reach the person: a balance left, a view-only member, a database not yet updated',async()=>{
 reply=refusal('Bring the balance to zero before closing.');
 let response=await post('close',{id:id(1),closed_on:'2026-11-20'});
 assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'Bring the balance to zero before closing.'});
 reply=refusal('This shared workspace is view-only.','42501',403);
 response=await post('delete_account',{id:id(2)});
 assert.equal(response.status,403);assert.equal((await response.json()).error,'This shared workspace is view-only.');
 reply=refusal('Could not find the function','PGRST202',404);
 response=await post('reopen',{id:id(1)});
 assert.equal(response.status,503);assert.match((await response.json()).error,/database needs an update/);
 reply=()=>{throw Error('offline');};
 assert.equal((await post('reopen',{id:id(1)})).status,503);assert.equal((await api.GET(new Request('https://local/api/closing?id='+id(1)))).status,503);
 reply=()=>Response.json(null);
});

test('the delete confirmation asks what still points at a record, and gets known names in a fixed order',async()=>{
 calls=[];reply=()=>Response.json(['goals','transactions','something new']);
 const response=await api.GET(new Request('https://local/api/closing?id='+id(1)));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{blockers:['transactions','goals']});
 assert.deepEqual(calls,[{path:'/rest/v1/rpc/record_delete_blockers',body:{p_id:id(1)},token:'owner-token'}]);
 reply=()=>Response.json([]);assert.deepEqual(await (await api.GET(new Request('https://local/api/closing?id='+id(1)))).json(),{blockers:[]});
 reply=refusal('nope','XX000',500);assert.equal((await api.GET(new Request('https://local/api/closing?id='+id(1)))).status,503);
 reply=()=>Response.json(null);
});

test('deleting an account that something still points at answers with what, so the dialog can name it',async()=>{
 const {linkedRecordMessage}=loadTS('lib/account-deletion.ts');
 const {DELETE}=loadTS('app/api/records/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner',user:{id:id(9)}}),sameOrigin:()=>true,supa:async()=>Response.json({code:'P0001',message:linkedRecordMessage,details:'transactions,goals'},{status:400})}});
 const response=await DELETE(new Request('https://local/api/records',{method:'DELETE',body:JSON.stringify({id:id(1)})}));
 assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:linkedRecordMessage,blockers:['transactions','goals']});
});

// The workspace's closing actions, signed in and in the sample workspace.
const closedLib=loadTS('lib/closed-records.ts');
function closing({demo=false,readOnly=false,fail=()=>false}={}){
 const sent=[],events=[];let rows=[{id:'wallet',kind:'Cash',amount:300,currency:'USD'},{id:'card',kind:'Cash',amount:5,currency:'USD'},{id:'aapl',kind:'Stock',amount:9,quantity:0,holding_account_id:'broker'}];
 let accounts=[{id:'broker',name:'Broker',kind:'Stock',currency:'USD'}];
 const fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):undefined;sent.push([url,body]);return fail(url,body)?Response.json({error:'Bring the balance to zero before closing.'},{status:409}):Response.json({ok:true});};
 const apply=(get,set)=>change=>set(typeof change==='function'?change(get()):change);
 const run=harness('components/workspace/state/use-closing.ts','useClosing',{fetch,...closedLib,showError:message=>events.push(['error',message]),showSaved:()=>events.push(['saved']),crypto:{randomUUID:()=>'movement-id'}});
 const render=()=>run({demo,setRows:apply(()=>rows,next=>{rows=next;}),refreshRecords:()=>events.push(['refresh']),setDemoHoldingAccounts:apply(()=>accounts,next=>{accounts=next;}),editable:()=>{if(readOnly)events.push(['view-only']);return !readOnly;}});
 return {render,sent,events,rows:()=>rows,accounts:()=>accounts,record:name=>rows.find(row=>row.id===name)};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('signed in, closing sends the balance on through the ordinary transfer and then closes; the lists are read again either way',async()=>{
 const app=closing();
 await app.render().closeRecord(app.record('wallet'),'2026-11-20','card');
 assert.deepEqual(app.sent,[
  ['/api/asset-movements',{id:'movement-id',kind:'transfer',source_id:'wallet',target_id:'card',sent:300,received:300,source_value:300,target_value:300,fee:0,date:'2026-11-20',notes:''}],
  ['/api/closing',{action:'close',data:{id:'wallet',closed_on:'2026-11-20'}}],
 ]);
 assert.deepEqual(app.events,[['refresh'],['saved']]);
 // An empty record needs no transfer.
 app.sent.length=0;await app.render().closeRecord(app.record('aapl'),'2026-11-20',null);
 assert.deepEqual(app.sent.map(([url])=>url),['/api/closing']);
 // A refusal still reads the lists again (a transfer may have gone through) and says nothing was saved.
 const refused=closing({fail:url=>url==='/api/closing'});
 await assert.rejects(refused.render().closeRecord(refused.record('wallet'),'2026-11-20','card'),/Bring the balance to zero before closing/);
 assert.deepEqual(refused.events,[['refresh']]);
 // The other actions, each with its own body.
 const rest=closing(),account=rest.accounts()[0];
 await rest.render().closeAccount(account,'2026-11-20','other',false);await rest.render().deleteAccount(account);
 rest.render().reopenRecord(rest.record('wallet'));rest.render().reopenAccount(account);await settle();
 assert.deepEqual(rest.sent.map(([,body])=>body),[{action:'close_account',data:{id:'broker',closed_on:'2026-11-20',move_to:'other',close_holdings:false}},{action:'delete_account',data:{id:'broker'}},{action:'reopen',data:{id:'wallet'}},{action:'reopen_account',data:{id:'broker'}}]);
 // A refused Reopen is said in a popup; a view-only member opens nothing and sends nothing.
 const failing=closing({fail:()=>true});
 failing.render().reopenRecord(failing.record('wallet'));await settle();
 assert.deepEqual(failing.events,[['refresh'],['error','Bring the balance to zero before closing.']]);
 const viewer=closing({readOnly:true});
 viewer.render().requestClose(viewer.record('wallet'));viewer.render().reopenRecord(viewer.record('wallet'));viewer.render().reopenAccount(account);
 assert.equal(viewer.render().closing,null);assert.deepEqual(viewer.sent,[]);assert.equal(viewer.events.length,3);
});

test('the dialogs open one at a time; the sample workspace closes, reopens and deletes on its own rows',async()=>{
 const app=closing({demo:true}),account=app.accounts()[0];
 app.render().requestClose(app.record('wallet'));
 assert.equal(app.render().closing.record.id,'wallet');
 app.render().requestCloseAccount(account);assert.equal(app.render().closing.account.id,'broker');
 app.render().requestDeleteAccount(account);assert.equal(app.render().closing.remove.id,'broker');
 app.render().endClosing();assert.equal(app.render().closing,null);
 await app.render().closeRecord(app.record('wallet'),'2026-11-20','card');
 assert.deepEqual([app.record('wallet').amount,app.record('wallet').closed_on,app.record('card').amount],[0,'2026-11-20',305]);
 app.render().reopenRecord(app.record('wallet'));await settle();
 assert.equal(app.record('wallet').closed_on,null);
 // The investment account closes with its sold-out holding, reopens with it, then moves it out and is deleted.
 await app.render().closeAccount(account,'2026-11-21',null,true);
 assert.deepEqual([app.accounts()[0].closed_on,app.record('aapl').closed_on],['2026-11-21','2026-11-21']);
 app.render().reopenAccount(app.accounts()[0]);await settle();
 assert.deepEqual([app.accounts()[0].closed_on,app.record('aapl').closed_on],[null,null]);
 await app.render().closeAccount(app.accounts()[0],'2026-11-22','other',false);
 assert.deepEqual([app.record('aapl').holding_account_id,app.record('aapl').closed_on],['other',null]);
 await app.render().deleteAccount(app.accounts()[0]);
 assert.deepEqual(app.accounts(),[]);assert.deepEqual(app.sent,[],'nothing is sent from the sample workspace');
});
