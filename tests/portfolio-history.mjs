import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const history = loadTS('lib/portfolio-history.ts');
const { portfolioWindow, trackingWindowStart } = history;
// The replay as these tests ask for it: the view's fields in a fixed order.
const portfolioHistory = (records, events, currency, rates, today, includePartial = false, moves = [], prices = new Map(), fx = []) => history.portfolioHistory(records, events, { currency, rates, today, includePartial, moves, prices, fx });
const record = (id, kind, currency = 'USD') => ({ id, kind, currency });
const event = (record_id, date, balance, ownership_percentage = 100) => ({ id: record_id + date, record_id, occurred_on: date, balance, ownership_percentage, created_at: date });
test('waits for full coverage, applies ownership and FX, and carries debt forward', () => {
 const result = portfolioHistory([record('a','Business'),record('b','Loan','UZS')], [event('a','2026-01-01',1000,50),event('b','2026-01-02',1200000),event('a','2026-01-03',1400,50)], 'USD', { UZS:12000 }, '2026-09-17');
 // Each day also keeps net worth by kind: debts together, negative, so the parts add up to net worth.
 assert.deepEqual(result.points, [{date:'2026-01-02',assets:500,debt:100,net:400,parts:{Business:500,Debt:-100}},{date:'2026-01-03',assets:700,debt:100,net:600,parts:{Business:700,Debt:-100}}]);
 assert.equal(result.missing,0);
});
test('does not invent missing history or use future, removed, or cash-only events', () => {
 const result = portfolioHistory([record('a','Cash'),record('b','Stock')], [event('a','2026-01-01',100),event('b','2027-01-01',200),event('b','2026-01-02',null),event('deleted','2026-01-01',999)], 'USD', undefined, '2026-09-17');
 assert.deepEqual(result.points,[]);assert.equal(result.missing,1);
});
test('reports unavailable currencies and keeps actual zero balances', () => {
 const result = portfolioHistory([record('a','Cash'),record('b','Cash','EUR')],[event('a','2026-01-01',0)],'USD',undefined,'2026-09-17');
 assert.equal(result.excluded,1);assert.equal(result.points[0].net,0);
});
test('period starts with last known balance, without inventing pre-history', () => {
 const points = [{date:'2026-01-01',net:100},{date:'2026-09-01',net:200},{date:'2026-09-17',net:250}];
 assert.deepEqual(portfolioWindow(points,30,'2026-09-17'),[{date:'2026-08-18',net:100},...points.slice(1)]);
 assert.deepEqual(portfolioWindow(points.slice(1),30,'2026-09-17'),points.slice(1));
 assert.deepEqual(portfolioWindow(points,null,'2026-09-17'),points);
});
test('a tracking start hides earlier history in every period and carries the balance into its first day', () => {
 const points = [{date:'2026-09-12',net:469},{date:'2026-09-14',net:400000},{date:'2026-09-30',net:410000}];
 assert.equal(trackingWindowStart(null,'2026-09-30',null),'0000-01-01');
 assert.equal(trackingWindowStart(null,'2026-09-30','2026-09-15'),'2026-09-15');
 assert.equal(trackingWindowStart(30,'2026-09-30','2026-09-15'),'2026-09-15');
 // A later period start wins over an earlier tracking start.
 assert.equal(trackingWindowStart(7,'2026-09-30','2026-09-15'),'2026-09-23');
 assert.deepEqual(portfolioWindow(points,null,'2026-09-30','2026-09-15'),[{date:'2026-09-15',net:400000},points[2]]);
 assert.deepEqual(portfolioWindow(points,90,'2026-09-30','2026-09-15'),[{date:'2026-09-15',net:400000},points[2]]);
 assert.deepEqual(portfolioWindow(points,null,'2026-09-30',null),points);
});



