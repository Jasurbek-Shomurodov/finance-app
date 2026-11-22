import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {historyCashflowColumns}=await import('../lib/investment-history.ts');
const {historyIncomeRecords}=loadTS('lib/portfolio-history.ts');
let closes=async()=>[];
let rates=async()=>[];
// The route with its real import graph; only the session, the database, the price feed and the kept rates are stand-ins.
const api=(session,supa)=>loadTS('app/api/portfolio-history/route.ts',{
 '@/lib/supabase':{session:async()=>{const auth=await session();return auth&&{user:{id:'me'},...auth};},supa},
 '@/lib/holding-price-reader':{keptSeries:(...args)=>closes(...args)},
 '@/lib/history-fx':{...loadTS('lib/history-fx.ts'),keptHistoryRates:(...args)=>rates(...args)},
 '@/lib/deposit-interest':{...loadTS('lib/deposit-interest.ts'),depositToday:()=>'2026-09-30'},
}).GET;
test('history and actual cash flows remain owner-scoped and cash-flow pagination is complete',async()=>{
 const calls=[];
 const GET=api(async()=>({token:'owner-token'}),async(path,init,token)=>{
  calls.push({path,token});
  if(path.includes('frequency=eq.Once'))return Response.json(path.includes('offset=0')?Array.from({length:500},(_,i)=>({id:String(i)})):[{id:'last'}]);
  if(path.includes('investment_history'))return Response.json([{id:'e',record_id:'holding',event_type:'baseline',occurred_on:'2026-01-01',created_at:'2026-01-01T00:00:00Z',balance:100}]);
  if(path.includes('user_preferences'))return Response.json([{currencies:['USD']}]);
  return Response.json([{id:'holding',kind:'Cash',currency:'USD'}]);
 });
 const response=await GET();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const result=await response.json();assert.equal(result.cashflows.length,501);assert.equal(result.events.length,1);assert.ok(calls.length>5&&calls.every(call=>call.token==='owner-token'),'every read carries the signed-in token');
 assert.equal(result.today,'2026-09-30','the read names its day');
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
   {id:'m1',action:'mortgage',account_id:'wallet',target_id:'home',amount:300,occurred_on:'2026-09-03',notes:'',created_at:'2026-09-09T08:00:00Z',before_balance:2000,after_balance:1500},
  ]);
  if(path.includes('investment_history'))return Response.json([{id:'v',record_id:'loan',event_type:'valuation',balance:599.75,occurred_on:'2026-09-10',created_at:'2026-09-10T08:00:00Z'}]);
  if(path.includes('finance_records?kind=in.(Cash'))return Response.json([{id:'wallet',kind:'Cash',currency:'USD'},{id:'loan',kind:'Loan',currency:'USD'},{id:'lent',kind:'Money lent',currency:'USD'}]);
  return Response.json([]);
 });
 const result=await(await GET()).json();
 const call=calls.find(item=>item.path.includes('account_activity'));
 assert.ok(!call.path.includes('action='),'every operation is read: transfers and balance adjustments date an account\'s changes too');assert.ok(call.path.includes('target_id,amount,received')&&call.path.includes('before_balance,after_balance'));assert.equal(call.token,'owner');
 // Mortgage payments and repayments also travel as operations, with the paying account's balance on each side.
 assert.deepEqual(result.operations.map(row=>row.id),['r1','r2','r3','m1']);
 assert.deepEqual(result.operations[3],{id:'m1',action:'mortgage',account_id:'wallet',target_id:'home',occurred_on:'2026-09-03',created_at:'2026-09-09T08:00:00Z',before_balance:2000,after_balance:1500});
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

test('quoted holdings come with their past closes; a feed that fails leaves the history standing',async()=>{
 const asked=[];
 const GET=api(async()=>({token:'owner'}),async path=>{
  if(path.includes('investment_history'))return Response.json([{id:'b',record_id:'btc',event_type:'baseline',occurred_on:'2026-03-01',created_at:'2026-03-01T00:00:00Z',balance:100},{id:'a',record_id:'aapl',event_type:'baseline',occurred_on:'2026-04-01',created_at:'2026-04-01T00:00:00Z',balance:50}]);
  if(path.includes('kind=in.(')&&path.includes('Valuables'))return Response.json([{id:'btc',kind:'Crypto',name:'BTC',currency:'USD'},{id:'aapl',kind:'Stock',name:'AAPL',currency:'USD'}]);
  return Response.json([]);
 });
 closes=async(series,start,end)=>{asked.push([series,start,end]);if(series==='stock:AAPL')throw Error('feed down');return [{date:'2026-03-01',close:60000}];};
 try{
  const result=await(await GET()).json();
  assert.deepEqual(asked.sort(),[['crypto:BTC','2026-03-01','2026-09-30'],['stock:AAPL','2026-04-01','2026-09-30']]);
  assert.deepEqual(result.prices,{'crypto:BTC':[{date:'2026-03-01',close:60000}]});
  assert.equal(result.events.length,2);
 }finally{closes=async()=>[];}
});

