import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const id=n=>`b0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function api({auth=true,origin=true,failure=false,currencies={[id(4)]:'UZS',[id(5)]:'USD'},rate=async()=>({rate:0.00008451})}={}){
 const calls=[],asked=[];
 const route=loadTS('app/api/transaction-tools/route.ts',{'@/lib/official-rate':{loadOfficialRate:async(from,to,date)=>{asked.push([from,to,date]);return rate();}},'@/lib/supabase':{session:async()=>auth?{user:{id:id(1)},token:'owner-token'}:null,sameOrigin:()=>origin,supa:async(path,init,token)=>{if(path.includes('finance_records?select=id,currency')){assert.equal(token,'owner-token');return Response.json(Object.entries(currencies).filter(([key])=>path.includes(key)).map(([key,currency])=>({id:key,currency})));}calls.push({path,init,token});return failure?Response.json(typeof failure==='object'?failure:{code:'P0001',message:'Split amounts must equal the transaction amount.'},{status:400}):Response.json({ok:true});}},'@/lib/server-records':{readOwnerRows:async(table,token,options)=>{calls.push({table,token,options});return [];}}});
 return {...route,calls,asked};
}
const request=body=>new Request('https://local/api/transaction-tools',{method:'POST',body:JSON.stringify(body)});
test('transaction tools reject anonymous, cross-origin, malformed and non-finite writes before accessing data',async()=>{
 const rule={action:'rule',data:{id:id(2),category_id:id(3),pattern:'Shop',direction:'expense',priority:0,enabled:true}};
 for(const [options,status] of [[{auth:false},401],[{origin:false},403]]){const app=api(options);assert.equal((await app.POST(request(rule))).status,status);assert.equal(app.calls.length,0);}
 for(const data of [{action:'unknown',data:{}},{...rule,data:{...rule.data,pattern:' '}},{action:'split',data:{record_id:id(4),splits:[{category_id:id(3),amount:2}]}},{action:'forecast',data:{record_id:'invalid',account_id:null}}]){const app=api();assert.equal((await app.POST(request(data))).status,400);assert.equal(app.calls.length,0);}
});
test('reads use owner token and stable unique pagination orders; writes pass only validated owner data',async()=>{
 const app=api();assert.equal((await app.GET()).status,200);assert.equal(app.calls.length,2);assert.ok(app.calls.every(call=>call.token==='owner-token'));
 assert.equal(app.calls.find(call=>call.table==='transaction_splits').options.order,'record_id.asc,position.asc');
 const before=app.calls.length;assert.equal((await app.POST(request({action:'rule',data:{id:id(2),category_id:id(3),pattern:'Shop',direction:'expense',priority:0,enabled:true}}))).status,400);assert.equal(app.calls.length,before);
 const failed=api({failure:true});assert.equal((await failed.POST(request({action:'split',data:{record_id:id(4),splits:[{category_id:id(3),amount:1},{category_id:id(3),amount:1}]}}))).status,409);
});

test('a forecast assignment takes the server\'s rate through the dollar, never one the client sends',async()=>{
 const data={record_id:id(4),account_id:id(5)};
 // A rate, or a pair, sent by the client is not read.
 const app=api();assert.equal((await app.POST(request({action:'forecast',data:{...data,exchange_rate:99,from_currency:'EUR',to_currency:'GBP'}}))).status,200);
 assert.equal(app.calls[0].path,'/rest/v1/rpc/save_forecast_assignment');
 assert.deepEqual(JSON.parse(app.calls[0].init.body),{p_record:id(4),p_account:id(5),p_rate:0.00008451,p_from:'UZS',p_to:'USD'});
 assert.equal(app.asked.length,1);assert.deepEqual(app.asked[0].slice(0,2),['UZS','USD']);assert.match(app.asked[0][2],/^\d{4}-\d{2}-\d{2}$/);
 // One currency, or no account: no rate is asked for.
 const same=api({currencies:{[id(4)]:'USD',[id(5)]:'USD'}});assert.equal((await same.POST(request({action:'forecast',data}))).status,200);
 assert.deepEqual(JSON.parse(same.calls[0].init.body),{p_record:id(4),p_account:id(5),p_rate:null,p_from:null,p_to:null});assert.equal(same.asked.length,0);
 const cleared=api();assert.equal((await cleared.POST(request({action:'forecast',data:{record_id:id(4),account_id:null}}))).status,200);
 assert.equal(JSON.parse(cleared.calls[0].init.body).p_account,null);assert.equal(cleared.asked.length,0);
 // Without a kept rate nothing is saved.
 const missing=api({rate:async()=>{throw Error('Historical exchange rates are unavailable.');}});
 const refused=await missing.POST(request({action:'forecast',data}));
 assert.equal(refused.status,422);assert.equal((await refused.json()).error,'Exchange rate unavailable.');assert.equal(missing.calls.length,0);
 for(const code of ['PGRST202','PGRST203','42883','42703']){
  const failed=api({failure:{code,message:'Internal schema detail'}});
  const response=await failed.POST(request({action:'forecast',data}));
  assert.equal(response.status,503);assert.match((await response.json()).error,/database update 045/);assert.equal(failed.calls.length,1);
 }
 for(const [code,message,expected,status] of [['P0001','Choose a cash account.','Choose a cash account.',409],['42501','Internal permission detail','Could not save the forecast assignment. Please try again.',403]]){
  const response=await api({failure:{code,message}}).POST(request({action:'forecast',data}));
  assert.equal(response.status,status);assert.equal((await response.json()).error,expected);
 }
});

test('splits accept built-in category kinds and reads return one category label',async()=>{
 const app=api();
 assert.equal((await app.POST(request({action:'split',data:{record_id:id(4),splits:[{category_id:'Living expense',amount:1},{category_id:id(3),amount:1}]}}))).status,200);
 assert.equal((await api().POST(request({action:'split',data:{record_id:id(4),splits:[{category_id:'Groceries',amount:1},{category_id:id(3),amount:1}]}}))).status,400);
 const {normalizeSplits}=loadTS('lib/transaction-tools.ts');
 assert.deepEqual(normalizeSplits([{record_id:'r',position:0,category_id:null,kind:'Charity',amount:'2.5'},{record_id:'r',position:1,category_id:id(3),kind:null,amount:1}]),[{record_id:'r',position:0,category_id:'Charity',amount:2.5},{record_id:'r',position:1,category_id:id(3),amount:1}]);
});
