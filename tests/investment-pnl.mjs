import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {investmentPnl,groupPnl,sumPnl,realizedYears,realizedExportRows}=loadTS('lib/investment-pnl.ts');
const {investmentReturns,monthlyResults,moneyWeightedReturn}=loadTS('lib/investment-returns.ts');
const {propertyYields,costLadder,dcaPlan,expectedPayouts,isBitcoin,priceAlertReached,newlyReached}=loadTS('lib/investment-insights.ts');

const today='2026-11-14';
const market={rates:{USD:1,EUR:.8,UZS:12000},quotes:{},errors:{},fx:null,stocksConfigured:false};
const record=(id,kind,amount,extra={})=>({id,name:id,kind,amount,currency:'USD',quantity:1,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:'',...extra});
const event=(id,record_id,event_type,amount,occurred_on,balance=null,extra={})=>({id,record_id,event_type,amount,occurred_on,created_at:occurred_on+'T10:00:00Z',balance,ownership_percentage:100,principal:0,interest:0,notes:'',...extra});
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-6,`${message??''} ${actual} ≠ ${expected}`);
const run=(records,events,extra={})=>investmentPnl({records,events,market,currency:'USD',today,...extra});

test('a purchase, a part sale and the value today split into realized and unrealized by average cost',()=>{
 const pnl=run([record('flat','Valuables',900)],[
  event('buy','flat','contribution',1000,'2026-01-10',1000),
  event('value','flat','valuation',0,'2026-06-01',1500),
  // Half of the 1,500 is sold: half of the 1,000 cost goes with it.
  event('sell','flat','withdrawal',750,'2026-06-02',750),
 ]);
 const [holding]=pnl.holdings;
 near(holding.realized,250);near(holding.unrealized,400);near(holding.total,650);near(holding.invested,1000);near(holding.returnPercent,65);
 assert.deepEqual(pnl.sales.map(sale=>[sale.date,sale.proceeds,sale.cost,sale.gain]),[['2026-06-02',750,500,250]]);
 assert.equal(holding.currencyEffect,0);assert.equal(pnl.missing,0);
});

test('linked transactions count: rent as income, repairs and fees as costs, and never a Tracker copy twice',()=>{
 const row=(id,kind,amount,extra={})=>({...record(id,kind,amount),date:'2026-05-05',...extra});
 const pnl=run([record('home','Property',100000),record('shop','Business',5000)],[event('open','home','baseline',0,'2026-01-01',100000),event('rent-event','home','income',700,'2026-04-01'),event('shop-open','shop','baseline',0,'2026-01-01',5000)],{cashflows:[
  row('rent','Rent income',900,{income_source_id:'home'}),
  row('repair','Other expense',300,{property_id:'home'}),
  row('fee','Other expense',50,{property_id:'home',business_id:'shop'}),
  row('copy','Rent income',700,{income_source_id:'home',history_event_id:'rent-event'}),
  row('mortgage','Other expense',400,{property_id:'home',mortgage_payment_id:'m1'}),
  row('schedule','Rent income',900,{income_source_id:'home',frequency:'Monthly'}),
  row('future','Rent income',900,{income_source_id:'home',date:'2027-01-01'}),
  row('sales','Business income',1200,{business_id:'shop'}),
  row('salary','Salary',9000),
 ]});
 const home=pnl.holdings.find(item=>item.id==='home'),shop=pnl.holdings.find(item=>item.id==='shop');
 near(home.income,1600);near(home.costs,350);near(home.linked,550);near(home.total,1250);
 near(shop.income,1200);near(shop.linked,1200);
 assert.deepEqual(pnl.flows.filter(flow=>flow.linked).map(flow=>flow.id).sort(),['fee','rent','repair','sales']);
});

test('the exchange rate is its own line: prices at today\'s rate plus the currency effect is the total',()=>{
 // 10,000,000 UZS bought at 10,000 per dollar (1,000 USD), worth 12,000,000 UZS at 12,000 today (1,000 USD).
 const rate=(from,to,date)=>from==='UZS'&&to==='USD'?1/(date<'2026-06-01'?10000:12000):null;
 const pnl=run([record('gold','Valuables',12000000,{currency:'UZS'})],[event('buy','gold','contribution',10000000,'2026-01-10',10000000)],{rate});
 const [holding]=pnl.holdings;
 near(holding.unrealized,2000000/12000);near(holding.total,0);near(holding.currencyEffect,-2000000/12000);
 near(holding.realized+holding.unrealized+holding.income-holding.costs+holding.currencyEffect,holding.total);
 // Without dated rates everything converts at today's, so there is no currency line to show.
 near(run([record('gold','Valuables',12000000,{currency:'UZS'})],[event('buy','gold','contribution',10000000,'2026-01-10',10000000)]).holdings[0].currencyEffect,0);
});