test('every table is read with the columns the charts use, and a long table\'s later pages are read together',async()=>{
 const {historyEventColumns,historyMovementColumns}=loadTS('lib/portfolio-history-read.ts');
 const calls=[];let open=0,widest=0;
 const GET=api(async()=>({token:'owner'}),async(path,init,token)=>{
  calls.push({path,token});open++;widest=Math.max(widest,open);
  await new Promise(resolve=>setTimeout(resolve,2));open--;
  if(path.includes('user_preferences'))return Response.json([{currencies:['USD','EUR']}]);
  if(path.includes('asset_movements')){const offset=Number(path.match(/offset=(\d+)/)[1]);return Response.json(offset<1500?Array.from({length:500},(_,i)=>({id:'m'+(offset+i)})):[{id:'last'}]);}
  if(path.includes('investment_history'))return Response.json([]);
  if(path.includes('kind=in.(Cash'))return Response.json([{id:'wallet',kind:'Cash',currency:'USD'}]);
  return Response.json([]);
 });
 const result=await(await GET()).json();
 assert.equal(result.movements.length,1501);assert.deepEqual(result.movements.map(row=>row.id).slice(498,502),['m498','m499','m500','m501'],'pages keep their order');
 const pages=calls.filter(call=>call.path.includes('asset_movements')).map(call=>Number(call.path.match(/offset=(\d+)/)[1]));
 assert.deepEqual(pages,[0,500,1000,1500,2000],'the first page, then the next four at their own offsets');
 assert.ok(widest>=5,'independent reads overlap instead of queueing');
 assert.ok(calls.every(call=>call.token==='owner'));
 const selected=name=>decodeURIComponent(calls.find(call=>call.path.includes(name)).path.match(/select=([^&]*)/)[1]);
 assert.equal(selected('investment_history'),historyEventColumns);assert.equal(selected('asset_movements'),historyMovementColumns);
 for(const name of ['investment_history','asset_movements','account_activity'])assert.ok(!selected(name).includes('*')&&!selected(name).split(',').includes('user_id'),name+' travels without unused columns');
 assert.ok(historyMovementColumns.includes('source_before,source_after,target_before,target_after'),'a movement dates both accounts\' changes');
});

test('a busy cash account sends one balance snapshot a day; dated movements, links and the first balance are kept',()=>{
 const {lastCashValuations}=loadTS('lib/portfolio-history-read.ts');
 const event=(id,record_id,day,time,event_type,balance,extra={})=>({id,record_id,event_type,occurred_on:day,created_at:day+'T'+time+':00Z',amount:0,balance,...extra});
 const events=[
  event('open','wallet','2026-09-01','08:00','valuation',1000),event('a','wallet','2026-09-01','09:00','valuation',900),event('b','wallet','2026-09-01','10:00','valuation',800),
  event('out','wallet','2026-09-02','08:00','withdrawal',700),event('c','wallet','2026-09-02','09:00','valuation',650),event('d','wallet','2026-09-02','09:30','valuation',600),
  event('linked','wallet','2026-09-02','09:40','valuation',600,{account_link:{account_id:'other',amount:1}}),event('note','wallet','2026-09-02','09:50','valuation',null),
  event('s1','stock','2026-09-02','08:00','valuation',50),event('s2','stock','2026-09-02','09:00','valuation',60),
 ];
 const kept=lastCashValuations([{id:'wallet',kind:'Cash'},{id:'stock',kind:'Stock'}],events).map(row=>row.id);
 assert.deepEqual(kept,['open','b','out','d','linked','note','s1','s2'],'the day\'s earlier snapshots go; another kind keeps every row');
 // What the replay reads is unchanged: the last balance of each day.
 const last=rows=>Object.fromEntries(rows.filter(row=>row.record_id==='wallet'&&row.balance!==null).map(row=>[row.occurred_on,row.balance]));
 assert.deepEqual(last(events.filter(row=>kept.includes(row.id))),last(events));
});

