import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {paymentProperty,propertyPaymentsFilter,propertyTotals}=loadTS('lib/property-totals.ts');
function route({rows=[],fail=false,auth={token:'t',user:{id:'me'}}}={}){
 const reads=[];
 const {GET}=loadTS('app/api/property-payments/route.ts',{
  '@/lib/supabase':{session:async()=>auth,supa:async()=>{throw Error('unused');}},
  '@/lib/server-records':{readOwnerRows:async(...args)=>{reads.push(args);if(fail)throw Error('down');return rows;}},
  '@/lib/viewer-day-rates':{withViewerDayRates:async data=>({records:data.records.map(row=>({...row,day_rates:{USD:1,UZS:12000}}))})},
 });
 return {GET,reads};
}
test('a property\'s year read asks for its payments and schedules only, and attaches each day\'s rates',async()=>{
 const {GET,reads}=route({rows:[{id:'rent',kind:'Rent income',amount:2400000,currency:'UZS',frequency:'Once',date:'2026-02-01',occurrence_record_id:'plan'}]});
 const response=await GET(new Request('https://local/api/property-payments?from=2026-01-01'));
 assert.equal(response.status,200);
 const {records}=await response.json();
 assert.deepEqual(records[0].day_rates,{USD:1,UZS:12000});
 assert.deepEqual(reads[0].slice(0,2),['finance_records','t']);
 assert.match(reads[0][2].or,/date\.gte\.2026-01-01/);
 // A rent payment that names only its schedule counts for the schedule's property.
 const home={id:'home',kind:'Property',currency:'USD'},plan={id:'plan',kind:'Rent income',frequency:'Monthly',income_source_id:'home'};
 assert.equal(paymentProperty(records[0],new Map([[plan.id,plan]])),'home');
 assert.deepEqual(propertyTotals([home,plan,...records],'2026-01-01','2026-12-31','USD',null).get('home'),{income:200,costs:0,missing:0});
});
test('the year read refuses a bad day, anyone signed out, and answers 503 when it fails',async()=>{
 assert.equal((await route().GET(new Request('https://local/api/property-payments?from=soon'))).status,400);
 assert.equal((await route({auth:null}).GET(new Request('https://local/api/property-payments?from=2026-01-01'))).status,401);
 assert.equal((await route({fail:true}).GET(new Request('https://local/api/property-payments?from=2026-01-01'))).status,503);
 assert.match(propertyPaymentsFilter('2026-01-01').select,/occurrence_record_id/);
});