test('a stock entered with its purchase price shows the gain its card shows, and an untracked holding shows none',()=>{
 const pnl=run([record('AAPL','Stock',150,{quantity:10,cost:100}),record('ring','Valuables',400)],[event('seen','AAPL','baseline',0,'2026-03-01',1400)]);
 near(pnl.holdings.find(item=>item.id==='AAPL').unrealized,500);
 near(pnl.holdings.find(item=>item.id==='ring').total,0);
 near(pnl.totals.total,500);near(pnl.totals.value,1900);
});

test('a holding or a payment no rate converts is left out and counted, never added under another currency',()=>{
 const pnl=run([record('lira','Valuables',500,{currency:'TRY'}),record('home','Property',1000)],[event('open','home','baseline',0,'2026-01-01',1000)],{cashflows:[{...record('rent','Rent income',100,{currency:'TRY',income_source_id:'home',day_rates:null}),date:'2026-05-05'}]});
 assert.equal(pnl.missing,2);assert.deepEqual(pnl.holdings.map(item=>item.id),['home']);near(pnl.totals.income,0);
});

test('a security moved between two of the owner\'s holdings keeps its cost and realizes nothing',()=>{
 const notes='Security transfer. Broker A to B';
 const pnl=run([record('a','Stock',0,{name:'VOO',quantity:0}),record('b','Stock',300,{name:'VOO',quantity:1})],[
  event('buy','a','contribution',200,'2026-01-10',200),
  event('in','b','contribution',300,'2026-05-01',300,{notes}),event('out','a','withdrawal',300,'2026-05-01',0,{notes}),
 ]);
 assert.equal(pnl.sales.length,0);near(pnl.totals.realized,0);near(pnl.totals.unrealized,100);near(pnl.totals.invested,200);
});

test('classes and accounts add up to the portfolio, and a year\'s sales export as plain rows',()=>{
 const pnl=run([record('a','Stock',120,{holding_account_id:'broker'}),record('b','Stock',80,{holding_account_id:'broker'}),record('c','Crypto',50)],[
  event('a1','a','contribution',100,'2026-01-10',100),event('b1','b','contribution',100,'2025-01-10',100),event('b2','b','withdrawal',22,'2025-03-01',110),event('c1','c','contribution',50,'2026-02-01',50),
 ]);
 const kinds=groupPnl(pnl.holdings,holding=>holding.kind),accounts=groupPnl(pnl.holdings,holding=>holding.accountId??'');
 assert.deepEqual(kinds.map(group=>[group.key,group.count]),[['Stock',2],['Crypto',1]]);
 assert.deepEqual(accounts.map(group=>group.key),['broker','']);
 near(kinds.reduce((sum,group)=>sum+group.total,0),pnl.totals.total);near(sumPnl(pnl.holdings).value,250);near(pnl.totals.realized,22-100/6);
 assert.deepEqual(realizedYears(pnl.sales),['2025']);
 assert.deepEqual(realizedExportRows(pnl.sales,'2025'),[{date:'2025-03-01',name:'b',kind:'Stock',currency:'USD',proceeds:22,cost:16.67,gain:5.33}]);
 assert.deepEqual(realizedExportRows(pnl.sales,'2026'),[]);
});

test('returns: the days add up to the total, money added is not a gain, and a fall is measured from the peak',()=>{
 const pnl=run([record('fund','Retirement account',1800)],[
  event('buy','fund','contribution',1000,'2026-01-10',1000),
  event('up','fund','valuation',0,'2026-03-10',1200),
  event('more','fund','contribution',1000,'2026-03-11',2200),
  event('down','fund','valuation',0,'2026-06-10',1650),
  event('pay','fund','income',50,'2026-06-10'),
 ]);
 const returns=investmentReturns(pnl,today,()=>1);
 near(returns.days.reduce((sum,day)=>sum+day.pnl,0),pnl.totals.total);near(pnl.totals.total,-150);
 // +20%, then −25% + 50 paid on 2,200 (−22.73%), then +150 on 1,650 today.
 near(returns.timeWeighted,(1.2*(1700/2200)*(1800/1650)-1)*100);
 near(returns.maxDrawdown,(1700/2200-1)*100);
 assert.ok(returns.moneyWeighted<0&&returns.moneyWeighted>-20);
 const months=monthlyResults(returns.days,today);
 assert.equal(months.length,12);assert.equal(months.at(-1).month,'2026-11');
 near(months.find(item=>item.month==='2026-03').pnl,200);near(months.find(item=>item.month==='2026-06').pnl,-500);near(months.find(item=>item.month==='2026-08').pnl,0);
 assert.deepEqual(investmentReturns({flows:[],marks:[],totals:pnl.totals},today,()=>1),{days:[],timeWeighted:null,moneyWeighted:null,maxDrawdown:null});
});

test('the money-weighted return is the yearly rate that balances the dated amounts',()=>{
 near(moneyWeightedReturn([{date:'2025-11-14',amount:-1000},{date:'2026-11-14',amount:1100}]),10);
 assert.equal(moneyWeightedReturn([{date:'2026-11-01',amount:-1000},{date:'2026-11-14',amount:1100}]),null);
 assert.equal(moneyWeightedReturn([{date:'2025-11-14',amount:-1000},{date:'2026-11-14',amount:-5}]),null);
 assert.equal(moneyWeightedReturn([{date:'2025-11-14',amount:-1000}]),null);
});

