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
