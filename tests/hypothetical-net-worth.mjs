import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {hypotheticalNetWorth}=loadTS('lib/hypothetical-net-worth.ts');

test('each benchmark replaces the actual investments in today’s net worth',()=>{
 const point={date:'2026-10-21',actual:400000,contributed:380000,SPY:425000,BTC:390000,BIL:null};
 assert.deepEqual(hypotheticalNetWorth(410000,point,['SPY','BTC','BIL']),[
  {key:'SPY',netWorth:435000,difference:25000},
  {key:'BTC',netWorth:400000,difference:-10000},
 ]);
});

test('nothing is shown without a net worth or an actual value to swap out',()=>{
 const point={date:'2026-10-21',actual:null,contributed:0,SPY:100};
 assert.deepEqual(hypotheticalNetWorth(1000,point,['SPY']),[]);
 assert.deepEqual(hypotheticalNetWorth(undefined,{...point,actual:50},['SPY']),[]);
 assert.deepEqual(hypotheticalNetWorth(1000,undefined,['SPY']),[]);
});