test('a property\'s gross yield and cap rate read the last twelve months against its value',()=>{
 const pnl=run([record('home','Property',120000)],[event('open','home','baseline',0,'2024-01-01',120000),event('old','home','income',9999,'2025-11-01'),event('r1','home','income',6000,'2026-02-01'),event('r2','home','income',6000,'2026-08-01'),event('fix','home','expense',2400,'2026-09-01')]);
 const [home]=propertyYields(pnl.holdings,pnl.flows,today);
 near(home.rent,12000);near(home.costs,2400);near(home.grossYield,10);near(home.capRate,8);
 assert.equal(propertyYields([{...pnl.holdings[0],value:0}],pnl.flows,today)[0].capRate,null);
});

test('the cost ladder lists each purchase and prices earlier units so the average holds',()=>{
 const btc=record('btc','Crypto',60000,{name:'BTC',quantity:1.5,cost:40000});
 assert.ok(isBitcoin(btc));assert.ok(!isBitcoin(record('eth','Crypto',1,{name:'ETH'})));
 const move=(id,kind,extra)=>({id,kind,source_id:'cash',target_id:'btc',sent:0,received:0,source_value:0,target_value:0,fee:0,occurred_on:'2026-03-01',notes:'',...extra});
 const ladder=costLadder(btc,[move('m1','buy',{received:.5,target_value:25100,fee:100}),move('other','buy',{target_id:'eth',received:1,target_value:1})]);
 assert.deepEqual(ladder.lots.map(lot=>[lot.id,lot.units,lot.price]),[['earlier',1,35000],['m1',.5,50000]]);
 near(ladder.lots.reduce((sum,lot)=>sum+lot.cost,0)/ladder.units,40000);assert.equal(ladder.low,35000);assert.equal(ladder.high,50000);
 // After a sale the lots cannot be told apart: one step at the saved average.
 assert.deepEqual(costLadder(btc,[move('m1','buy',{received:.5,target_value:25000}),move('s','sell',{source_id:'btc',target_id:'cash',sent:.2})]).lots.map(lot=>[lot.units,lot.price]),[[1.5,40000]]);
 assert.equal(costLadder({...btc,quantity:0}),null);assert.equal(costLadder({...btc,cost:0}),null);
});

test('a DCA plan adds equal buys to what is held and reports the new average',()=>{
 const plan=dcaPlan({units:1,average:40000},{amount:1000,buys:2,price:50000,change:0});
 near(plan.units,1.04);near(plan.invested,42000);near(plan.average,42000/1.04);near(plan.value,52000);
 near(dcaPlan({units:0,average:0},{amount:100,buys:2,price:100,change:100}).units,1.5);
 for(const bad of [{amount:0},{buys:0},{buys:1.5},{price:0},{change:-100},{buys:601}])assert.equal(dcaPlan({units:1,average:1},{amount:1,buys:1,price:1,change:0,...bad}),null);
});

test('expected payouts repeat a holding\'s latest amount at its own rhythm, and stop when it stopped paying',()=>{
 const records=[record('KO','Stock',100),record('bond','Bond',1000),record('gone','Stock',1),record('once','Stock',1),record('bank','Deposit',1)];
 const events=[
  event('k1','KO','income',10,'2026-02-15'),event('k2','KO','income',10,'2026-05-15'),event('k3','KO','income',12,'2026-08-15'),
  event('b1','bond','income',40,'2025-12-01'),event('b2','bond','income',40,'2026-06-01'),
  event('g1','gone','income',5,'2025-01-10'),event('g2','gone','income',5,'2025-04-10'),
  event('o1','once','income',5,'2026-10-01'),event('d1','bank','income',5,'2026-09-01'),event('d2','bank','income',5,'2026-10-01'),
 ];
 // KO's November payment is late, not cancelled: the rhythm continues from the last one that was paid.
 assert.deepEqual(expectedPayouts(records,events,today,'2027-06-30').map(item=>[item.recordId,item.date,item.amount]),[['KO','2026-11-15',12],['bond','2026-12-01',40],['KO','2027-02-15',12],['KO','2027-05-15',12],['bond','2027-06-01',40]]);
 assert.deepEqual(expectedPayouts(records,events,today,today),[]);
});

test('a price alert is reached at its price or beyond, and announced once',()=>{
 assert.ok(priceAlertReached({direction:'above',price:100},100));assert.ok(!priceAlertReached({direction:'above',price:100},99.99));
 assert.ok(priceAlertReached({direction:'below',price:100},90));assert.ok(!priceAlertReached({direction:'below',price:100},null));
 const alerts=[{id:'1',record_id:'a',direction:'above',price:100},{id:'2',record_id:'a',direction:'above',price:100,reached_on:'2026-11-01'},{id:'3',record_id:'b',direction:'below',price:5}];
 assert.deepEqual(newlyReached(alerts,id=>id==='a'?120:9).map(alert=>alert.id),['1']);
});
