import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {cashLedgers,netWorthBalances}=loadTS('lib/cash-ledger.ts');
const {portfolioHistory}=loadTS('lib/portfolio-history.ts');
const today='2026-11-21';
const account=(id,amount,currency='USD')=>({id,name:id,kind:'Cash',currency,amount,quantity:1,ownership_percentage:100});
// Rows are saved at noon in Tashkent, so the entry day is the day named.
const at=day=>day+'T07:00:00Z';
const event=(id,record_id,date,event_type,balance,extra={})=>({id,record_id,occurred_on:date,created_at:at(date),event_type,amount:0,balance,ownership_percentage:100,principal:0,interest:0,notes:'',...extra});
const flow=(id,kind,amount,date,entered=date,extra={})=>({id,name:id,kind,amount,currency:'USD',date,frequency:'Once',account_id:'wallet',created_at:at(entered),...extra});
/** Net worth by day, as the Overview works it out: rebuilt accounts from their ledgers, the rest from snapshots and moves. */
const nets=(input,records=input.records)=>{
 const {events,moves}=netWorthBalances(input,today);
 return Object.fromEntries(portfolioHistory(records,events,{currency:'USD',rates:{USD:1,UZS:12000},today,includePartial:true,moves}).points.map(point=>[point.date,Math.round(point.net*100)/100]));
};
/** The same history read from the snapshots alone, as it was before accounts were rebuilt. */
const asWritten=input=>Object.fromEntries(portfolioHistory(input.records,input.events,{currency:'USD',rates:{USD:1},today,includePartial:true}).points.map(point=>[point.date,point.net]));

test('deleting an old expense leaves no dent between its day and the day it was deleted',()=>{
 // 20,000 on 1 September; 5,000 spent on 20 September and deleted on 20 November; 200 spent on 10 October.
 const records=[account('wallet',19800)];
 const events=[event('open','wallet','2026-09-01','baseline',20000),event('v1','wallet','2026-09-20','valuation',15000),event('v2','wallet','2026-10-10','valuation',14800),event('v3','wallet','2026-11-20','valuation',19800)];
 const cashflows=[flow('food','Living expense',200,'2026-10-10')];
 const input={records,events,cashflows};
 assert.deepEqual(asWritten(input),{'2026-09-01':20000,'2026-09-20':15000,'2026-10-10':14800,'2026-11-20':19800},'the snapshots still hold the deleted expense for two months');
 assert.deepEqual(nets(input),{'2026-09-01':20000,'2026-10-10':19800});
 assert.deepEqual([...cashLedgers(input,today).rebuilt],['wallet']);
});

test('editing an old amount restates every day since, and a restored transaction is back on its own day',()=>{
 // 500 spent on 20 September, corrected to 300 on 15 November.
 const records=[account('wallet',9700)];
 const events=[event('open','wallet','2026-09-01','baseline',10000),event('v1','wallet','2026-09-20','valuation',9500),event('v2','wallet','2026-11-15','valuation',9700)];
 assert.deepEqual(nets({records,events,cashflows:[flow('repair','Other expense',300,'2026-09-20')]}),{'2026-09-01':10000,'2026-09-20':9700});
 // Moved to another day on the same edit: the change follows the date the record has now.
 assert.deepEqual(nets({records,events,cashflows:[flow('repair','Other expense',300,'2026-10-02','2026-09-20')]}),{'2026-09-01':10000,'2026-10-02':9700});
});

test('a transaction entered late counts from its own day, with or without a snapshot on the day it was typed',()=>{
 const records=[account('wallet',5600)];
 const events=[event('open','wallet','2026-09-01','baseline',0),event('v1','wallet','2026-09-18','valuation',5700),event('v2','wallet','2026-09-20','valuation',5600)];
 const cashflows=[flow('salary','Salary',5700,'2026-09-05','2026-09-18'),flow('food','Living expense',100,'2026-09-20')];
 assert.deepEqual(nets({records,events,cashflows}),{'2026-09-01':0,'2026-09-05':5700,'2026-09-20':5600});
 // Dated before the account's first balance: it is part of the balance from the opening day on.
 const early=[flow('gift','Other income',400,'2026-08-20','2026-09-18'),flow('food','Living expense',100,'2026-09-20')];
 assert.deepEqual(nets({records:[account('wallet',300)],events:[event('open','wallet','2026-09-01','baseline',0),event('v2','wallet','2026-09-20','valuation',300)],cashflows:early}),{'2026-09-01':400,'2026-09-20':300});
});

