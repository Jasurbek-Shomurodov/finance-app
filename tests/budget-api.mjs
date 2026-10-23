import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
// API-005 / LEAK-001: a write the database refuses keeps the database's status and words. A view-only member of a shared
// workspace (42501) hears "view-only" with 403, a raise for people to read (P0001) its own words with 409, and only a
// function this database lacks (PGRST202) or a request that never arrived answers 503, so the client never retries a
// refusal as if the server were down.
const owner='a0000000-0000-4000-8000-000000000001',id='a0000000-0000-4000-8000-000000000002';
const viewOnly={code:'42501',message:'new row violates row-level security policy for table "budget_amounts"'};
const raised={code:'P0001',message:'Choose a month after the rollover start.'};
const missing={code:'PGRST202',message:'Could not find the function public.set_budget_amount'};
const session=async()=>({user:{id:owner},token:'owner',owner});
/** Loads a route whose database answers `refusal` to every write (reads answer `[]`) and remembers the writes. */
function route(file,refusal,extra={}){
 const writes=[];
 const supabase={session,sameOrigin:()=>true,supa:async(path,init={})=>{if((init.method??'GET')==='GET')return Response.json([]);writes.push(path);return Response.json(refusal,{status:refusal.code==='PGRST202'?404:refusal.code==='42501'?403:400});}};
 return {writes,module:loadTS(file,{'@/lib/supabase':supabase,'@/lib/monitoring':{reportError:async()=>{}},...extra})};
}
const request=(url,body,method='POST')=>new Request('https://local'+url,{method,headers:{origin:'https://local','Content-Type':'application/json'},body:JSON.stringify(body)});
const read=async response=>[response.status,(await response.json()).error];

test('the budget route relays the database\'s refusal: view-only 403, a raise in its own words 409, a missing function 503',async()=>{
 const settings={action:'settings',data:{mode:'flex',apply_forward:true}};
 const amount={action:'amount',data:{category_key:'Groceries',month:'2026-10',amount:120,currency:'USD',applies_forward:false}};
 const viewer=route('app/api/budget/route.ts',viewOnly);
 assert.deepEqual(await read(await viewer.module.POST(request('/api/budget',settings))),[403,'This shared workspace is view-only.']);
 assert.deepEqual(await read(await viewer.module.POST(request('/api/budget',amount))),[403,'This shared workspace is view-only.']);
 assert.deepEqual(await read(await route('app/api/budget/route.ts',raised).module.POST(request('/api/budget',amount))),[409,raised.message]);
 assert.deepEqual(await read(await route('app/api/budget/route.ts',missing).module.POST(request('/api/budget',amount))),[503,'Could not load or save the budget. Check that the latest migrations are installed.']);
 const down=loadTS('app/api/budget/route.ts',{'@/lib/supabase':{session,sameOrigin:()=>true,supa:async()=>{throw Error('fetch failed');}}});
 assert.deepEqual(await read(await down.POST(request('/api/budget',amount))),[503,'Could not load or save the budget. Check that the latest migrations are installed.'],'a request that never arrived is still a 503');
});

// Each sibling route that used to answer 503 for every refusal: the request it writes with, and how to call it.
const siblings=[
 {file:'app/api/comparison-profile/route.ts',call:m=>m.PATCH(request('/api/comparison-profile',{tracking_start:null},'PATCH'))},
 {file:'app/api/comparison-profile/route.ts',call:m=>m.PUT(request('/api/comparison-profile',{benchmarks:['SPY'],custom_symbol:''},'PUT'))},
 {file:'app/api/workspace-preferences/route.ts',call:m=>m.POST(request('/api/workspace-preferences',{data:{key:'goal_order',data:{ids:[id]}}}))},
 {file:'app/api/subscriptions/route.ts',call:m=>m.POST(request('/api/subscriptions',{action:'decide',data:{merchant:'Netflix',currency:'USD',status:'dismissed',decided_on:'2026-10-01'}}))},
 {file:'app/api/subscriptions/route.ts',call:m=>m.POST(request('/api/subscriptions',{action:'restore',data:{merchant:'Netflix',currency:'USD'}}))},
 {file:'app/api/tags/route.ts',call:m=>m.POST(request('/api/tags',{action:'save',data:{id,name:'Travel',color:'slate'}}))},
 {file:'app/api/tags/route.ts',call:m=>m.POST(request('/api/tags',{action:'delete',data:{id}}))},
 {file:'app/api/portfolio-snapshots/route.ts',call:m=>m.POST(request('/api/portfolio-snapshots',{})),extra:{'@/lib/rate-limit':{limits:{market:[]},rateLimited:async()=>false},'@/lib/server-market':{loadMarket:async()=>({})},'@/lib/portfolio-snapshots':{snapshotTotals:()=>({assets:0,debt:0,rates:{USD:1}})}}},
 {file:'app/api/settings/route.ts',call:m=>m.PUT(request('/api/settings',{language:'en',currencies:['USD']},'PUT'))},
 {file:'app/api/telegram/route.ts',call:m=>m.POST(request('/api/telegram',{action:'unlink'})),extra:{'@/lib/telegram':{telegramConfig:()=>({botUsername:'b'})}}},
];
test('every sibling route relays a view-only refusal as 403 and a raise as 409 in the database\'s words, and keeps 503 for a missing function',async()=>{
 const tagSchemas=loadTS('lib/tags.ts').tagSchemas;
 assert.ok(tagSchemas.save&&tagSchemas.delete,'the tag actions this test sends');
 for(const {file,call,extra} of siblings){
  const viewer=route(file,viewOnly,extra);
  assert.deepEqual(await read(await call(viewer.module)),[403,'This shared workspace is view-only.'],file);
  assert.ok(viewer.writes.length>=1,file+' wrote');
  assert.deepEqual(await read(await call(route(file,raised,extra).module)),[409,raised.message],file);
  const [status]=await read(await call(route(file,missing,extra).module));
  assert.equal(status,503,file+' without its function');
 }
});
