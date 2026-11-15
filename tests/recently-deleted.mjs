import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';
import {createRenderer,hostModule,stubs,text} from './helpers/component-tree.mjs';

const {deletedItemType,deletedItemsFilter,matchesDeletedSearch,deletedDays,deletedSearchTerm}=loadTS('lib/deleted-items.ts');
const {accountChange,categoryChange}=loadTS('lib/restore-preview.ts');
const entry=(id,kind,amount,extra={})=>({id,name:id,kind,currency:'USD',amount,quantity:1,cost:0,rate:0,date:'2026-11-10',frequency:'Once',notes:'',...extra});
const record=(id,data,deleted_at='2026-11-14T08:00:00Z')=>({id,source:'finance_records',deleted_at,data});

test('each deleted item belongs to one tab, and the database is asked the same question',()=>{
 assert.equal(deletedItemType(record('a',entry('Lunch','Living expense',12))),'transactions');
 assert.equal(deletedItemType(record('b',entry('Gym','Living expense',60,{frequency:'Monthly'}))),'recurring');
 assert.equal(deletedItemType(record('c',entry('Wallet','Cash',100))),'accounts');
 assert.equal(deletedItemType(record('d',entry('Car loan','Loan',900))),'accounts');
 assert.equal(deletedItemType({id:'e',source:'savings_goals',deleted_at:'2026-11-14T08:00:00Z',data:{id:'g',name:'Trip',target:500}}),'goals');
 assert.equal(deletedItemType({id:'f',source:'expense_plans',deleted_at:'2026-11-14T08:00:00Z',data:{id:'p',name:'Food',currency:'USD',amount:10}}),null,'an old spending plan shows under All only');
 const query=type=>new URLSearchParams(deletedItemsFilter(type,'').slice(1));
 assert.equal(query('goals').get('source'),'eq.savings_goals');
 assert.equal(query('recurring').get('data->>frequency'),'neq.Once');
 assert.match(query('accounts').get('data->>kind'),/^not\.in\.\("Salary",/);
 assert.equal(deletedItemsFilter(null,''),'','All with no search adds nothing');
});

test('a search matches the saved name ignoring case, and characters PostgREST reads as syntax are dropped',()=>{
 const lunch=record('a',entry('Lunch at Café','Living expense',12));
 assert.equal(matchesDeletedSearch(lunch,'café'),true);assert.equal(matchesDeletedSearch(lunch,'dinner'),false);assert.equal(matchesDeletedSearch(lunch,'  '),true);
 assert.equal(deletedSearchTerm('a*b,(c)%"d'),'a b c d');
 assert.equal(new URLSearchParams(deletedItemsFilter(null,'50% off*').slice(1)).get('data->>name'),'ilike.*50 off*');
});

test('the bin groups by the app’s own calendar day it was deleted on, newest first, in the order given',()=>{
 const items=[record('a',entry('A','Charity',1),'2026-11-14T20:00:00Z'),record('b',entry('B','Charity',1),'2026-11-14T10:00:00Z'),record('c',entry('C','Charity',1),'2026-11-13T18:59:00Z')];
 // 20:00 UTC is already the 15th in Tashkent (UTC+5); 18:59 UTC on the 13th is still the 13th there.
 assert.deepEqual(deletedDays(items).map(day=>[day.day,day.items.map(item=>item.id)]),[['2026-11-15',['a']],['2026-11-14',['b']],['2026-11-13',['c']]]);
});

test('restoring a transaction moves its cash account as the database does, and an unknown rate previews nothing',()=>{
 const accounts=[entry('acc','Cash',1000,{name:'Checking'})];
 assert.deepEqual(accountChange(accounts,entry('lunch','Living expense',12,{account_id:'acc'})),{id:'acc',name:'Checking',currency:'USD',balance:{before:1000,after:988}});
 assert.deepEqual(accountChange(accounts,entry('pay','Salary',500,{account_id:'acc'})).balance,{before:1000,after:1500});
 assert.equal(accountChange(accounts,entry('eur','Living expense',12,{account_id:'acc',currency:'EUR'})),undefined,'another currency without its saved rate is left out');
 assert.equal(accountChange(accounts,entry('big','Living expense',5000,{account_id:'acc'})),undefined,'a restore the account cannot pay is no preview');
 assert.equal(accountChange(accounts,entry('none','Living expense',12)),undefined);
});

test('restoring this month’s expense previews its category’s spending and what is left of a plain budget only',()=>{
 const category={key:'Living expense',name:'Living expense',custom:false,direction:'expense',type:'flexible',group:'',excluded:false,rollover:false,rolloverStart:null,rolloverBalance:0,rolloverCurrency:null,rolloverNegative:false};
 const read=(over={})=>({data:{records:[entry('old','Living expense',30)],activity:[],investmentLinks:[]},splits:[],month:'2026-11',today:'2026-11-14',currency:'USD',rates:{USD:1},categories:[category],amounts:[{category_key:'Living expense',month:'2026-11',amount:100,currency:'USD',applies_forward:false}],schedules:[],...over});
 const lunch=entry('lunch','Living expense',12);
 assert.deepEqual(categoryChange(lunch,false,'Living',read()),{key:'Living expense',name:'Living',currency:'USD',spent:{before:30,after:42},budget:100,left:{before:70,after:58}});
 assert.deepEqual(categoryChange(lunch,false,'Living',read({categories:[{...category,rollover:true}]})),{key:'Living expense',name:'Living',currency:'USD',spent:{before:30,after:42}},'money rolled over needs months this read does not hold');
 assert.equal(categoryChange(lunch,true,'Living',read()),undefined,'a split transaction is left out');
 assert.equal(categoryChange(entry('oct','Living expense',12,{date:'2026-10-30'}),false,'Living',read()),undefined,'another month is left out');
 assert.equal(categoryChange(entry('pay','Salary',12),false,'Salary',read()),undefined,'income is left out');
 assert.equal(categoryChange(entry('gbp','Living expense',12,{currency:'GBP'}),false,'Living',read()),undefined,'a currency no rate converts is left out');
});

function mountBin(props){
 const r=createRenderer(),ui=stubs(),saves=[];
 const foundation=(...names)=>Object.fromEntries(names.map(name=>['@/components/presentation-foundation/'+name,hostModule()]));
 const {RecentlyDeleted}=r.load('components/recently-deleted.tsx',{...ui.modules,'@/components/display-money':{useDisplayMoney:()=>({entered:(amount,currency)=>amount+' '+currency})},
  ...foundation('confirm-dialog','empty-state','inline-error','page-header','segmented','screen-skeletons','pagination','row-menu','category-icon','delete-button','info-hint','progress-line'),'lucide-react':hostModule(),
  '@/lib/api-client':{requestJson:async(url,options)=>{saves.push({url,...options});return {};}},'@/lib/feedback':{showDeleted(){},showNotice(){},showError(){}}});
 const calls={restored:[],deleted:[]};
 r.mount(React.createElement(RecentlyDeleted,{demo:true,onRestore:item=>calls.restored.push(item.id),onDelete:item=>calls.deleted.push(item.id),onSaved(){},...props}));
 return {r,calls,saves,tabs:()=>r.find(node=>node.type==='PageHeader').props.tabs,names:()=>r.all(node=>node.props?.className==='recovery-info').map(node=>node.props.children[0].props.children)};
}

test('the sample bin narrows by tab, previews the selected item, restores in one press and deletes for good only after a confirmation',async()=>{
 const items=[record('a',entry('Lunch','Living expense',12)),record('b',entry('Gym','Living expense',60,{frequency:'Monthly'})),{id:'g',source:'savings_goals',deleted_at:'2026-11-14T08:00:00Z',data:{id:'g',name:'Trip',target:500,currency:'USD',target_date:null}}];
 const preview=item=>item.id==='a'?{account:{id:'acc',name:'Checking',currency:'USD',balance:{before:100,after:88}}}:null;
 const bin=mountBin({demoItems:items,context:{categoryName:e=>'Cat '+e.kind,accountName:()=>'Checking',preview}});
 assert.deepEqual(bin.names(),['Lunch','Gym','Trip']);
 const tabs=bin.tabs();
 assert.deepEqual(tabs.props.options.map(option=>option.value),[null,'transactions','recurring','goals','accounts']);
 bin.r.fire(tabs,'onChange','recurring');assert.deepEqual(bin.names(),['Gym']);
 bin.r.fire(bin.tabs(),'onChange',null);
 // The first item is selected: its panel shows what restoring it moves, in the account's own currency.
 const panel=text(bin.r.find(node=>node.props?.className==='panel recovery-detail'));
 assert.match(panel,/Restoring changes/);assert.match(panel,/Checking100 USD 88 USD/);
 assert.match(text(bin.r.find(node=>node.props?.className==='recovery-info')),/Transaction · Cat Living expense · 10 November 2026/);
 // Restore asks nothing.
 await bin.r.fireAsync(bin.r.find(node=>node.type?.displayName==='Button'&&text(node)==='Restore'),'onClick');
 assert.deepEqual(bin.calls.restored,['a']);assert.equal(bin.r.find(node=>node.type==='ConfirmDialog').props.open,false);
 // Delete permanently sits in ⋯ and opens a confirmation that deletes.
 const menu=bin.r.all(node=>node.type==='RowMenu')[1];
 assert.equal(menu.props.items[0].deletes,true);
 bin.r.fire({props:menu.props.items[0]},'onSelect');
 const confirm=bin.r.find(node=>node.type==='ConfirmDialog');
 assert.equal(confirm.props.open,true);assert.equal(confirm.props.deletes,true);assert.deepEqual(bin.calls.deleted,[]);
 await bin.r.fireAsync(confirm,'onConfirm');assert.deepEqual(bin.calls.deleted,['b']);
});

test('an empty bin says so in one sentence with a way back; a tab with nothing in it says nothing matches',()=>{
 let browsed=0;
 const bin=mountBin({demoItems:[],onBrowse:()=>browsed++});
 const empty=bin.r.find(node=>node.type==='EmptyState');
 assert.equal(empty.props.description,'Deleted items stay here until you delete them permanently.');
 bin.r.fire(bin.r.find(node=>node.type?.displayName==='Button'&&text(node)==='Go to Transactions'),'onClick');assert.equal(browsed,1);
 bin.r.fire(bin.tabs(),'onChange','goals');
 assert.equal(bin.r.find(node=>node.type==='EmptyState').props.title,'No matching records');
});

function restoreContext({demo=false,loading=false,error='',monthRecords=[entry('old','Living expense',30)]}={}){
 const r=createRenderer(),reads=[];
 const category={id:'cat-pets',name:'Pets',direction:'expense'};
 const workspace={demo,user:{id:'me'},reload:2,currency:'USD',market:{rates:{EUR:0.5}},removedCategories:{kinds:[]},transactionTools:{data:{splits:[]}},
  planning:{data:{records:[entry('acc','Cash',1000,{name:'Checking'}),entry('car','Loan',900,{name:'Car loan'}),...(demo?monthRecords:[])],categories:[category],activity:[],occurrences:[],goals:[],investmentLinks:[]}},
  budget:{state:{categories:[],amounts:[{category_key:'Living expense',month:'2026-11',amount:100,currency:'USD',applies_forward:false}]}}};
 const {useRestorePreview}=r.load('components/deleted-items/use-restore-preview.ts',{
  '@/components/language-provider':{useLanguage:()=>({t:key=>'T:'+key})},'@/components/workspace/workspace-provider':{useWorkspace:()=>workspace},'@/lib/deposit-interest':{depositToday:()=>'2026-11-14'},
  '@/hooks/use-owner-resource':{useOwnerResource:(url,owner,enabled,revision,empty)=>{reads.push({url,owner,enabled,revision,empty});return {loading,error,data:{records:monthRecords.map(row=>({...row,amount:String(row.amount)})),activity:[],investmentLinks:[]}};}}});
 let context;
 const Probe=()=>{context=useRestorePreview();return null;};
 r.mount(React.createElement(Probe));
 return {context,reads};
}

test('the restore preview names categories and cash accounts the way the workspace does',()=>{
 const {context,reads}=restoreContext();
 assert.deepEqual(reads.map(read=>[read.url,read.owner,read.enabled,read.revision]),[['/api/planning?scope=review&month=2026-11',{id:'me'},true,2]],'this month, read as the Budget reads it');
 assert.equal(context.categoryName(entry('vet','Living expense',40,{custom_category_id:'cat-pets'})),'Pets');
 assert.equal(context.categoryName(entry('lunch','Living expense',12)),'T:Living expense','a built-in kind reads in the current language');
 assert.equal(context.accountName('acc'),'Checking');
 assert.equal(context.accountName('car'),null,'only a cash account pays a transaction');
 assert.equal(context.accountName(null),null);
 assert.equal(context.preview({id:'g',source:'savings_goals',deleted_at:'2026-11-14T08:00:00Z',data:{id:'g',name:'Trip',target:500}}),null,'a goal moves no money');
});

test('restoring this month\'s expense previews its account and category from this month\'s read, read numbers as numbers',()=>{
 const {context}=restoreContext();
 const lunch=record('l',entry('lunch','Living expense',12,{account_id:'acc'}));
 assert.deepEqual(context.preview(lunch),{
  account:{id:'acc',name:'Checking',currency:'USD',balance:{before:1000,after:988}},
  category:{key:'Living expense',name:'T:Living expense',currency:'USD',spent:{before:30,after:42},budget:100,left:{before:70,after:58}},
 });
 assert.equal(context.preview({...lunch,splits:[{category_id:'x',amount:12}]}).category,undefined,'a split transaction is left out');
});

test('while this month is still loading or failed to load, the preview shows the account and leaves the category out',()=>{
 const lunch=record('l',entry('lunch','Living expense',12,{account_id:'acc'}));
 for(const state of [{loading:true},{error:'Could not load planning data.'}]){
  const {context}=restoreContext(state);
  assert.deepEqual(context.preview(lunch),{account:{id:'acc',name:'Checking',currency:'USD',balance:{before:1000,after:988}},category:undefined},JSON.stringify(state));
 }
});

test('the sample workspace previews from its own records and asks the server for nothing',()=>{
 const {context,reads}=restoreContext({demo:true,loading:true});
 assert.deepEqual(reads.map(read=>[read.owner,read.enabled]),[[null,false]]);
 const preview=context.preview(record('l',entry('lunch','Living expense',12)));
 assert.equal(preview.account,undefined,'no account named, none moves');
 assert.deepEqual(preview.category.spent,{before:30,after:42});
});