test('a transfer between two accounts moves both on its day and changes no total',()=>{
 const records=[account('wallet',700),account('card',1300)];
 const events=[event('w0','wallet','2026-09-01','baseline',1000),event('c0','card','2026-09-01','baseline',1000),
  // Typed on 12 October for 5 October: both snapshots are a week late.
  event('w1','wallet','2026-10-12','valuation',700),event('c1','card','2026-10-12','valuation',1300)];
 const movements=[{id:'m',kind:'transfer',source_id:'wallet',target_id:'card',occurred_on:'2026-10-05',created_at:at('2026-10-12'),source_before:1000,source_after:700,target_before:1000,target_after:1300}];
 const input={records,events,movements};
 const {events:rebuilt}=cashLedgers(input,today);
 const balances=id=>rebuilt.filter(row=>row.record_id===id).map(row=>[row.occurred_on,row.balance]);
 assert.deepEqual(balances('wallet'),[['2026-09-01',1000],['2026-10-05',700]]);
 assert.deepEqual(balances('card'),[['2026-09-01',1000],['2026-10-05',1300]]);
 assert.deepEqual(nets(input),{'2026-09-01':2000,'2026-10-05':2000});
 // The older transfer dialog saved an operation instead: the sender's balances, and what the other account received.
 const operations=[{id:'t',action:'transfer',account_id:'wallet',target_id:'card',received:300,occurred_on:'2026-10-05',created_at:at('2026-10-12'),before_balance:1000,after_balance:700}];
 assert.deepEqual(nets({records,events,operations}),{'2026-09-01':2000,'2026-10-05':2000});
});

test('payments from the account, repayments, mortgage payments and balance adjustments are all dated changes',()=>{
 const records=[account('wallet',4150),{...account('shop',22000),kind:'Business'}];
 const events=[event('open','wallet','2026-09-01','baseline',6000),event('shop0','shop','2026-09-01','baseline',20000),
  {...event('buy','shop','2026-09-10','contribution',22000,{account_link:{account_id:'wallet',amount:-2000}}),amount:2000},
  // The same payment as an operation row is not counted twice.
  event('late','wallet','2026-11-01','valuation',4150)];
 const operations=[
  {id:'buy',action:'repayment',account_id:'wallet',occurred_on:'2026-09-10',before_balance:6000,after_balance:4000},
  {id:'home',action:'mortgage',account_id:'wallet',occurred_on:'2026-10-01',before_balance:4000,after_balance:3900},
  {id:'fix',action:'reconcile',account_id:'wallet',occurred_on:'2026-10-20',before_balance:3900,after_balance:4200},
 ];
 // A fee the operation saved is part of its balances; a Tracker copy moved cash through its link.
 const cashflows=[flow('fee','Other expense',50,'2026-10-25'),flow('copy','Other expense',2000,'2026-09-10','2026-09-10',{history_event_id:'buy'}),flow('opfee','Other expense',5,'2026-10-01','2026-10-01',{operation_id:'home'})];
 const {events:rebuilt,rebuilt:ids}=cashLedgers({records,events,operations,cashflows},today);
 assert.deepEqual([...ids],['wallet']);
 assert.deepEqual(rebuilt.filter(row=>row.record_id==='wallet').map(row=>[row.occurred_on,row.balance]),[['2026-09-01',6000],['2026-09-10',4000],['2026-10-01',3900],['2026-10-20',4200],['2026-10-25',4150]]);
 assert.ok(rebuilt.some(row=>row.id==='buy'),'another record keeps its own events');
});

test('an account whose records do not explain its balance keeps its snapshots',()=>{
 const snapshots=[event('open','wallet','2026-09-01','baseline',1000),event('v1','wallet','2026-09-20','valuation',900),event('v2','wallet','2026-10-15','valuation',2500)];
 // 100 was spent, then the balance was typed over on 15 October: nothing on record says where 1,600 came from.
 const typed={records:[account('wallet',2500)],events:snapshots,cashflows:[flow('food','Living expense',100,'2026-09-20')]};
 assert.equal(cashLedgers(typed,today).rebuilt.size,0);
 assert.deepEqual(cashLedgers(typed,today).events,snapshots);
 assert.deepEqual(nets(typed),{'2026-09-01':1000,'2026-09-20':900,'2026-10-15':2500});
 // A payment in another currency saved without its rate cannot be placed.
 const unrated={records:[account('wallet',900)],events:snapshots.slice(0,2),cashflows:[flow('rent','Rent expense',1200000,'2026-09-20','2026-09-20',{currency:'UZS'})]};
 assert.equal(cashLedgers(unrated,today).rebuilt.size,0);
 // A movement read without its balances leaves both accounts unexplained.
 const bare={records:[account('wallet',700),account('card',1300)],events:[event('w0','wallet','2026-09-01','baseline',1000),event('c0','card','2026-09-01','baseline',1000)],movements:[{id:'m',kind:'transfer',source_id:'wallet',target_id:'card',occurred_on:'2026-10-05'}]};
 assert.equal(cashLedgers(bare,today).rebuilt.size,0);
 // No change on record at all: a balance typed up and back down must not read as "nothing happened".
 const manual={records:[account('wallet',1000)],events:[event('open','wallet','2026-09-01','baseline',1000),event('up','wallet','2026-09-20','valuation',5000),event('down','wallet','2026-10-20','valuation',1000)]};
 assert.equal(cashLedgers(manual,today).rebuilt.size,0);
 assert.deepEqual(nets(manual),{'2026-09-01':1000,'2026-09-20':5000,'2026-10-20':1000});
 // No recorded balance, or a balance that is not a number.
 assert.equal(cashLedgers({records:[account('wallet',100)],events:[],cashflows:[flow('pay','Salary',100,'2026-09-20')]},today).rebuilt.size,0);
 assert.equal(cashLedgers({records:[account('wallet',NaN)],events:snapshots.slice(0,1),cashflows:[flow('pay','Salary',100,'2026-09-20')]},today).rebuilt.size,0);
});