test('dated PC purchase transfers cash without creating net worth; breeding valuation changes only its day',()=>{
 const rows=[record('cash','Cash'),record('club','Business'),record('sheep','Business'),record('debt','Debt')];
 const result=portfolioHistory(rows,[event('cash','2026-09-01',20000),event('club','2026-09-01',10000),event('sheep','2026-09-01',1000),event('debt','2026-08-01',5000),event('cash','2026-09-02',5000),event('club','2026-09-02',25000),event('sheep','2026-09-03',1500)],'USD',undefined,'2026-09-04');
 assert.deepEqual(result.points.map(p=>[p.date,p.net]),[['2026-09-01',26000],['2026-09-02',26000],['2026-09-03',26500]]);
});

 test('deleting mistaken assets and debts removes their entire history without a loss',()=>{
 const records=[record('cash','Cash'),record('wrong-asset','Property'),record('wrong-debt','Loan')];
 const events=[event('cash','2026-09-01',1000.25),event('wrong-asset','2026-09-01',5000),event('wrong-debt','2026-09-01',300),event('cash','2026-09-02',1000.25)];
 const result=portfolioHistory(records.filter(r=>r.id==='cash'),events,'USD',undefined,'2026-09-03');
 assert.deepEqual(result.points.map(p=>p.net),[1000.25,1000.25]);
 assert.deepEqual(portfolioHistory([],events,'USD',undefined,'2026-09-03').points,[]);
 });
 test('partial and complete repayments retain dated lending and debt history',()=>{
 const records=[record('lent','Money lent'),record('loan','Loan')];
 const events=[event('lent','2026-09-01',1000),event('loan','2026-09-01',600),event('lent','2026-09-02',500),event('loan','2026-09-02',300),event('lent','2026-09-03',0),event('loan','2026-09-03',0)];
 const result=portfolioHistory(records,events,'USD',undefined,'2026-09-04');
 assert.deepEqual(result.points.map(p=>[p.assets,p.debt,p.net]),[[1000,600,400],[500,300,200],[0,0,0]]);
 });

test('investment-only history excludes everyday cash and debt but retains opted-in cash',async()=>{
 const {isInvestmentRecord}=(await import('./helpers/load-ts.mjs')).loadTS('lib/comparison-profile.ts');
 const records=[record('ordinary','Cash'),{...record('reserve','Cash'),is_investment:true},record('stock','Stock'),record('debt','Loan')];
 const events=records.flatMap(r=>[event(r.id,'2026-09-01',100),event(r.id,'2026-09-02',r.id==='ordinary'?900:120)]);
 const result=portfolioHistory(records.filter(isInvestmentRecord),events,'USD',undefined,'2026-09-03');
 assert.deepEqual(result.points.map(p=>[p.assets,p.debt,p.net]),[[200,0,200],[240,0,240]]);
});

test('net worth includes cash and subtracts the remaining mortgage, not cumulative repayments', () => {
 const records = [record('cash', 'Cash'), record('home', 'Property'), record('mortgage', 'Mortgage')];
 const result = portfolioHistory(records, [
  event('cash', '2026-09-01', 10000), event('home', '2026-09-01', 200000), event('mortgage', '2026-09-01', 150000),
  event('cash', '2026-09-02', 8900), event('mortgage', '2026-09-02', 149000),
 ], 'USD', undefined, '2026-09-03');
 assert.deepEqual(result.points.map(({assets, debt, net}) => ({assets, debt, net})), [
  {assets:210000, debt:150000, net:60000},
  {assets:208900, debt:149000, net:59900},
 ]);
 assert.equal(result.missing, 0);
});

test('new zero-opening holdings preserve older portfolio history without inventing positive balances',()=>{
 const today='2026-09-25';
 const cash=record('cash','Cash');
 const additions=[{...record('business','Business'),date:today},{...record('stock','Stock'),opened_on:today},{...record('settlement','Cash'),opened_on:today}];
 const baselines=additions.map(row=>({...event(row.id,today,0),event_type:'baseline',created_at:today+'T09:00:00Z'}));
 const old=[event('cash','2020-01-01',1000),event('cash','2021-01-01',2000)];
 const updates=[{...event('cash',today,500),created_at:today+'T10:00:00Z'},{...event('business',today,1000),created_at:today+'T10:00:00Z'},{...event('stock',today,500),created_at:today+'T10:00:00Z'}];
 const result=portfolioHistory([cash,...additions],[...old,...baselines,...updates],'USD',undefined,today);
 assert.deepEqual(result.points.map(point=>[point.date,point.net]),[['2020-01-01',1000],['2021-01-01',2000],[today,2000]]);
 assert.equal(result.missing,0);
 for(const changed of [{...baselines[1],balance:100},{...baselines[1],event_type:'valuation'}]){
  const uncertain=portfolioHistory([cash,additions[1]],[...old,changed],'USD',undefined,today);
  assert.deepEqual(uncertain.points.map(point=>point.date),[today]);
 }
 const unknown=portfolioHistory([cash,record('stock','Stock')],[...old,baselines[1]],'USD',undefined,today);
 assert.deepEqual(unknown.points.map(point=>point.date),[today]);
 const earlierIncome={...event('stock','2019-01-01',null),event_type:'income',amount:10};
 assert.deepEqual(portfolioHistory([cash,additions[1]],[...old,earlierIncome,baselines[1]],'USD',undefined,today).points.map(point=>point.date),[today]);
});

