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

test('each day names what moved net worth since the chart’s day before it, by kind, with debts together',()=>{
 // The user's October dip: cash spent on 10 October while a business was paid into, then debt repaid on the 18th.
 const points=['2026-10-09','2026-10-10','2026-10-11','2026-10-18'].map(date=>({date,actual:100,contributed:100}));
 const history=[
  {date:'2026-10-09',net:318359,parts:{Cash:6918,Business:94800,Debt:-91469}},
  {date:'2026-10-10',net:314954,parts:{Cash:513,Business:97800,Debt:-91469}},
  {date:'2026-10-18',net:316202,parts:{Cash:513,Business:97800,Debt:-90221,'Money lent':-0.2}},
 ];
 const moves=netWorthComparison(points,history,[]).map(point=>Object.fromEntries(Object.entries(point).filter(([key])=>key.startsWith('move:'))));
 assert.deepEqual(moves,[{},{'move:Cash':-6405,'move:Business':3000},{},{'move:Debt':1248}],'no change under half a unit, and nothing on the first day or a day without a new figure');
 // A day whose figure has no parts (today's live total) names nothing.
 const today=netWorthComparison([{date:'2026-10-09',actual:1,contributed:0},{date:'2026-10-10',actual:1,contributed:0}],[{date:'2026-10-09',net:1,parts:{Cash:1}},{date:'2026-10-10',net:5}],[]);
 assert.ok(!Object.keys(today[1]).some(key=>key.startsWith('move:')));
});

test('the point details list what changed net worth, largest first, signed and toned',async()=>{
 const React=(await import('react')).default;
 const {renderToStaticMarkup}=await import('react-dom/server');
 const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
 const {BenchmarkTooltip}=loadTS('components/benchmark-tooltip.tsx',{'@/components/language-provider':language});
 const point={date:'2026-10-10',actual:314954,contributed:410289,'move:Business':3000,'move:Cash':-6405};
 const html=renderToStaticMarkup(React.createElement(BenchmarkTooltip,{active:true,payload:[{payload:point}],receipts:[],fundingDetails:[],currency:'USD',series:[{key:'actual',label:'Net worth',color:'red'}]}));
 assert.match(html,/What changed your net worth/);
 assert.ok(html.indexOf('Cash')<html.indexOf('Business'),'the larger change comes first');
 assert.match(html,/class="negative">−\$6,405</);
 assert.match(html,/class="positive">\+\$3,000</);
 const quiet=renderToStaticMarkup(React.createElement(BenchmarkTooltip,{active:true,payload:[{payload:{date:'2026-10-11',actual:1,contributed:0}}],receipts:[],fundingDetails:[],currency:'USD',series:[]}));
 assert.doesNotMatch(quiet,/What changed your net worth/);
});