test('one account falling back does not stop another from being rebuilt, and a rebuilt account takes no late-entry moves',()=>{
 const records=[account('wallet',900),account('safe',7000)];
 const events=[event('w0','wallet','2026-09-01','baseline',1000),event('w1','wallet','2026-09-25','valuation',900),event('s0','safe','2026-09-01','baseline',5000),event('s1','safe','2026-09-25','valuation',5050),event('s2','safe','2026-10-01','valuation',7000)];
 // Both typed on 25 September for 10 September. The safe was also typed over on 1 October.
 const cashflows=[flow('food','Living expense',100,'2026-09-10','2026-09-25'),flow('interest','Other income',50,'2026-09-10','2026-09-25',{account_id:'safe'})];
 const result=netWorthBalances({records,events,cashflows},today);
 assert.deepEqual([...result.rebuilt],['wallet']);
 assert.deepEqual(result.moves,[{record_id:'safe',date:'2026-09-10',entered:'2026-09-25',amount:50}],'only the account still read from snapshots is moved');
 assert.deepEqual(nets({records,events,cashflows}),{'2026-09-01':6000,'2026-09-10':5950,'2026-09-25':5950,'2026-10-01':7900});
});

test('changes already inside the opening balance are not walked through again, and one dated after today counts today',()=>{
 // The account existed before balances were recorded: its first snapshot (1 October) already holds September's pay.
 const records=[account('wallet',1400)];
 const events=[event('open','wallet','2026-10-01','baseline',1500),event('v','wallet','2026-10-05','valuation',1400)];
 const cashflows=[flow('pay','Salary',1500,'2026-09-15'),flow('food','Living expense',100,'2026-10-05')];
 assert.deepEqual(nets({records,events,cashflows}),{'2026-10-01':1500,'2026-10-05':1400});
 const ahead={records:[account('wallet',900)],events:[event('open','wallet','2026-11-01','baseline',1000)],cashflows:[flow('fee','Other expense',100,'2026-11-22','2026-11-21')]};
 assert.deepEqual(cashLedgers(ahead,today).events.map(row=>[row.occurred_on,row.balance]),[['2026-11-01',1000],[today,900]]);
});

test('an account in another currency is rebuilt in its own currency and converted like any other',()=>{
 const records=[account('som',11000000,'UZS')];
 const events=[event('open','som','2026-09-01','baseline',12000000,{}),event('v','som','2026-11-20','valuation',11000000)];
 // 100 USD spent from the UZS account at 10,000 on 3 September, and 500,000 UZS removed by a deleted row since.
 const cashflows=[flow('usd','Other expense',100,'2026-09-03','2026-09-03',{account_id:'som',account_exchange_rate:.0001,account_currency:'UZS'})];
 assert.deepEqual(nets({records,events,cashflows}),{'2026-09-01':1000,'2026-09-03':916.67});
});

test('the events the benchmarks read are untouched: a rebuilt account keeps its events that carry no balance',()=>{
 const records=[account('wallet',900)];
 const note=event('note','wallet','2026-09-10','income',null);
 const input={records,events:[event('open','wallet','2026-09-01','baseline',1000),note,event('v','wallet','2026-09-10','valuation',900)],cashflows:[flow('food','Living expense',100,'2026-09-10')]};
 const before=structuredClone(input.events);
 const {events}=cashLedgers(input,today);
 assert.deepEqual(input.events,before);
 assert.ok(events.includes(note));
 assert.deepEqual(events.filter(row=>row.balance!==null).map(row=>row.id),['ledger:wallet:2026-09-01','ledger:wallet:2026-09-10']);
});
