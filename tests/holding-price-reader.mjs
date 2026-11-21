import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

test('a series is read from the kept closes, with the feed its kind needs',async()=>{
 const calls=[],feeds=[];
 const {keptSeries}=loadTS('lib/holding-price-reader.ts',{
  './after-response':{afterResponse:()=>{}},
  './price-feeds':{cryptoHistory:async(from,to,symbol)=>{feeds.push(['crypto',symbol,from,to]);return [];},stockHistory:async(symbol,from,to,key)=>{feeds.push(['stock',symbol,from,to,key]);return [];}},
  './price-history-cache':{keptHistory:async(series,start,end,live,deps)=>{calls.push([series,start,end,typeof deps.later]);await live(start,end);return [{date:start,close:1}];}},
 });
 const key=process.env.TWELVE_DATA_API_KEY;
 try{
  delete process.env.TWELVE_DATA_API_KEY;
  assert.deepEqual(await keptSeries('stock:AAPL','2026-01-01','2026-02-01'),[],'no key, no stock closes');
  assert.deepEqual(await keptSeries('crypto:BTC','2026-01-01','2026-02-01'),[{date:'2026-01-01',close:1}]);
  process.env.TWELVE_DATA_API_KEY='test-key';
  await keptSeries('stock:AAPL','2026-01-01','2026-02-01');
  assert.deepEqual(calls,[['crypto:BTC','2026-01-01','2026-02-01','function'],['stock:AAPL','2026-01-01','2026-02-01','function']]);
  assert.deepEqual(feeds,[['crypto','BTC','2026-01-01','2026-02-01'],['stock','AAPL','2026-01-01','2026-02-01','test-key']]);
 }finally{if(key===undefined)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=key;}
});
