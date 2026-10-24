import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, hostModule, stubs, text } from './helpers/component-tree.mjs';

// Screens whose reads belong to the signed-in session go through `useSessionResource` (DRY-003): one loader with
// `refreshRead`'s retries and `sharedRead`'s dedupe, and each screen keeps its own loading, error and retry states.
/** A `refreshRead` whose replies the test hands out in order; each is a real Response, as the loader reads it. */
function server(){
 const requests=[],replies=[];
 const refreshRead=(url,{signal})=>new Promise(resolve=>{requests.push({url,signal});const next=replies.shift();if(next)resolve(next());else requests.at(-1).reply=response=>resolve(response);});
 return {requests,refreshRead,answer:(...next)=>replies.push(...next)};
}
const foundation=(...names)=>Object.fromEntries(names.map(name=>['@/components/presentation-foundation/'+name,hostModule()]));
const deleted=(id,amount)=>({id,source:'finance_records',deleted_at:'2026-10-20T10:00:00Z',data:{id,name:'Coffee '+id,kind:'Living expense',currency:'USD',amount,date:'2026-10-19',frequency:'Once'}});

function recentlyDeleted(net){
 const r=createRenderer(),ui=stubs(),saves=[];
 const {RecentlyDeleted}=r.load('components/recently-deleted.tsx',{...ui.modules,'@/lib/refresh-read':{refreshRead:net.refreshRead},
  '@/components/display-money':{useDisplayMoney:()=>({entered:(amount,currency)=>amount+' '+currency})},
  ...foundation('confirm-dialog','empty-state','inline-error','page-header','category-badge','screen-skeletons','pagination'),'lucide-react':hostModule(),
  '@/lib/api-client':{requestJson:async(url,options)=>{saves.push({url,...options});return {};}},'@/lib/feedback':{showDeleted(){},showNotice(){}}});
 let saved=0;
 r.mount(React.createElement(RecentlyDeleted,{demo:false,demoItems:[],onRestore(){},onDelete(){},onSaved(){saved++;}}));
 const names=()=>r.all(node=>node.props?.className==='recovery-info').map(node=>text(node).slice(0,9));
 const pagination=()=>r.find(node=>node.type==='Pagination');
 return {r,saves,names,saved:()=>saved,pagination,page:()=>pagination().props};
}
test('Recently deleted reads its page through the session loader: a load failure shows Retry and no empty state, and an emptied page falls back',async()=>{
 const net=server();
 net.answer(()=>Response.json({error:'Offline'},{status:503}));
 const s=recentlyDeleted(net);
 assert.equal(net.requests[0].url,'/api/deleted-items?page=1');
 assert.ok(s.r.all(node=>node.type==='RecoveryRowsSkeleton').length,'the skeleton shows while the page loads');
 await s.r.flush();
 const failed=s.r.find(node=>node.type==='InlineError');assert.equal(failed.props.message,'Offline');
 assert.equal(s.r.all(node=>node.type==='EmptyState').length,0,'no empty state over an error');
 // Retry reads the same page again.
 net.answer(()=>Response.json({items:[deleted('d1',12),deleted('d2',3)],hasMore:true}));
 s.r.fire(failed,'onRetry');await s.r.flush();
 assert.equal(net.requests.length,2);assert.deepEqual(s.names(),['Coffee d1','Coffee d2']);assert.equal(s.page().hasNext,true);
 // Page 2 answers empty (its items were restored elsewhere): the list falls back to page 1 without showing an empty page.
 net.answer(()=>Response.json({items:[],hasMore:false}),()=>Response.json({items:[deleted('d1',12)],hasMore:false}));
 s.r.fire(s.pagination(),'onPage',2);
 assert.equal(net.requests[2].url,'/api/deleted-items?page=2');
 await s.r.flush();
 assert.equal(net.requests[3].url,'/api/deleted-items?page=1');assert.deepEqual(s.names(),['Coffee d1']);assert.equal(s.page().page,1);
 assert.equal(s.r.all(node=>node.type==='EmptyState').length,0);
 // A restore reads the page again and reports the save.
 s.r.fire(s.r.find(node=>node.type?.displayName==='Button'&&text(node).includes('Restore')),'onClick');
 net.answer(()=>Response.json({items:[],hasMore:false}));
 await s.r.fireAsync(s.r.find(node=>node.type==='ConfirmDialog'),'onConfirm');
 assert.deepEqual(s.saves,[{url:'/api/deleted-items',method:'POST',body:{id:'d1'}}]);assert.equal(s.saved(),1);
 assert.equal(net.requests.length,5);assert.equal(s.r.all(node=>node.type==='EmptyState').length,1,'the last item restored leaves the empty state');
 // Leaving the screen cancels a read still under way.
 s.r.fire(s.pagination(),'onPage',1);
 s.r.unmount();assert.equal(net.requests.every(request=>request.signal.aborted),true);
});

