import { apiFunction } from './helpers/api-function.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('app/api/portfolio-history/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
import {loadTS} from './helpers/load-ts.mjs';
const {trackedKinds,historyCashflowColumns}=await import('../lib/investment-history.ts');
const {accountRepaymentEvents}=loadTS('lib/investment-benchmarks.ts');
const {historyIncomeRecords}=loadTS('lib/portfolio-history.ts');
const api=(session,supa)=>apiFunction('session','supa','historyCashflowColumns','trackedKinds','accountRepaymentEvents',source+';return GET;')(session,supa,historyCashflowColumns,trackedKinds,accountRepaymentEvents);
test('history and actual cash flows remain owner-scoped and cash-flow pagination is complete',async()=>{
 const calls=[];
 const GET=api(async()=>({token:'owner-token'}),async(path,init,token)=>{
  calls.push({path,token});
  if(path.includes('frequency=eq.Once'))return Response.json(path.includes('offset=0')?Array.from({length:500},(_,i)=>({id:String(i)})):[{id:'last'}]);
  if(path.includes('investment_history'))return Response.json([{record_id:'holding',balance:100}]);
  return Response.json([{id:'holding',kind:'Cash',currency:'USD'}]);
 });
 const response=await GET();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const result=await response.json();assert.equal(result.cashflows.length,501);assert.equal(result.events.length,1);assert.ok(calls.every(call=>call.token==='owner-token'));
 assert.ok(calls.some(call=>call.path.includes('kind=in.(')&&call.path.includes('Valuables')&&call.path.includes('Money%20lent')));
 assert.ok(calls.find(call=>call.path.includes('investment_history')).path.includes('record_id=in.(holding)'));
});
test('anonymous reads and failed cashflow reads do not return a partial comparison',async()=>{
 assert.equal((await api(async()=>null,async()=>{throw Error('must not run');})()).status,401);
 const GET=api(async()=>({token:'owner-token'}),async path=>path.includes('frequency=eq.Once')?new Response(null,{status:503}):Response.json([]));
 const response=await GET();assert.equal(response.status,503);assert.ok((await response.json()).error);
});
test('income history includes recurring plans and preserves the Tracker receipt link',async()=>{
 const GET=api(async()=>({token:'owner'}),async path=>{
  if(path.includes('frequency=eq.Once')){assert.ok(path.includes('select='+historyCashflowColumns+'&'));return Response.json([{id:'receipt',kind:'Other income',frequency:'Once',history_event_id:'dividend'},{id:'rent',kind:'Rent expense',frequency:'Once'}]);}
  if(path.includes('frequency=neq.Once')){assert.ok(path.includes('select='+historyCashflowColumns+'&'));return Response.json([{id:'salary',kind:'Salary',frequency:'Monthly',end_date:null}]);}
  return Response.json([]);
 });
 const result=await(await GET()).json();
 // Receipts travel once, among the cash flows; the browser joins them to the schedules.
 assert.equal(result.incomeRecords,undefined);assert.deepEqual(result.recurringIncome.map(row=>row.id),['salary']);
 const income=historyIncomeRecords(result);assert.equal(income.length,2);assert.equal(income[0].history_event_id,'dividend');assert.equal(income[1].frequency,'Monthly');
 assert.deepEqual(historyIncomeRecords({cashflows:result.cashflows,incomeRecords:[{id:'sample'}]}).map(row=>row.id),['sample'],'the sample workspace keeps its own');
});
test('repayments saved from Accounts reach the chart as dated repayments, read with the owner\'s token',async()=>{
 const calls=[];
 const GET=api(async()=>({token:'owner'}),async(path,init,token)=>{
  calls.push({path,token});
  if(path.includes('account_activity'))return Response.json([
   {id:'r1',action:'repayment',account_id:'wallet',target_id:'loan',amount:400.25,occurred_on:'2026-09-10',notes:'September',created_at:'2026-09-10T08:00:00Z'},
   {id:'r2',action:'repayment',account_id:'wallet',target_id:'lent',amount:150,occurred_on:'2026-09-12',notes:'',created_at:'2026-09-12T08:00:00Z'},
   {id:'r3',action:'repayment',account_id:'wallet',target_id:'someone-else',amount:99,occurred_on:'2026-09-12',notes:''},
  ]);
  if(path.includes('investment_history'))return Response.json([{id:'v',record_id:'loan',event_type:'valuation',balance:599.75,occurred_on:'2026-09-10'}]);
  if(path.includes('finance_records?kind=in.(Cash'))return Response.json([{id:'wallet',kind:'Cash',currency:'USD'},{id:'loan',kind:'Loan',currency:'USD'},{id:'lent',kind:'Money lent',currency:'USD'}]);
  return Response.json([]);
 });
 const result=await(await GET()).json();
 const call=calls.find(item=>item.path.includes('account_activity'));
 assert.ok(call.path.includes('action=eq.repayment'));assert.equal(call.token,'owner');
 const repaid=result.events.filter(event=>event.id.startsWith('repayment:'));
 assert.deepEqual(repaid.map(event=>[event.record_id,event.event_type,event.amount,event.balance,event.occurred_on,event.account_link.amount]),[['loan','withdrawal',400.25,null,'2026-09-10',-400.25],['lent','withdrawal',150,null,'2026-09-12',150]]);
 // The balance written with the repayment stays the only valuation.
 assert.equal(result.events.filter(event=>event.balance!==null).length,1);
});

