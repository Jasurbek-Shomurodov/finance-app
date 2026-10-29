import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {cachedMarket,keepMarket,freshForMs,usableForMs}=loadTS('lib/market-cache.ts');
const NOW=Date.parse('2026-10-29T10:00:00Z');
const at=ago=>new Date(NOW-ago).toISOString();
const quote=(usd,ago=0)=>({usd,source:'Coinbase',fetchedAt:at(ago)});
const ask=(extra={})=>({fx:true,rates:true,crypto:[],stocks:[],metals:[],stockAccess:false,metalAccess:false,...extra});

// A stand-in for the service database: the kept rows, and every read and write it was asked for.
function database(rows=[]){
 const reads=[],writes=[];
 return {reads,writes,db:{
  read:async path=>{reads.push(decodeURIComponent(path));const keys=[...decodeURIComponent(path).matchAll(/"([^"]+)"/g)].map(match=>match[1]);return rows.filter(row=>keys.includes(row.key));},
  write:async(path,init)=>{writes.push({path,rows:JSON.parse(init.body)});return new Response(null,{status:201});},
 }};
}
// Feeds that answer whatever they are asked, and record each request.
function feeds(answer={}){
 const asked=[];
 const load=async request=>{
  asked.push(request);
  const data={fx:null,quotes:{},errors:{},stocksConfigured:false};
  if(request.fx&&answer.fx===null)data.errors.fx='Exchange rate unavailable.';else if(request.fx)data.fx=answer.fx??{rate:12500,date:'2026-10-29',source:'CBU'};
  if(request.rates&&answer.rates===null)data.errors.rates='Exchange rate unavailable.';else if(request.rates)data.rates={EUR:.9,USD:1};
  for(const symbol of request.crypto){if(answer[symbol]===null)data.errors[`Crypto:${symbol}`]='Price unavailable. Saved price is shown.';else data.quotes[`Crypto:${symbol}`]=quote(answer[symbol]??100);}
  for(const symbol of request.stocks)data.errors[`Stock:${symbol}`]='Sign in to fetch stock prices.';
  if(data.fx)data.rates={...data.rates,USD:1,UZS:data.fx.rate};
  return data;
 };
 return {asked,load};
}
const kept=[{key:'fx',data:{rate:12400,date:'2026-10-28',source:'CBU'},fetched_at:at(60_000)},{key:'rates',data:{rates:{EUR:.91,USD:1},ratesDate:'2026-10-28'},fetched_at:at(60_000)},{key:'Crypto:BTC',data:quote(70000,60_000),fetched_at:at(60_000)}];

test('kept and current prices answer at once, with no feed asked',async()=>{
 const {db}=database(kept),{asked,load}=feeds(),later=[];
 const data=await cachedMarket(ask({crypto:['BTC']}),{db,load,now:()=>NOW,later:work=>later.push(work)});
 assert.equal(asked.length,0);assert.equal(later.length,0);
 assert.equal(data.quotes['Crypto:BTC'].usd,70000);assert.deepEqual(data.fx,kept[0].data);
 assert.deepEqual(data.rates,{EUR:.91,USD:1,UZS:12400},'the CBU dollar rate sets UZS, as a live answer does');
 assert.deepEqual(data.errors,{});
});

test('a feed nobody holds yet is fetched before replying and kept after it',async()=>{
 const {db,writes}=database(kept),{asked,load}=feeds({ETH:3000}),later=[];
 const data=await cachedMarket(ask({crypto:['BTC','ETH']}),{db,load,now:()=>NOW,later:work=>later.push(work)});
 assert.deepEqual(asked.map(r=>[r.fx,r.rates,r.crypto]),[[false,false,['ETH']]],'only the missing coin is asked');
 assert.equal(data.quotes['Crypto:ETH'].usd,3000);assert.equal(data.quotes['Crypto:BTC'].usd,70000);
 assert.equal(writes.length,0,'the write waits until the reply is sent');
 for(const work of later)await work();
 assert.deepEqual(writes[0].rows.map(row=>row.key),['Crypto:ETH']);
});

test('a kept price past its freshness answers now and is refreshed after the reply',async()=>{
 const old=[...kept.slice(0,2),{key:'Crypto:BTC',data:quote(69000,freshForMs.quote+1),fetched_at:at(freshForMs.quote+1)}];
 const {db,writes}=database(old),{asked,load}=feeds({BTC:71000}),later=[];
 const data=await cachedMarket(ask({crypto:['BTC']}),{db,load,now:()=>NOW,later:work=>later.push(work)});
 assert.equal(data.quotes['Crypto:BTC'].usd,69000,'the reader is not held for the refresh');
 assert.equal(asked.length,0);
 for(const work of later)await work();
 assert.deepEqual(asked.map(r=>[r.fx,r.rates,r.crypto]),[[false,false,['BTC']]]);
 assert.equal(writes[0].rows[0].data.usd,71000);
});

test('a failing feed keeps its last good answer instead of reading as unavailable; a long-gone one is not shown',async()=>{
 const gone={key:'Crypto:SOL',data:quote(150,usableForMs+1),fetched_at:at(usableForMs+1)};
 const {db}=database([...kept,gone]),{load}=feeds({SOL:null});
 const data=await cachedMarket(ask({crypto:['BTC','SOL']}),{db,load,now:()=>NOW,later:()=>{}});
 assert.equal(data.quotes['Crypto:SOL'],undefined,'a price kept longer than three days is never shown');
 assert.equal(data.errors['Crypto:SOL'],'Price unavailable. Saved price is shown.');
 // The rate feeds fail live, but a kept answer stands in.
 const {db:empty}=database([kept[0],kept[1]]),{load:down}=feeds({fx:null,rates:null});
 const stale=await cachedMarket(ask(),{db:empty,load:down,now:()=>NOW+freshForMs.rates+1,later:work=>work()});
 assert.equal(stale.fx.rate,12400);assert.equal(stale.rates.EUR,.91);assert.deepEqual(stale.errors,{});
});

test('a reader who may not fetch stocks is never answered from kept stock prices',async()=>{
 const before=process.env.TWELVE_DATA_API_KEY;process.env.TWELVE_DATA_API_KEY='test-only-key';
 try{
  const {db,reads}=database([{key:'Stock:AAPL',data:{usd:200,source:'Twelve Data',fetchedAt:at(0)},fetched_at:at(0)}]),{load}=feeds();
  const data=await cachedMarket(ask({fx:false,rates:false,stocks:['AAPL']}),{db,load,now:()=>NOW,later:()=>{}});
  assert.equal(data.quotes['Stock:AAPL'],undefined);assert.equal(data.errors['Stock:AAPL'],'Sign in to fetch stock prices.');
  assert.ok(!reads.join().includes('Stock:AAPL'),'the kept stock price is not even read');
 }finally{if(before===undefined)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=before;}
});

test('before migration 156, or without the server key, every feed is fetched as before',async()=>{
 const {asked,load}=feeds();
 const failing={read:async()=>{throw Error('relation does not exist');},write:async()=>new Response(null,{status:404})};
 const data=await cachedMarket(ask({crypto:['BTC']}),{db:failing,load,now:()=>NOW,later:work=>work()});
 assert.equal(data.quotes['Crypto:BTC'].usd,100);assert.equal(asked[0].fx,true);
 const offline=await cachedMarket(ask({crypto:['BTC']}),{db:null,load,now:()=>NOW});
 assert.equal(offline.fx.rate,12500);
});

test('keepMarket keeps only answered feeds: an errored rate feed is not kept over a good one',async()=>{
 const {db,writes}=database();
 await keepMarket(db,{fx:null,rates:{USD:1},errors:{fx:'Exchange rate unavailable.',rates:'Exchange rate unavailable.'},quotes:{'Crypto:BTC':quote(1)},stocksConfigured:false});
 assert.deepEqual(writes[0].rows.map(row=>row.key),['Crypto:BTC']);
 assert.equal(writes[0].path,'/rest/v1/market_quotes?on_conflict=key');
 await keepMarket(null,{fx:null,rates:undefined,errors:{},quotes:{},stocksConfigured:false});
 await keepMarket(db,{fx:null,errors:{},quotes:{},stocksConfigured:false});
 assert.equal(writes.length,1,'nothing to keep writes nothing');
});
