import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {investmentPeriodTotals}=loadTS('lib/investment-period.ts');
const event=(id,type,amount,date='2026-09-19')=>({id,record_id:'sheep',event_type:type,amount,occurred_on:date,created_at:date,balance:null,ownership_percentage:100});
const input={records:[{id:'sheep',kind:'Business',currency:'USD'},{id:'debt',kind:'Mortgage',currency:'USD'}],events:[event('old','income',900,'2026-08-01'),event('add','contribution',84),event('income','income',150),event('cost','expense',20),event('snapshot','baseline',9000),{...event('mortgage','mortgage_payment',100),record_id:'debt',principal:80}],today:'2026-09-20',currency:'USD',market:{rates:{}}};
test('principal and business contributions are invested; mortgage interest and running costs are expenses',()=>{
 // 84 contributed + 80 principal; 20 running cost + 20 interest. Together they equal the money that left.
 assert.deepEqual(investmentPeriodTotals(input,'2026-09-19'),{income:150,invested:164,expenses:40,missing:[]});
 assert.equal(investmentPeriodTotals(input,'2026-09-20').income,0);
 assert.equal(investmentPeriodTotals(input,'2026-01-01').income,1050);
});
test('missing rates are disclosed and future events excluded',()=>{
 const result=investmentPeriodTotals({...input,currency:'EUR'},'2026-09-19');
 assert.deepEqual(result.missing,['USD']);
 assert.equal(investmentPeriodTotals({...input,events:[event('future','income',99,'2027-01-01')]},'2026-09-19').income,0);
});

test('includes overall actual income and expenses without counting linked tracker rows twice',()=>{
 const row=(id,kind,amount,extra={})=>({id,kind,amount,currency:'USD',date:'2026-09-19',frequency:'Once',...extra});
 const totals=investmentPeriodTotals({...input,cashflows:[row('salary','Salary',1500),row('food','Living expense',50),row('copy','Business income',150,{history_event_id:'income'}),row('mortgage-copy','Other expense',100,{mortgage_payment_id:'mortgage',payment_principal:80,payment_interest:20}),row('plan','Salary',9000,{frequency:'Monthly'})]},'2026-09-19');
 // The mortgage copy contributes its 20 interest once; its 80 principal is already invested.
 assert.deepEqual(totals,{income:1650,invested:164,expenses:90,missing:[]});
});

test('business investments have an invested breakdown that reconciles',()=>{
 const details={income:[],expenses:[],invested:[]};
 const totals=investmentPeriodTotals(input,'2026-09-19',details);
 assert.equal(details.invested.find(row=>row.category==='Business investment').amount,84);
 for(const key of Object.keys(details))assert.equal(details[key].reduce((sum,row)=>sum+row.amount,0),totals[key]);
});

test('mortgage cashflow fallback splits principal and interest exactly once and preserves precision',()=>{
 const details={income:[],expenses:[],invested:[]};
 const totals=investmentPeriodTotals({...input,events:[],cashflows:[{id:'payment',mortgage_payment_id:'payment',kind:'Other expense',amount:100.25,payment_principal:80,payment_interest:20.25,currency:'USD',date:'2026-09-19',frequency:'Once'}]},'2026-09-19',details);
 assert.equal(totals.invested,80);assert.equal(totals.expenses,20.25);assert.equal(totals.invested+totals.expenses,100.25);
 assert.equal(details.invested[0].category,'Mortgage');assert.equal(details.expenses[0].category,'Mortgage interest');
});

test('Including expenses counts the spending it funds as money invested',()=>{
 const details={income:[],expenses:[],invested:[]};
 const totals=investmentPeriodTotals(input,'2026-09-19',details,'expenses');
 // 164 invested plus the 40 of expenses the benchmarks now also invest; expenses paid still shows 40.
 assert.deepEqual(totals,{income:150,invested:204,expenses:40,missing:[]});
 assert.equal(details.invested.reduce((sum,row)=>sum+row.amount,0),204);
 // The spending is listed apart from the purchases, under one heading.
 assert.equal(details.invested.filter(row=>row.category==='Expenses paid').reduce((sum,row)=>sum+row.amount,0),40);
 assert.equal(details.expenses.find(row=>row.category==='Mortgage interest').amount,20);
 // Each expense keeps its own category beside the heading.
 assert.deepEqual(details.invested.filter(row=>row.category==='Expenses paid').map(row=>row.detail).sort(),['Mortgage interest','Other expense']);
 assert.deepEqual(investmentPeriodTotals(input,'2026-09-19',undefined,'investments'),investmentPeriodTotals(input,'2026-09-19'));
});