test('partial-history view retains older observations after a positive new opening and flags incomplete coverage',()=>{
 const rows=[record('cash','Cash'),{...record('new','Cash'),opened_on:'2026-09-25'}];
 const events=[event('cash','2020-01-01',1000),event('cash','2021-01-01',2000),{...event('new','2026-09-25',50000),event_type:'baseline'}];
 const result=portfolioHistory(rows,events,'USD',undefined,'2026-09-25',true);
 assert.deepEqual(result.points.map(p=>[p.date,p.net,!!p.partial]),[['2020-01-01',1000,true],['2021-01-01',2000,true],['2026-09-25',52000,false]]);
 assert.equal(result.missing,0);
 assert.equal(portfolioWindow(result.points,30,'2026-09-25')[0].partial,true);
 assert.equal(result.points.at(-1).joined,50000,'the day says what it counts for the first time');
 const {joined,...complete}=result.points.at(-1);
 assert.deepEqual(portfolioHistory(rows,events,'USD',undefined,'2026-09-25').points,[complete],'a history that starts on that day joined nothing');
});

test('today’s parts come from the live records: each asset kind, debts together and negative, adding up to net worth',async()=>{
 const {loadTS}=await import('./helpers/load-ts.mjs');
 const {currentParts}=loadTS('lib/portfolio-history.ts');
 const entries=[record('c','Cash'),record('b','Business'),record('m','Mortgage'),record('k','Property')].map((entry,index)=>({...entry,amount:[500,3000,1200,250][index],quantity:0}));
 const parts=currentParts(entries);
 assert.deepEqual(parts,{Cash:500,Business:3000,Property:250,Debt:-1200});
 assert.equal(Object.values(parts).reduce((sum,value)=>sum+value,0),2550);
 assert.deepEqual(currentParts([]),{},'nothing recorded names nothing');
});

test('a quoted holding follows its price between snapshots instead of staying flat', () => {
 const closes = new Map([['btc', [{ date: '2026-01-01', close: 100 }, { date: '2026-01-05', close: 150 }, { date: '2026-01-10', close: 120 }, { date: '2026-01-20', close: 300 }, { date: '2027-01-01', close: 999 }]]]);
 const result = portfolioHistory([record('btc', 'Crypto'), record('cash', 'Cash')], [event('btc', '2026-01-01', 1000), event('cash', '2026-01-01', 50), event('btc', '2026-01-10', 2400)], 'USD', undefined, '2026-01-31', false, [], closes);
 assert.deepEqual(result.points.map(point => [point.date, point.net]), [
  ['2026-01-01', 1050],
  ['2026-01-05', 1550], // 1,000 carried by 150 / 100
  ['2026-01-10', 2450], // the snapshot's own value on its day: a purchase doubled the holding
  ['2026-01-20', 6050], // 2,400 carried by 300 / 120, from the new snapshot
 ], 'cash is untouched, and a close after today is not drawn');
 assert.deepEqual(result.points[1].parts, { Crypto: 1500, Cash: 50 });
});

test('a holding with no close by its snapshot keeps its recorded value, and closes before it add no days', () => {
 const closes = new Map([['aapl', [{ date: '2026-02-01', close: 10 }, { date: '2026-02-05', close: 20 }]], ['gone', [{ date: '2026-01-02', close: 5 }]]]);
 const result = portfolioHistory([record('aapl', 'Stock')], [event('aapl', '2026-01-15', 500)], 'USD', undefined, '2026-03-01', false, [], closes);
 assert.deepEqual(result.points.map(point => [point.date, point.net]), [['2026-01-15', 500], ['2026-02-01', 500], ['2026-02-05', 500]]);
 const early = portfolioHistory([record('aapl', 'Stock')], [event('aapl', '2026-02-03', 500)], 'USD', undefined, '2026-03-01', false, [], closes);
 assert.deepEqual(early.points.map(point => [point.date, point.net]), [['2026-02-03', 500], ['2026-02-05', 1000]], 'measured from the last close on or before the snapshot');
});