test('the history columns cover every field the Overview charts read from a transaction or income schedule',()=>{
 const columns=new Set(historyCashflowColumns.split(','));
 const read=new Set();
 // Each row records the fields the chart code asks it for.
 const watched=row=>new Proxy(row,{get(target,key){if(typeof key==='string'&&!['toJSON','then'].includes(key))read.add(key);return target[key];},has(target,key){if(typeof key==='string')read.add(key);return key in target;}});
 const today='2026-10-21';
 const rows=[
  {id:'rent',name:'Rent',kind:'Rent expense',amount:500,currency:'USD',date:'2026-09-01',frequency:'Once',account_currency:'UZS',account_exchange_rate:12000,day_rates:{USD:1,UZS:12000}},
  {id:'mortgage',name:'Mortgage',kind:'Living expense',amount:900,currency:'USD',date:'2026-09-05',frequency:'Once',mortgage_payment_id:'missing',payment_principal:700,payment_interest:200},
  {id:'pay',name:'Pay',kind:'Salary',amount:3000,currency:'USD',date:'2026-09-25',frequency:'Once',history_event_id:'none',business_id:'b1'},
  {id:'plan',name:'Plan',kind:'Rent income',amount:800,currency:'USD',date:'2026-01-01',frequency:'Monthly',income_source_id:'p1',end_date:null,recurrence_days:null,source_paused:false,archived:false,archive_pauses:[]},
 ].map(watched);
 const {investmentPeriodTotals}=loadTS('lib/investment-period.ts');
 const {incomeHistory}=loadTS('lib/income-history.ts');
 const {benchmarkExpenseFunding}=loadTS('lib/investment-benchmarks.ts');
 benchmarkExpenseFunding(rows,today);
 investmentPeriodTotals({records:[],events:[],cashflows:rows,movements:[],market:null,currency:'USD',today},'2026-01-01',{invested:[],expenses:[],income:[]});
 incomeHistory([],[],historyIncomeRecords({cashflows:rows.slice(0,3),recurringIncome:rows.slice(3)}),'USD',{USD:1,UZS:12000},today,12);
 assert.ok(read.size>8,'the chart code was exercised');
 assert.deepEqual([...read].filter(key=>!columns.has(key)),[]);
});

test('the Overview reads its history as soon as the owner is known, with the chart code, and retries a failed read',async()=>{
 const slots=[],pending=[];let cursor=0;
 const react={
  useState(initial){const key=cursor++;if(!(key in slots))slots[key]=initial;return [slots[key],value=>{slots[key]=typeof value==='function'?value(slots[key]):value;}];},
  useEffect(effect,deps){const key=cursor++,old=slots[key];if(!old||deps.some((dep,i)=>!Object.is(dep,old.deps[i]))){slots[key]={deps};pending.push(()=>{old?.cleanup?.();slots[key].cleanup=effect();});}},
 };
 let preloads=0,fail=false;const reads=[];
 const {usePortfolioHistory:readHistory}=loadTS('hooks/use-portfolio-history.ts',{react,'@/components/charts-lazy':{preloadCharts:async()=>{preloads++;}},'@/lib/refresh-read':{refreshRead:async(url,{signal})=>{reads.push({url,signal});return fail?new Response(null,{status:503}):Response.json({records:[],events:[],cashflows:[{id:'pay',kind:'Salary'},{id:'rent',kind:'Rent expense'}],recurringIncome:[{id:'plan',kind:'Salary'}]});}}});
 const render=(...args)=>{cursor=0;const result=readHistory(...args);while(pending.length)pending.shift()();return result;};
 const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(render(null,false,0).history,null);assert.equal(reads.length,0,'no owner, no read');assert.equal(preloads,1,'the chart code loads at once');
 render('owner',false,0);assert.deepEqual(reads.map(read=>read.url),['/api/portfolio-history']);await settle();
 assert.deepEqual(render('owner',false,0).history.incomeRecords.map(row=>row.id),['pay','plan']);
 render('owner',false,1);assert.equal(reads.length,2,'a save reads again');assert.ok(reads[0].signal.aborted,'the earlier read is cancelled');
 assert.notEqual(render('owner',false,1).history,null,'and keeps the last history meanwhile');await settle();
 assert.equal(render('someone',false,1).history,null,'another owner never sees the last one\'s history');await settle();
 fail=true;render('someone',false,2);await settle();
 const failed=render('someone',false,2);assert.equal(failed.error,true);assert.equal(failed.history,null);
 fail=false;failed.retry();assert.equal(render('someone',false,2).error,false);await settle();
 assert.equal(render('someone',false,2).history.cashflows.length,2);
 const before=reads.length;render('someone',true,2);assert.equal(reads.length,before,'the sample workspace builds its own');
});
