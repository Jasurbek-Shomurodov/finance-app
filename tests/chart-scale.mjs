import test from 'node:test';
import assert from 'node:assert/strict';
import {niceAxis,spreadLabels} from '../lib/chart-scale.ts';
test('money axes use round ticks and never show negative values for non-negative data',()=>{
 assert.deepEqual(niceAxis([49645,3105952]),{domain:[0,4000000],ticks:[0,1000000,2000000,3000000,4000000]});
 assert.deepEqual(niceAxis([148480,901509]).ticks,[0,250000,500000,750000,1000000]);
 for(const values of [[1000],[],[0,0],[12.5,13.2],[900000,901000]]){
  const {domain,ticks}=niceAxis(values);
  assert.ok(ticks[0]>=0,JSON.stringify(values));assert.ok(domain[1]>domain[0]);
  for(const value of values)assert.ok(value>=domain[0]&&value<=domain[1]);
 }
});
test('negative data keeps a zero line and covers the full range',()=>{
 const {domain,ticks}=niceAxis([-500,1200]);
 assert.ok(ticks.includes(0));assert.ok(domain[0]<=-500&&domain[1]>=1200);
});
test('values that differ only by floating-point noise still produce a short, usable axis',()=>{
 for(const values of [[3.3,3.3,3.3,3.3000000000000003],[1000,999.9999999999999],[1e15,1e15+1],[0.1+0.2,0.3]]){
  const {domain,ticks}=niceAxis(values);
  assert.ok(ticks.length>=2&&ticks.length<=8,JSON.stringify(values));assert.ok(domain[1]>domain[0],JSON.stringify(values));
  for(const value of values)assert.ok(value>=domain[0]&&value<=domain[1],JSON.stringify(values));
 }
});
test('money axes never step by fractions, even for an empty or tiny range',()=>{
 assert.deepEqual(niceAxis([0,0]).ticks,[0,1]);
 for(const values of [[],[0],[0.4,0.7],[12.5,13.2],[3.3,3.3]]){
  const {ticks}=niceAxis(values);
  assert.ok(ticks.every(Number.isInteger),JSON.stringify(values)+' '+JSON.stringify(ticks));
 }
});

test('end labels sit at their values, spread apart in value order and kept inside the axis',()=>{
 const at=items=>spreadLabels(items,[400,440],5).map(item=>[item.key,item.at]);
 assert.deepEqual(at([{key:'a',value:410},{key:'b',value:430}]),[['b',430],['a',410]]);
 assert.deepEqual(at([{key:'a',value:427},{key:'b',value:428},{key:'c',value:426}]),[['b',428],['a',423],['c',418]]);
 assert.deepEqual(at([{key:'a',value:401},{key:'b',value:402},{key:'c',value:399}]),[['b',410],['a',405],['c',400]]);
 assert.deepEqual(at([{key:'a',value:999}]),[['a',440]]);
 assert.deepEqual(spreadLabels([],[0,1],1),[]);
});