test('a holding first recorded inside the period does not hide the period\'s change: it counts from its first value',()=>{
 const {periodChange,joinedToday}=history;
 const today='2026-09-25';
 // Cash followed all year; a stock typed in today with no opening date, already worth 5,000.
 const rows=[record('cash','Cash'),record('stock','Stock')];
 const events=[event('cash','2026-01-01',1000),event('cash','2026-06-01',1400),{...event('cash',today,1500),created_at:today+'T08:00:00Z'},{...event('stock',today,5000),created_at:today+'T09:00:00Z'}];
 const result=portfolioHistory(rows,events,'USD',undefined,today,true);
 assert.deepEqual(result.points.map(point=>[point.date,point.net,!!point.partial,point.joined??0]),[['2026-01-01',1000,true,0],['2026-06-01',1400,true,0],[today,6500,false,5000]]);
 assert.deepEqual(periodChange(result.points),{change:500,joined:5000},'cash grew by 500; the stock was not earned today');
 assert.deepEqual(periodChange(portfolioWindow(result.points,90,today)),{change:100,joined:5000},'the last 90 days start from the balance carried into them');
 // The day after, the stock is up 200: that is a change like any other.
 const later=portfolioHistory(rows,[...events,event('stock','2026-09-26',5200)],'USD',undefined,'2026-09-26',true);
 assert.deepEqual(periodChange(later.points),{change:700,joined:5000});
 assert.deepEqual(periodChange(portfolioWindow(later.points,1,'2026-09-26')),{change:300,joined:5000},'the day it joined is inside the last day\'s period: cash +100, the stock +200');
 assert.deepEqual(periodChange(portfolioWindow(later.points,0,'2026-09-26')),{change:200,joined:0},'a period that starts after it joined leaves nothing out');
 // A debt entered late lowers net worth by what was owed all along, not by a loss in the period.
 const owed=portfolioHistory([record('cash','Cash'),record('loan','Loan')],[event('cash','2026-01-01',1000),event('cash','2026-06-01',1400),event('loan','2026-06-01',300)],'USD',undefined,today,true);
 assert.deepEqual(owed.points.map(point=>[point.net,point.joined??0]),[[1000,0],[1100,-300]]);
 assert.deepEqual(periodChange(owed.points),{change:400,joined:-300});
 // An explicit zero opening is known from the start, so the money put into it later is not left out.
 const opened=portfolioHistory([record('cash','Cash'),{...record('new','Stock'),opened_on:'2026-06-01'}],[event('cash','2026-01-01',1000),{...event('new','2026-06-01',0),event_type:'baseline'},event('new','2026-07-01',250)],'USD',undefined,today,true);
 assert.deepEqual(periodChange(opened.points),{change:250,joined:0});
 assert.deepEqual(periodChange(result.points.slice(0,1)),{change:null,joined:0},'one day is no change');
 assert.deepEqual(periodChange([]),{change:null,joined:0});
});

test('today\'s live point leaves out what the books first count today, a holding with no history included',()=>{
 const {joinedToday,periodChange}=history;
 const today='2026-09-25';
 const rows=[record('cash','Cash'),record('stock','Stock'),record('car','Vehicle'),record('loan','Loan')];
 const events=[event('cash','2026-01-01',1000),event('cash','2026-06-01',1400),event('stock',today,5000)];
 const recorded=portfolioHistory(rows,events,'USD',undefined,today,true);
 assert.deepEqual(recorded.unknown,['car','loan'],'no balance on record at all');
 assert.equal(recorded.missing,2);
 const live=[{id:'cash',kind:'Cash',amount:1400,quantity:1},{id:'stock',kind:'Stock',amount:51,quantity:100},{id:'car',kind:'Vehicle',amount:8000,quantity:1},{id:'loan',kind:'Loan',amount:2000,quantity:1},{id:'pay',kind:'Salary',amount:900,quantity:1}];
 const joined=joinedToday(recorded,today,live);
 assert.equal(joined,5000+8000-2000,'the stock at its first recorded value, the car and the loan at their live ones');
 // Net worth today is 1400 + 5100 + 8000 - 2000; of the change since January only cash (+400) and the stock since it was recorded (+100) are real.
 const points=[...recorded.points.slice(0,-1),{date:today,net:12500,joined}];
 assert.deepEqual(periodChange(points),{change:500,joined:11000});
 assert.equal(joinedToday({points:recorded.points.slice(0,-1),unknown:[]},today,live),0,'nothing joins on a day the history did not reach');
});

test('the net worth headline measures the period with what joined left out, says so, and keeps the split for periods on one basis',async()=>{
 const source=(await import('node:fs')).readFileSync('components/portfolio-overview.tsx','utf8');
 assert.match(source,/joined:joinedToday\(recorded,today,entries\)/,'today\'s live point carries what it first counts');
 assert.match(source,/const \{ change, joined \} = periodChange\(visible\);\s*const newlyCounted = Math\.abs\(joined\) >= \.5;/);
 assert.match(source,/\{newlyCounted && <InfoHint>\{t\('Holdings first recorded in this period count from their first recorded value, so adding one is not shown as a gain or a loss\.'\)\}<\/InfoHint>\}/);
 assert.match(source,/change !== null && !newlyCounted && growth && <p className="overview-change-split">/,'returns and own money are split only when the comparison stands on the same days');
});