test('expenses group by spending category, with added categories by their own name',()=>{
 const details={income:[],expenses:[],invested:[]};
 const row=(id,kind,extra={})=>({id,kind,amount:30,currency:'USD',date:'2026-09-19',frequency:'Once',...extra});
 investmentPeriodTotals({...input,cashflows:[row('beans','Other expense',{custom_category_id:'coffee'}),row('rent','Living expense'),row('lost','Other expense',{custom_category_id:'gone'})],categories:[{id:'coffee',name:'Coffee'}]},'2026-09-19',details);
 // A Tracker running cost has no category of its own, so it is Other expense, never its holding's kind
 // (Business); an added category whose name is unknown falls back to its kind too.
 assert.deepEqual(details.expenses.map(item=>item.category).sort(),['Coffee','Living expense','Mortgage interest','Other expense','Other expense']);
 assert.ok(details.expenses.every(item=>item.detail===undefined));
});

test('an expense paid for a holding names that holding',()=>{
 const details={income:[],expenses:[],invested:[]};
 const row=(id,extra)=>({id,kind:'Other expense',amount:25,currency:'USD',date:'2026-09-19',frequency:'Once',...extra});
 const records=[{...input.records[0],name:'Sheep farm'},{id:'flat',kind:'Property',currency:'USD',name:'Lake flat'},input.records[1]];
 investmentPeriodTotals({...input,records,cashflows:[row('feed',{name:'Feed store',business_id:'sheep'}),row('fix',{name:'Plumber',property_id:'flat'}),row('lunch',{name:'Cafe'})]},'2026-09-19',details);
 const named=Object.fromEntries(details.expenses.filter(item=>item.amount===25).map(item=>[item.name,item.investment]));
 assert.deepEqual(named,{'Feed store':'Sheep farm',Plumber:'Lake flat',Cafe:undefined});
 // Each row opens the transaction it was recorded as; a Tracker running cost has none to open.
 assert.deepEqual(details.expenses.map(item=>item.transactionId??null).sort(),['feed','fix','lunch',null,null].sort());
});

test('every detail line names its business and opens what it came from',()=>{
 const details={income:[],expenses:[],invested:[]};
 const row=(id,kind,extra)=>({id,kind,amount:40,currency:'USD',date:'2026-09-19',frequency:'Once',...extra});
 // Household is a business of the workspace but not a holding in the history: its name comes from `holdings`.
 const totals=investmentPeriodTotals({...input,records:[{...input.records[0],name:'Sheep farm'},input.records[1]],holdings:[{id:'home',name:'Household'}],categories:[{id:'ai',name:'AI tools'},{id:'rent',name:'Flat rent'}],
  cashflows:[row('chat','Other expense',{name:'AI subscriptions',business_id:'home',custom_category_id:'ai'}),row('tenant','Other income',{name:'Tenant',business_id:'home',custom_category_id:'rent'}),row('wool','Business income',{name:'Wool sale',business_id:'sheep'})]},'2026-09-19',details);
 const line=(key,name)=>details[key].find(item=>item.name===name);
 assert.deepEqual(line('expenses','AI subscriptions'),{name:'AI subscriptions',date:'2026-09-19',category:'AI tools',investment:'Household',transactionId:'chat',amount:40});
 // Income from transactions shows its own category and business too, and opens its transaction.
 assert.deepEqual(line('income','Tenant'),{name:'Tenant',date:'2026-09-19',category:'Flat rent',investment:'Household',transactionId:'tenant',amount:40});
 assert.equal(line('income','Wool sale').investment,'Sheep farm');
 // Lines entered in a holding's history open that holding: a purchase, its income and a running cost.
 assert.ok(details.invested.filter(item=>item.category==='Business investment').every(item=>item.holdingId==='sheep'&&!item.transactionId));
 assert.ok(details.income.filter(item=>!item.transactionId).every(item=>item.holdingId==='sheep'));
 assert.equal(details.expenses.find(item=>item.category==='Other expense'&&!item.transactionId).holdingId,'sheep');
 assert.equal(details.expenses.find(item=>item.category==='Mortgage interest').holdingId,'debt');
 // Every line opens something, and the totals are unchanged by the labels.
 for(const key of Object.keys(details))assert.ok(details[key].every(item=>item.transactionId||item.holdingId),key);
 assert.equal(totals.income,150+80);
});

test('with businesses in the workspace, a transaction for none of them is the Household\'s',()=>{
 const details={income:[],expenses:[],invested:[]};
 const row=(id,extra)=>({id,kind:'Living expense',amount:10,currency:'USD',date:'2026-09-19',frequency:'Once',name:id,...extra});
 const run=businesses=>{const found={income:[],expenses:[],invested:[]};investmentPeriodTotals({...input,businesses,holdings:[{id:'shop',name:'Shop'}],cashflows:[row('lunch'),row('stock',{business_id:'shop'})]},'2026-09-19',found);return found.expenses.filter(item=>item.amount===10);};
 assert.deepEqual(run(true).map(item=>[item.name,item.investment??null,item.household??false]),[['lunch',null,true],['stock','Shop',false]]);
 // Without businesses there is nothing to tell apart, so no line says Household.
 assert.ok(run(false).every(item=>!item.household));
 assert.equal(details.expenses.length,0);
});

