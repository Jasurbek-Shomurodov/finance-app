import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {hypotheticalNetWorth,netWorthComparison}=loadTS('lib/hypothetical-net-worth.ts');

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

test('the cards show today’s net worth, each benchmark’s figure and how much more or less that is than you have',async()=>{
 const React=(await import('react')).default;
 const {renderToStaticMarkup}=await import('react-dom/server');
 const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
 const {HypotheticalNetWorthCards}=loadTS('components/hypothetical-net-worth.tsx',{'@/components/language-provider':language,'@/components/presentation-foundation/info-hint':{InfoHint:({children})=>React.createElement('i',null,children)}});
 const series=[{key:'SPY',label:'S&P 500 · SPY',color:'blue'},{key:'BTC',label:'Bitcoin · BTC',color:'orange'}];
 const html=renderToStaticMarkup(React.createElement(HypotheticalNetWorthCards,{netWorth:314864,currency:'USD',series,rows:[{key:'SPY',netWorth:328781,difference:13917},{key:'BTC',netWorth:300000,difference:-14864},{key:'gone',netWorth:1,difference:1}]}));
 assert.match(html,/Net worth<\/span><strong>\$314,864/);
 assert.match(html,/data-best="true"[^>]*><span><i><\/i>S&amp;P 500 · SPY<\/span><strong>\$328,781<\/strong><em class="positive">\$13,917 more than you have/);
 assert.match(html,/\$300,000<\/strong><em class="negative">\$14,864 less than you have/);
 assert.doesNotMatch(html,/gone/);
 assert.equal(renderToStaticMarkup(React.createElement(HypotheticalNetWorthCards,{netWorth:1,currency:'USD',series,rows:[]})),'');
});

test('a benchmark line takes its chosen palette or custom colour, else its own',()=>{
 const {benchmarkColor,defaultBenchmarkColor}=loadTS('lib/comparison-profile.ts');
 assert.equal(benchmarkColor('BTC',{BTC:'#1e40af'}),'#1e40af');
 assert.match(benchmarkColor('BTC',{BTC:'violet'}),/^hsl\(270 /);
 assert.equal(benchmarkColor('BTC',{BTC:'url(x)'}),defaultBenchmarkColor('BTC'));
 assert.equal(benchmarkColor('SPY',undefined),defaultBenchmarkColor('SPY'));
});

test('the chart draws net worth with debts subtracted, and keeps each benchmark the same distance from it',()=>{
 // Investments are worth 400,000 but 90,000 of debt is outstanding: the line must read 310,000, not 400,000.
 const points=[
  {date:'2026-10-01',actual:380000,contributed:380000,invested:380000,SPY:380000,BTC:380000},
  {date:'2026-10-02',actual:390000,contributed:380000,invested:380000,SPY:395000,BTC:null},
  {date:'2026-10-03',actual:400000,contributed:385000,invested:385000,SPY:425000,BTC:390000},
 ];
 const history=[{date:'2026-09-30',net:280000},{date:'2026-10-03',net:310000}];
 assert.deepEqual(netWorthComparison(points,history,['SPY','BTC']),[
  {date:'2026-10-01',actual:280000,contributed:380000,invested:380000,SPY:280000,BTC:280000},
  {date:'2026-10-02',actual:280000,contributed:380000,invested:380000,SPY:285000,BTC:null},
  {date:'2026-10-03',actual:310000,contributed:385000,invested:385000,SPY:335000,BTC:300000},
 ]);
 // The last day agrees with the what-if cards for the same net worth.
 assert.equal(hypotheticalNetWorth(310000,points[2],['SPY'])[0].netWorth,335000);
});

test('days before the first net worth figure are left out, and a day without an investment value shows no benchmark',()=>{
 const points=[{date:'2026-10-01',actual:100,contributed:100,SPY:110},{date:'2026-10-02',actual:null,contributed:100,SPY:120}];
 assert.deepEqual(netWorthComparison(points,[{date:'2026-10-02',net:-50}],['SPY']),[{date:'2026-10-02',actual:-50,contributed:100,SPY:null}]);
 assert.deepEqual(netWorthComparison(points,[],['SPY']),[]);
 assert.deepEqual(netWorthComparison(points,[{date:'2026-10-01',net:Number.NaN}],['SPY']),[]);
});