test('the history comes with each past day\'s rates, in the currencies it is kept or shown in, and stands without them',async()=>{
 const asked=[];
 const GET=api(async()=>({token:'owner'}),async path=>{
  if(path.includes('user_preferences'))return Response.json([{currencies:['USD','EUR']}]);
  if(path.includes('investment_history'))return Response.json([{id:'e',record_id:'som',event_type:'baseline',occurred_on:'2026-05-10',created_at:'2026-05-10T00:00:00Z',balance:100}]);
  if(path.includes('frequency=eq.Once'))return Response.json([{id:'t',kind:'Other expense',frequency:'Once',currency:'GBP',account_currency:'UZS'}]);
  if(path.includes('kind=in.(Cash'))return Response.json([{id:'som',kind:'Cash',currency:'UZS'},{id:'usd',kind:'Cash',currency:'USD'}]);
  return Response.json([]);
 });
 rates=async(from,to,currencies)=>{asked.push([from,to,currencies]);return [{date:'2026-05-09',rates:{USD:1,UZS:12500}}];};
 try{
  const result=await(await GET()).json();
  assert.deepEqual(asked,[['2026-05-10','2026-09-30',['EUR','GBP','UZS']]],'from the first recorded balance, never the dollar itself');
  assert.deepEqual(result.fx,[{date:'2026-05-09',rates:{USD:1,UZS:12500}}]);
  rates=async()=>{throw Error('no key');};
  const without=await GET();assert.equal(without.status,200);assert.deepEqual((await without.json()).fx,[]);
 }finally{rates=async()=>[];}
});

test('kept rates are read by currency from the day tables, in windows read together, thinned to the days that changed',async()=>{
 const {keptHistoryRates,thinRates,historyCurrencies}=loadTS('lib/history-fx.ts');
 assert.deepEqual(historyCurrencies(['USD','UZS',null,'eur','EUR'],['UZS','x; drop']),['EUR','UZS'],'codes only, once each');
 const paths=[];
 const db={read:async path=>{paths.push(path);const from=path.match(/day=gte\.([\d-]+)/)[1];return from==='2026-09-01'?[{day:'2026-09-01',UZS:12700,EUR:'0.9'},{day:'2026-09-02',UZS:12700,EUR:0.9},{day:'2026-09-03',UZS:12710,EUR:null},{day:'2026-09-04',UZS:0,EUR:0.91}]:[];}};
 const points=await keptHistoryRates('2026-09-08','2026-09-30',['UZS','EUR','USD','bad code'],db);
 assert.equal(paths.length,1);
 assert.ok(paths[0].includes('select=day,UZS:rates->UZS,EUR:rates->EUR&day=gte.2026-09-01&day=lte.2026-09-30&order=day.asc'),'a week of lead, so the first day has a rate in force');
 assert.deepEqual(points,[{date:'2026-09-01',rates:{USD:1,UZS:12700,EUR:0.9}},{date:'2026-09-03',rates:{USD:1,UZS:12710}},{date:'2026-09-04',rates:{USD:1,EUR:0.91}}],'a repeated day is dropped, and a rate that is not positive is no rate');
 paths.length=0;await keptHistoryRates('2023-01-08','2026-09-30',['UZS'],db);
 assert.equal(paths.length,3,'1,369 days are three windows of at most 500');
 assert.deepEqual(await keptHistoryRates('2026-09-08','2026-09-30',['USD'],db),[],'nothing to read for dollars alone');
 assert.deepEqual(await keptHistoryRates('2026-09-08','2026-09-30',['UZS'],null),[],'no server key');
 assert.deepEqual(await keptHistoryRates('2026-09-08','2026-09-30',['UZS'],{read:async()=>{throw Error('down');}}),[],'a failed read leaves the history standing');
 // Older than 400 days: one point a week; the latest 400 days: every day that changed.
 const daily=Array.from({length:800},(_,index)=>({date:new Date(Date.UTC(2024,6,23)+index*86400000).toISOString().slice(0,10),rates:{USD:1,UZS:12000+index}}));
 const thinned=thinRates(daily,'2026-09-30');
 const recent=thinned.filter(point=>point.date>='2025-08-26'),older=thinned.filter(point=>point.date<'2025-08-26');
 assert.equal(recent.length,daily.filter(point=>point.date>='2025-08-26').length);
 assert.ok(older.length>=57&&older.length<=58,'about one a week before that');
 assert.equal(thinned.at(-1).date,daily.at(-1).date);
});