const {investmentDecisionComparison}=loadTS('lib/investment-benchmarks.ts');
const prices={start:'2026-09-01',end:'2026-09-04',fx:[],prices:{BTC:[1,2,3,4].map(n=>({date:'2026-09-0'+n,close:n*100}))},errors:{}};
const dated=(id,record_id,date,event_type,amount,balance,extra={})=>({id,record_id,occurred_on:date,created_at:date+'T12:00:00Z',event_type,amount,balance,ownership_percentage:100,principal:0,interest:0,notes:'',...extra});
const holding=(id,kind,extra={})=>({id,name:id,kind,currency:'USD',amount:0,quantity:1,ownership_percentage:100,rate:0,...extra});
const figures=(scenario,scope)=>{
 const base={...scenario,today:'2026-09-04',currency:'USD',market:{quotes:{},rates:{USD:1}}};
 const chart=investmentDecisionComparison({...base,method:{mode:'purchases',date:'2026-09-01',scope}},prices).result.points.at(-1).contributed;
 return {chart,...investmentPeriodTotals(base,'0000-01-01')};
};
test('summary figures equal the chart funding in both funding scopes',()=>{
 const scenarios={
  'money moved between investments is invested once':{records:[holding('cash','Cash'),holding('deposit','Deposit'),holding('crypto','Crypto')],events:[dated('open','deposit','2026-09-01','contribution',1000,1000,{account_link:{account_id:'cash',amount:-1000}}),dated('empty','crypto','2026-09-01','baseline',0,0),dated('out','deposit','2026-09-02','withdrawal',1000,0),dated('in','crypto','2026-09-02','contribution',1000,1000)],movements:[{id:'move',kind:'buy',source_id:'deposit',target_id:'crypto',sent:1000,received:1,source_value:1000,target_value:1000,fee:0,notes:'',occurred_on:'2026-09-02',created_at:'2026-09-02T12:00:00Z'}],cashflows:[]},
  'mortgage interest is an expense, principal an investment':{records:[holding('cash','Cash'),holding('shop','Business'),holding('home','Mortgage')],events:[dated('buy','shop','2026-09-01','contribution',1000,1000),dated('pay','home','2026-09-02','mortgage_payment',350,4000,{principal:300,interest:50})],cashflows:[{id:'copy',name:'home',kind:'Other expense',frequency:'Once',date:'2026-09-02',amount:350,currency:'USD',mortgage_payment_id:'pay',payment_principal:300,payment_interest:50}]},
  'a purchase fee is an expense, not part of the investment':{records:[holding('cash','Cash'),holding('stock','Stock')],events:[dated('out','cash','2026-09-01','withdrawal',1000,0),dated('in','stock','2026-09-01','contribution',1000,1000)],movements:[{id:'m',kind:'buy',source_id:'cash',target_id:'stock',sent:1000,received:4,source_value:1000,target_value:1000,fee:20,notes:'',occurred_on:'2026-09-01'}],cashflows:[{id:'fee',name:'Transaction fee',kind:'Other expense',frequency:'Once',date:'2026-09-01',amount:20,currency:'USD',movement_id:'m'}]},
  'cash marked for investments is still cash':{records:[holding('broker','Cash',{is_investment:true}),holding('shop','Business')],events:[dated('top','broker','2026-09-01','contribution',5000,5000),dated('buy','shop','2026-09-02','contribution',1000,1000,{account_link:{account_id:'broker',amount:-1000}}),dated('rent','shop','2026-09-03','income',400,null,{account_link:{account_id:'broker',amount:400}})],cashflows:[{id:'rent-copy',name:'shop',kind:'Business income',frequency:'Once',date:'2026-09-03',amount:400,currency:'USD',history_event_id:'rent'}]},
 };
 const expected={'money moved between investments is invested once':[1000,0,0],'mortgage interest is an expense, principal an investment':[1300,50,0],'a purchase fee is an expense, not part of the investment':[980,20,0],'cash marked for investments is still cash':[1000,0,400]};
 for(const [name,scenario] of Object.entries(scenarios)){
  const excluding=figures(scenario,'investments'),including=figures(scenario,'expenses');
  assert.deepEqual([excluding.invested,excluding.expenses,excluding.income],expected[name],name);
  assert.ok(Math.abs(excluding.chart-excluding.invested)<1e-9,name+': excluding expenses');
  assert.ok(Math.abs(including.chart-including.invested-including.expenses)<1e-9,name+': including expenses');
 }
});

