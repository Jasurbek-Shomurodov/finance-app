import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {priceSeries,neededSeries,holdingPrices,pricesByRecord,priceScale}=loadTS('lib/holding-prices.ts');
const records=[{id:'a',kind:'Stock',name:'AAPL'},{id:'a2',kind:'Stock',name:'AAPL'},{id:'b',kind:'Crypto',name:'Bitcoin'},{id:'c',kind:'Property',name:'Flat'},{id:'d',kind:'Stock',name:'my shares'},{id:'e',kind:'Stock',name:'MSFT'}];
const event=(record_id,occurred_on,balance=1)=>({record_id,occurred_on,balance});

test('every holding priced live today follows a price series: shares on split-only closes, coins, vested shares and gold',()=>{
 assert.deepEqual(records.map(priceSeries),['shares:AAPL','shares:AAPL','crypto:BTC',null,null,'shares:MSFT']);
 assert.equal(priceSeries({kind:'Equity compensation',name:'AAPL'}),'shares:AAPL','vested shares move with their ticker between vestings');
 assert.equal(priceSeries({kind:'Precious metals',name:'Gold',metal:'XAU'}),'metal:XAU');
 assert.equal(priceSeries({kind:'Precious metals',name:'Silver',metal:'XAG'}),null,'the feed keeps no daily history for other metals');
 assert.equal(priceSeries({kind:'Precious metals',name:'Gold'}),null);
});

test('a snapshot is carried by how far its price moved since, and stays put without closes',()=>{
 const scale=priceScale(new Map([['a',[{date:'2026-03-01',close:100},{date:'2026-03-03',close:150}]],['late',[{date:'2026-03-05',close:10}]]]));
 scale.anchor('a','2026-03-01');scale.anchor('late','2026-03-02');scale.anchor('none','2026-03-01');
 assert.deepEqual(['2026-03-01','2026-03-02','2026-03-03','2026-03-09'].map(day=>scale.factor('a',day)),[1,1,1.5,1.5]);
 assert.equal(scale.factor('late','2026-03-06'),1,'no close by the snapshot’s day');assert.equal(scale.factor('none','2026-03-06'),1);
});

test('each series is needed from its holdings’ first recorded balance, never before kept history',()=>{
 const events=[event('a','2026-03-01'),event('a2','2026-02-01'),event('a2','2026-05-01'),event('b','2014-06-01'),event('c','2026-01-01'),event('e','2027-01-01'),event('a','2026-01-01',null)];
 assert.deepEqual([...neededSeries(records,events,'2026-09-30')],[['shares:AAPL','2026-02-01'],['crypto:BTC','2016-01-01']],'a holding with no balance yet, or only a future one, asks for nothing');
});

test('series are read once each; one that fails or is slow is left out',async()=>{
 const asked=[];
 const prices=await holdingPrices(records,[event('a','2026-03-01'),event('b','2026-03-05'),event('e','2026-03-07')],'2026-09-30',async(series,start,end)=>{
  asked.push([series,start,end]);
  if(series==='crypto:BTC')throw Error('feed down');
  if(series==='shares:MSFT')return new Promise(resolve=>setTimeout(()=>resolve([{date:'2026-03-07',close:1}]),200));
  return [{date:'2026-03-01',close:100}];
 },20);
 assert.deepEqual(asked,[['shares:AAPL','2026-03-01','2026-09-30'],['crypto:BTC','2026-03-05','2026-09-30'],['shares:MSFT','2026-03-07','2026-09-30']]);
 assert.deepEqual(prices,{'shares:AAPL':[{date:'2026-03-01',close:100}]});
 assert.deepEqual(await holdingPrices(records,[],'2026-09-30',async()=>assert.fail('nothing to ask')),{});
});

test('closes are handed to the history by holding',()=>{
 const closes=[{date:'2026-03-01',close:100}];
 const byRecord=pricesByRecord(records,{'shares:AAPL':closes,'crypto:BTC':[]});
 assert.deepEqual([...byRecord.keys()],['a','a2']);assert.equal(byRecord.get('a'),closes);
 assert.equal(pricesByRecord(records,undefined).size,0);
});
