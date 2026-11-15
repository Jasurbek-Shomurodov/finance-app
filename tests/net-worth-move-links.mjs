import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
const {moveLink,activityLink}=loadTS('lib/net-worth-move-links.ts');
const {BenchmarkTooltip}=loadTS('components/benchmark-tooltip.tsx',{'@/components/language-provider':{useLanguage:()=>({locale:'en',t:(s,values={})=>s.replace(/\{(\w+)\}/g,(match,key)=>values[key]??match)})}});

test('a cash move opens that day\'s transactions; debts and money lent open Loans & debts; holdings open Investments',()=>{
 assert.deepEqual(moveLink('Cash','2026-11-11'),{href:'/transactions?from=2026-11-11&to=2026-11-11',label:'Open in Transactions'});
 for(const kind of ['Debt','Mortgage','Loan','Money lent'])assert.equal(moveLink(kind,'2026-11-11').href,'/loans-debts',kind);
 for(const kind of ['Stock','Crypto','Deposit','Property'])assert.equal(moveLink(kind,'2026-11-11').href,'/assets',kind);
 assert.equal(moveLink('Something else','2026-11-11'),null);
});
test('a principal repayment or expense funding opens its transaction by name and day; a purchase opens Investments',()=>{
 assert.equal(activityLink({name:'Mortgage A&B',date:'2026-11-11',principal:400}).href,'/transactions?q=Mortgage+A%26B&from=2026-11-11&to=2026-11-11');
 assert.equal(activityLink({name:'Rent',date:'2026-11-11',source:'expense'}).href,'/transactions?q=Rent&from=2026-11-11&to=2026-11-11');
 assert.equal(activityLink({name:'NVDA',date:'2026-11-11'}).href,'/assets');
 assert.equal(activityLink({name:'NVDA',date:'2026-11-11',source:'opening'}).href,'/assets');
});
test('the pinned details link every line and name the page; the hover card links nothing',()=>{
 const props={active:true,currency:'USD',series:[],receipts:[],fundingDetails:[{id:'p1',date:'2026-11-11',name:'Mortgage',amount:400,currency:'USD',reused:0,principal:400}],payload:[{payload:{date:'2026-11-11','move:Cash':-2150,'move:Debt':950}}]};
 const linked=renderToStaticMarkup(BenchmarkTooltip({...props,linked:true}));
 for(const text of ['href="/transactions?from=2026-11-11&amp;to=2026-11-11"','href="/loans-debts"','href="/transactions?q=Mortgage&amp;from=2026-11-11&amp;to=2026-11-11"','Open in Transactions','Open Loans &amp; debts','aria-label="Cash · Open in Transactions"'])assert.ok(linked.includes(text),text);
 const hover=renderToStaticMarkup(BenchmarkTooltip(props));
 assert.ok(!hover.includes('href='));assert.ok(hover.includes('−$2,150'));
});