function comparisonSettings(net,demo){
 const r=createRenderer(),ui=stubs(),saves=[];
 const {InvestmentComparisonSettings}=r.load('components/investment-comparison-settings.tsx',{...ui.modules,'@/lib/refresh-read':{refreshRead:net.refreshRead},
  'lucide-react':hostModule(),'@/components/diversified-portfolio-settings':hostModule(),'@/components/instrument-picker':hostModule(),'@/components/presentation-foundation/color-choices':hostModule(),'@/components/ui/popover':hostModule(),
  ...foundation('loading-placeholder','inline-error'),'@/lib/feedback':{showSaved(){}},'@/lib/api-client':{requestJson:async(url,options)=>{saves.push({url,...options});return {};}}});
 r.mount(React.createElement(InvestmentComparisonSettings,{demo,currencies:['USD','EUR']}));
 const checked=()=>r.all(node=>node.type==='input'&&node.props.type==='checkbox'&&node.props.checked).length;
 return {r,saves,checked,stocks:()=>r.all(node=>node.props?.className==='benchmark-stock-row').map(row=>text(r.find(node=>node.type==='strong',row.children)))};
}
test('Investment benchmarks loads the saved profile through the session loader, offers Retry on a failure, and the sample workspace never reads',async()=>{
 const net=server();
 net.answer(()=>Response.json({error:'Offline'},{status:503}));
 const s=comparisonSettings(net,false);
 assert.equal(net.requests[0].url,'/api/comparison-profile');assert.ok(s.r.all(node=>node.type==='LoadingPlaceholder').length,'loading until the profile answers');
 await s.r.flush();
 const failed=s.r.find(node=>node.type==='InlineError');assert.equal(failed.props.message,'Offline');assert.equal(s.r.all(node=>node.type==='form').length,0);
 // The saved CUSTOM benchmark reads as its stock, and the draft starts from the saved choices.
 net.answer(()=>Response.json({activity:{started_at:'2026-01-01',source:'first_visit'},preferences:{benchmarks:['BTC','CUSTOM','depositUSD'],custom_symbol:'AAPL',colors:{BTC:'#123456'}},baseline:null,tracking_start:null}));
 s.r.fire(failed,'onRetry');await s.r.flush();
 assert.equal(net.requests.length,2);assert.equal(s.r.all(node=>node.type==='form').length,1);
 assert.equal(s.checked(),2,'BTC and the USD deposit');assert.deepEqual(s.stocks(),['AAPL']);
 // Saving sends the draft; it is never read again by itself.
 await s.r.fireAsync(s.r.find(node=>node.type==='form'),'onSubmit',{preventDefault(){}});
 assert.equal(saves(s).length,1);assert.deepEqual(saves(s)[0].body.benchmarks,['BTC','STOCK:AAPL','depositUSD']);assert.equal(net.requests.length,2);
 const sample=comparisonSettings(server(),true);
 assert.equal(sample.r.all(node=>node.type==='form').length,1);assert.equal(sample.checked(),3,'the default benchmarks, with no read');
 function saves(settings){return settings.saves;}
});