// Live QA, 2 October 2026: a new account records two holdings without a purchase and repays two debts the same day,
// with a tracking start chosen on 1 January 2026. The summary and the chart tooltip must report the same money invested.
test('opening holdings without a purchase and same-day principal repayments are invested once in both the summary and the chart',()=>{
 const {comparisonMethod,purchaseComparisonStart}=loadTS('lib/investment-benchmarks.ts');
 const day='2026-10-02';
 const scenario={
  records:[holding('cash','Cash',{amount:5000}),holding('AAPL','Stock',{amount:165}),holding('QA Friend','Money lent',{amount:150}),holding('QA Car loan','Loan',{amount:4650}),holding('QA Flat','Mortgage',{amount:59300})],
  events:[dated('aapl','AAPL',day,'baseline',0,165),dated('lent','QA Friend',day,'baseline',0,150),dated('car','QA Car loan',day,'withdrawal',350,4650),dated('flat','QA Flat',day,'mortgage_payment',900,59300,{principal:700,interest:200})],
  cashflows:[],movements:[],today:day,currency:'USD',market:{quotes:{},rates:{USD:1}},
 };
 const plan=comparisonMethod('2026-01-01',purchaseComparisonStart(scenario,'investments'),day,'investments');
 // Nothing was invested before the first investment day, so comparisons start there from original purchases.
 assert.deepEqual(plan.method,{mode:'purchases',date:day,scope:'investments'});
 assert.equal(plan.chosenEarlier,true);
 const market={start:day,end:day,fx:[],prices:{BTC:[{date:day,close:100}]},errors:{}};
 const chart=investmentDecisionComparison({...scenario,method:plan.method},market);
 const point=chart.result.points.at(-1);
 const details={income:[],expenses:[],invested:[]};
 const totals=investmentPeriodTotals(scenario,'2026-01-01',details);
 // $165 + $150 recorded without a purchase, plus $350 + $700 principal repaid.
 assert.equal(totals.invested,1365);assert.equal(point.contributed,1365);
 assert.equal(point.actual,1365,'neither the opening values nor the repayments appear as a gain');
 assert.equal(totals.expenses,200,'mortgage interest is an expense, not an investment');
 assert.deepEqual(details.invested.map(row=>[row.name,row.amount]).sort(),[['AAPL',165],['QA Car loan',350],['QA Flat',700],['QA Friend',150]]);
 assert.deepEqual(chart.details.map(row=>[row.name,row.principal??row.amount,row.source??'']).sort(),[['AAPL',165,'opening'],['QA Car loan',350,''],['QA Flat',700,''],['QA Friend',150,'opening']]);
 // A dated start on that day keeps the holdings in the starting value and still funds that day's repayments.
 const fromDay=investmentDecisionComparison({...scenario,method:{mode:'date',date:day,scope:'investments'}},market).result.points.at(-1);
 assert.equal(fromDay.contributed,1365);assert.equal(fromDay.actual,1365);
 // A later chosen day is the comparison start; an earlier one is explained rather than shown as the start.
 assert.equal(comparisonMethod(day,day,day,'investments').chosenEarlier,false);
 assert.equal(comparisonMethod(null,day,day,'investments').chosenEarlier,false);
});

// Live QA, 6 October 2026: EUR funding was converted at today's rate in the summary and at the day's rate in the
// chart, so "Money invested" ($375,707) and the tooltip's funding ($375,711) disagreed by a few dollars.
test('foreign-currency funding uses the chart’s dated rate, so the summary equals the chart',()=>{
 const day='2026-09-01',today='2026-09-04';
 const scenario={
  records:[holding('cash','Cash',{currency:'EUR',amount:5000}),holding('QA Owe Klaus','Debt',{currency:'EUR',amount:250})],
  events:[dated('pay','QA Owe Klaus',day,'withdrawal',50,250)],
  cashflows:[],movements:[],today,currency:'USD',market:{quotes:{},rates:{USD:1,EUR:0.95}},
 };
 // On 1 September a dollar bought 0.90 euro; today it buys 0.95.
 const market={start:day,end:today,fx:[{date:day,rates:{EUR:0.9}}],prices:{BTC:[{date:day,close:100},{date:today,close:100}]},errors:{}};
 const chart=investmentDecisionComparison({...scenario,method:{mode:'purchases',date:day,scope:'investments'}},market).result.points.at(-1).contributed;
 const summary=investmentPeriodTotals({...scenario,fx:market.fx},'0000-01-01').invested;
 assert.ok(Math.abs(chart-50/0.9)<1e-9);
 assert.ok(Math.abs(summary-chart)<1e-9,'the summary follows the dated rate');
 // Before the dated rates load, the summary still shows a figure at today's rate.
 assert.ok(Math.abs(investmentPeriodTotals(scenario,'0000-01-01').invested-50/0.95)<1e-9);
});
