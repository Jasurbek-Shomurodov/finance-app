import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

// The rate check for money lent from an account in another currency, with the database and the rate provider stubbed.
const WALLET='17000000-0000-4000-8000-000000000001',LOAN='17000000-0000-4000-8000-000000000002';
function harness(){
 const state={account:[{id:WALLET,kind:'Cash',currency:'USD'}],prior:[],rate:{rate:12000,effective_date:'2026-11-24'},rateError:null,fail:false,rateCalls:[]};
 const {lendExchange}=loadTS('lib/lend-exchange.ts',{
  '@/lib/supabase':{supa:async path=>state.fail?new Response('{}',{status:500}):Response.json(path.includes('investment_account_links')?state.prior:state.account)},
  '@/lib/official-rate':{loadOfficialRate:async(...args)=>{state.rateCalls.push(args);if(state.rateError)throw state.rateError;return state.rate;}},
 });
 return {lendExchange,state};
}
const loan=(changes={})=>({id:LOAN,currency:'UZS',lent_date:'2026-11-25',lent_from:WALLET,lent_exchange_rate:12000,...changes});

test('a loan from an account in its own currency, or from none, needs no rate',async()=>{
 const {lendExchange,state}=harness();
 assert.deepEqual(await lendExchange(loan({lent_from:null}),'t'),{fx:null});
 state.account=[{id:WALLET,kind:'Cash',currency:'UZS'}];
 assert.deepEqual(await lendExchange(loan(),'t'),{fx:null});
 assert.equal(state.rateCalls.length,0);
});

test('UZS lent from a USD wallet carries the day’s rate, which the form must have shown',async()=>{
 const {lendExchange,state}=harness();
 assert.deepEqual(await lendExchange(loan(),'t'),{fx:{p_rate:12000,p_rate_date:'2026-11-24',p_account_currency:'USD',p_record_currency:'UZS'}});
 assert.deepEqual(state.rateCalls,[['USD','UZS','2026-11-25']]);
 assert.deepEqual(await lendExchange(loan({lent_exchange_rate:11000}),'t'),{error:'The exchange rate changed. Refresh the rate and review the amounts.',status:409});
 // A retry after a lost response keeps the rate it was saved with.
 state.prior=[{account_id:WALLET,exchange_rate:11000,rate_date:'2026-11-20'}];
 assert.deepEqual((await lendExchange(loan({lent_exchange_rate:11000}),'t')).fx.p_rate,11000);
});

test('a missing account, rate or date, or an unreachable database, is refused',async()=>{
 const {lendExchange,state}=harness();
 assert.deepEqual(await lendExchange(loan({lent_date:null}),'t'),{error:'Check the record fields.',status:400});
 state.rateError=Error('down');
 assert.deepEqual(await lendExchange(loan(),'t'),{error:'Historical exchange rates are unavailable.',status:422});
 state.account=[{id:WALLET,kind:'Deposit',currency:'USD'}];
 assert.deepEqual(await lendExchange(loan(),'t'),{error:'Choose one of your cash accounts.',status:400});
 state.account=[];
 assert.equal((await lendExchange(loan(),'t')).status,400);
 state.fail=true;
 assert.deepEqual(await lendExchange(loan(),'t'),{error:'Could not load accounts or exchange history.',status:503});
});
