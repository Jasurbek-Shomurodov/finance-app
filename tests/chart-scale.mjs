import test from 'node:test';
import assert from 'node:assert/strict';
import {evenTimeTicks,flooredAxis,niceAxis,spreadLabels} from '../lib/chart-scale.ts';
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

test('a floored axis starts exactly at the main line’s opening value, with round ticks above it',()=>{
 // Investments open at 311,000; Bitcoin later falls to 253,000, which lowers the axis so its line is shown in full.
 const lowered=flooredAxis([311000,321000,345000,253000,328000],311000);
 assert.equal(lowered.domain[0],253000);assert.ok(lowered.domain[1]>=345000);
 const {domain,ticks}=flooredAxis([311000,321000,345000,328000],311000);
 assert.equal(domain[0],311000);assert.equal(ticks[0],311000);
 assert.ok(domain[1]>=345000);
 assert.ok(ticks.slice(1).every(tick=>tick%5000===0&&tick>311000),JSON.stringify(ticks));
 const step=ticks[2]-ticks[1];assert.ok(ticks[1]-311000>=step/2,'no tick crowds the floor');
 // Nothing above the floor still leaves a usable range, and an unusable floor falls back to the usual axis.
 const flat=flooredAxis([100,100],100);assert.equal(flat.domain[0],100);assert.ok(flat.domain[1]>100);
 assert.equal(flooredAxis([100,90],100).domain[0],90,'a value under the floor lowers the axis, as the comparison lines need');
 assert.deepEqual(flooredAxis([0,10],Number.NaN),niceAxis([0,10]));
});

test('time axis labels are whole days spread evenly from the first to the last, never two at one edge',()=>{
 const day=86400000,at=date=>Date.parse(date+'T00:00:00Z');
 const year=evenTimeTicks(at('2026-01-01'),at('2026-11-23'),5);
 assert.equal(year.length,5);assert.equal(year[0],at('2026-01-01'));assert.equal(year.at(-1),at('2026-11-23'));
 assert.ok(year.every(tick=>tick%day===0),'each label is a day');
 // No two labels are closer than a fifth of the period: the first two cannot share the left edge.
 const gaps=year.slice(1).map((tick,index)=>tick-year[index]);
 assert.ok(Math.min(...gaps)>=(year.at(-1)-year[0])/5,gaps.join());
 // A short history gets one label per day at most, and no date twice.
 assert.deepEqual(evenTimeTicks(at('2026-11-21'),at('2026-11-23'),5),[at('2026-11-21'),at('2026-11-22'),at('2026-11-23')]);
 assert.deepEqual(evenTimeTicks(at('2026-11-22'),at('2026-11-23'),5),[at('2026-11-22'),at('2026-11-23')]);
 assert.deepEqual(evenTimeTicks(at('2026-11-23'),at('2026-11-23')+day/2,5),[at('2026-11-23'),at('2026-11-23')+day/2]);
 assert.deepEqual(evenTimeTicks(at('2026-11-23'),at('2026-11-23'),5),[at('2026-11-23')]);
 assert.deepEqual(evenTimeTicks(NaN,1,5),[]);
 assert.equal(evenTimeTicks(at('2026-01-01'),at('2026-11-23'),3).length,3);
});
