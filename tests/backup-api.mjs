import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
// households.md: backups are personal. The CSV export reads the signed-in person's own records whichever household is
// open, like the JSON backup and the recovery list on the same route.
const owner='a0000000-0000-4000-8000-000000000001';
const {workspaceHeader}=loadTS('lib/household.ts');
test('the CSV export reads the person\'s own records with an empty workspace header, whichever workspace is open',async()=>{
 const reads=[];
 const route=loadTS('app/api/backup/route.ts',{'@/lib/supabase':{session:async()=>({user:{id:owner},token:'owner',owner:'a0000000-0000-4000-8000-000000000002'}),sameOrigin:()=>true,
  supa:async(path,init={})=>{reads.push({path,headers:new Headers(init.headers)});return Response.json([{id:owner,name:'Wallet',kind:'Cash',amount:10,currency:'USD'}]);}}});
 const response=await route.GET(new Request('https://local/api/backup?format=csv'));
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/csv/);
 assert.match(await response.text(),/Wallet/);
 assert.equal(reads.length,1);assert.match(reads[0].path,/^\/rest\/v1\/finance_records\?/);
 assert.equal(reads[0].headers.get(workspaceHeader),'','the empty header names the person\'s own account, not the open household');
});
