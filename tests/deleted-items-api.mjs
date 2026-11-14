import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
let auth=true,fail=false,calls=[];
const api=loadTS('app/api/deleted-items/route.ts',{'@/lib/supabase':{session:async()=>auth?{user:{id:'owner'},token:'owner-token'}:null,sameOrigin:req=>req.headers.get('origin')==='https://local',
 supa:async(path,init,token)=>{calls.push({path,init,token});return fail?Response.json({}, {status:409}):Response.json(Array.from({length:11},(_,id)=>({id})));}}});
const id='10000000-0000-4000-8000-000000000001';
const request=(body,origin='https://local')=>new Request('https://local',{method:'POST',headers:{origin},body:JSON.stringify(body)});
test('deleted items are read with the owner token and bounded pagination',async()=>{
 calls=[];const response=await api.GET(new Request('https://local?page=2'));const data=await response.json();
 assert.equal(data.items.length,10);assert.equal(data.hasMore,true);assert.match(calls[0].path,/limit=11&offset=10$/);assert.equal(calls[0].token,'owner-token');
 assert.equal((await api.GET(new Request('https://local?page=-1'))).status,400);
});
test('a type tab and a search narrow the bin in the database, and anything else is refused',async()=>{
 calls=[];await api.GET(new Request('https://local?page=1&type=transactions&q=Coffee%20beans'));
 const query=new URL('https://local'+calls[0].path).searchParams;
 assert.equal(query.get('source'),'eq.finance_records');assert.equal(query.get('data->>frequency'),'eq.Once');
 assert.equal(query.get('data->>kind'),'in.("Salary","Rent income","Business income","Other income","Rent expense","Living expense","Charity","Other expense")');
 assert.equal(query.get('data->>name'),'ilike.*Coffee beans*');assert.equal(query.get('select'),'id,source,data,deleted_at,splits');
 calls=[];await api.GET(new Request('https://local?page=1'));assert.doesNotMatch(calls[0].path,/source=|data-%3E|ilike/,'the whole bin reads unfiltered');
 calls=[];assert.equal((await api.GET(new Request('https://local?type=photos'))).status,400);assert.equal(calls.length,0);
});
test('restoration validates input, session and origin before the owner-scoped RPC',async()=>{
 calls=[];assert.equal((await api.POST(request({id}))).status,200);assert.equal(calls[0].path,'/rest/v1/rpc/restore_deleted_item');assert.deepEqual(JSON.parse(calls[0].init.body),{p_id:id});
 calls=[];assert.equal((await api.POST(request({id:'bad'}))).status,400);assert.equal((await api.POST(request({id},'https://other'))).status,403);assert.equal(calls.length,0);
 auth=false;assert.equal((await api.GET(new Request('https://local'))).status,401);assert.equal((await api.POST(request({id}))).status,401);auth=true;
 fail=true;assert.equal((await api.POST(request({id}))).status,409);fail=false;
});
