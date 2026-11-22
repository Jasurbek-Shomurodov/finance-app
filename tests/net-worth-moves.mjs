import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {balanceMoves}=loadTS('lib/net-worth-moves.ts');
const {portfolioHistory}=loadTS('lib/portfolio-history.ts');
const record=(id,kind,currency='USD')=>({id,name:id,kind,currency,amount:0,quantity:1,ownership_percentage:100});
// Rows are saved at noon in Tashkent, so the entry day is the day named.
const at=day=>day+'T07:00:00Z';
const event=(id,record_id,date,event_type,amount,balance,extra={})=>({id,record_id,occurred_on:date,created_at:at(date),event_type,amount,balance,ownership_percentage:100,principal:0,interest:0,notes:'',...extra});
const flow=(id,kind,amount,date,entered,extra={})=>({id,name:id,kind,amount,currency:'USD',date,frequency:'Once',account_id:'wallet',created_at:at(entered),...extra});
const today='2026-11-14';
const nets=(records,events,moves)=>Object.fromEntries(portfolioHistory(records,events,{currency:'USD',rates:{USD:1,UZS:12000},today,includePartial:true,moves}).points.map(point=>[point.date,Math.round(point.net*100)/100]));

test('a transaction entered late changes the account on its own day, not the day it was typed',()=>{
 const records=[record('wallet','Cash')];
 const events=[event('open','wallet','2026-09-01','baseline',0,0),event('v1','wallet','2026-09-18','valuation',0,5700),event('v2','wallet','2026-09-20','valuation',0,5600)];
 const cashflows=[flow('salary','Salary',5700,'2026-09-01','2026-09-18'),flow('food','Living expense',100,'2026-09-20','2026-09-20')];
 const moves=balanceMoves({records,events,cashflows},today);
 assert.deepEqual(moves,[{record_id:'wallet',date:'2026-09-01',entered:'2026-09-18',amount:5700}]);
 assert.deepEqual(nets(records,events,[]),{'2026-09-01':0,'2026-09-18':5700,'2026-09-20':5600},'as written: the salary appears 17 days late');
 assert.deepEqual(nets(records,events,moves),{'2026-09-01':5700,'2026-09-18':5700,'2026-09-20':5600});
});

test('an amount in another currency moves the account by what it was saved at, and one without a rate is left alone',()=>{
 const records=[record('wallet','Cash')];
 const events=[event('open','wallet','2026-09-01','baseline',0,1000),event('v','wallet','2026-09-10','valuation',0,500)];
 const spent=flow('rent','Rent expense',6000000,'2026-09-03','2026-09-10',{currency:'UZS',account_exchange_rate:12000,account_currency:'USD'});
 assert.deepEqual(balanceMoves({records,events,cashflows:[spent]},today),[{record_id:'wallet',date:'2026-09-03',entered:'2026-09-10',amount:-500}]);
 assert.deepEqual(balanceMoves({records,events,cashflows:[{...spent,account_exchange_rate:null}]},today),[]);
 assert.deepEqual(balanceMoves({records,events,cashflows:[{...spent,account_exchange_rate:0}]},today),[],'a rate that is not positive is refused');
});

test('only a change whose late snapshot is on record is moved',()=>{
 const records=[record('wallet','Cash'),record('lent','Money lent')];
 const events=[event('open','wallet','2026-09-01','baseline',0,1000)];
 const late=flow('gift','Other income',50,'2026-09-02','2026-09-09');
 assert.deepEqual(balanceMoves({records,events,cashflows:[late]},today),[],'no balance was written on the entry day');
 const skipped=[flow('same','Salary',10,'2026-09-05','2026-09-05'),flow('ahead','Salary',10,'2026-09-30','2026-09-05'),flow('plan','Salary',10,'2026-09-02','2026-09-05',{frequency:'Monthly'}),flow('none','Salary',10,'2026-09-02','2026-09-05',{account_id:null}),
  flow('other','Salary',10,'2026-09-02','2026-09-05',{account_id:'lent'}),flow('copy','Other expense',10,'2026-09-02','2026-09-05',{history_event_id:'e'}),flow('mortgage','Other expense',10,'2026-09-02','2026-09-05',{mortgage_payment_id:'m'}),
  flow('fee','Other expense',10,'2026-09-02','2026-09-05',{operation_id:'o'}),flow('trade','Other expense',10,'2026-09-02','2026-09-05',{movement_id:'t'}),flow('zero','Salary',0,'2026-09-02','2026-09-05'),flow('undated','Salary',10,'2026-09-02','2026-09-05',{created_at:'never'}),
  flow('asset','Stock',10,'2026-09-02','2026-09-05'),flow('tomorrow','Salary',10,'2026-09-02','2026-11-15')];
 const seen=[...events,event('v','wallet','2026-09-05','valuation',0,1010),event('w','wallet','2026-11-15','valuation',0,1020)];
 assert.deepEqual(balanceMoves({records,events:seen,cashflows:skipped},today),[]);
});

test('a payment from an account entered late moves the account, unless the account already shows it on its day',()=>{
 const records=[record('wallet','Cash'),record('shop','Business'),record('friend','Money lent')];
 const link=amount=>({account_link:{account_id:'wallet',amount}});
 const events=[
  event('open','wallet','2026-10-01','baseline',0,6000),event('shop0','shop','2026-10-01','baseline',0,20000),
  // Paid into the business on 31 October, typed on 1 November: the account's balance is a snapshot of 1 November.
  {...event('buy','shop','2026-10-31','contribution',2000,null,link(-2000)),created_at:at('2026-11-01')},
  {...event('lend','friend','2026-10-31','contribution',1000,1000,link(-1000)),created_at:at('2026-11-01')},
  {...event('out','wallet','2026-10-31','withdrawal',1000,null),created_at:at('2026-11-01')},
  event('v1','wallet','2026-11-01','valuation',0,3000),
  // Paid and typed two days after the last balance: the account's own movement carries the balance on the payment's day.
  {...event('back','friend','2026-11-03','withdrawal',400,600,link(400)),created_at:at('2026-11-05')},
  {...event('in','wallet','2026-11-03','contribution',400,3400),created_at:at('2026-11-05')},
  event('v2','wallet','2026-11-05','valuation',0,3400),
 ];
 const moves=balanceMoves({records,events},today);
 assert.deepEqual(moves,[{record_id:'wallet',date:'2026-10-31',entered:'2026-11-01',amount:-2000},{record_id:'wallet',date:'2026-10-31',entered:'2026-11-01',amount:-1000}]);
 // Lending 1,000 moves it from the account to the loan on the same day: net worth does not jump for a day.
 assert.deepEqual(nets(records,events,[]),{'2026-10-01':26000,'2026-10-31':27000,'2026-11-01':24000,'2026-11-03':24000,'2026-11-05':24000});
 assert.deepEqual(nets(records,events,moves),{'2026-10-01':26000,'2026-10-31':24000,'2026-11-01':24000,'2026-11-03':24000,'2026-11-05':24000});
});

test('a mortgage payment entered late pays the account and the principal on its own day',()=>{
 const records=[record('wallet','Cash'),record('home','Mortgage')];
 const events=[
  event('open','wallet','2026-09-01','baseline',0,2000),event('debt','home','2026-09-10','baseline',0,87000),
  {...event('pay','home','2026-09-12','mortgage_payment',1574,null,{principal:469,interest:1105}),created_at:at('2026-09-18')},
  event('home18','home','2026-09-18','valuation',0,86531),event('wallet18','wallet','2026-09-18','valuation',0,426),
  // Paid on the day it was entered: its own balance is already on the right day.
  event('pay2','home','2026-10-08','mortgage_payment',1121,86061,{principal:470,interest:651}),event('wallet8','wallet','2026-10-08','valuation',0,-695),
 ];
 const operations=[{id:'pay',action:'mortgage',account_id:'wallet',occurred_on:'2026-09-12',created_at:at('2026-09-18'),before_balance:'2000',after_balance:'426'},
  {id:'pay2',action:'mortgage',account_id:'wallet',occurred_on:'2026-10-08',created_at:at('2026-10-08'),before_balance:426,after_balance:-695},
  {id:'fix',action:'reconcile',account_id:'wallet',occurred_on:'2026-09-12',created_at:at('2026-09-18'),before_balance:1,after_balance:2},
  {id:'far',action:'mortgage',account_id:'home',occurred_on:'2026-09-12',created_at:at('2026-09-18'),before_balance:1,after_balance:2}];
 const moves=balanceMoves({records,events,operations},today);
 assert.deepEqual(moves,[{record_id:'home',date:'2026-09-12',entered:'2026-09-18',amount:-469},{record_id:'wallet',date:'2026-09-12',entered:'2026-09-18',amount:-1574}]);
 const worth=nets(records,events,moves);
 assert.equal(worth['2026-09-10'],-85000);assert.equal(worth['2026-09-12'],-86105,'only the interest leaves net worth, on the day it was paid');assert.equal(worth['2026-09-18'],-86105);
});

test('a repayment saved from Accounts is moved once, by the account\'s own balances',()=>{
 const records=[record('wallet','Cash'),record('loan','Loan')];
 const events=[event('open','wallet','2026-09-01','baseline',0,900),event('v','wallet','2026-09-09','valuation',0,480),
  {...event('repayment:r1','loan','2026-09-04','withdrawal',400,null,{account_link:{account_id:'wallet',amount:-400}}),created_at:at('2026-09-09')},
  {...event('tracked','loan','2026-09-05','withdrawal',10,null,{account_link:{account_id:'wallet',amount:-10}}),created_at:at('2026-09-09')}];
 // The repayment took 420 with its interest; a Tracker payment that is also an operation counts through its link only.
 const operations=[{id:'r1',action:'repayment',account_id:'wallet',occurred_on:'2026-09-04',created_at:at('2026-09-09'),before_balance:900,after_balance:480},
  {id:'tracked',action:'repayment',account_id:'wallet',occurred_on:'2026-09-05',created_at:at('2026-09-09'),before_balance:490,after_balance:480}];
 assert.deepEqual(balanceMoves({records,events,operations},today),[{record_id:'wallet',date:'2026-09-05',entered:'2026-09-09',amount:-10},{record_id:'wallet',date:'2026-09-04',entered:'2026-09-09',amount:-420}]);
});

test('a moved change counts only once its record has a balance, and never past today',()=>{
 const records=[record('wallet','Cash'),record('home','Property')];
 const events=[event('home','home','2026-09-01','baseline',0,100000),event('open','wallet','2026-09-10','baseline',0,500),event('v','wallet','2026-09-20','valuation',0,800)];
 const moves=[{record_id:'wallet',date:'2026-09-05',entered:'2026-09-20',amount:300},{record_id:'gone',date:'2026-09-05',entered:'2026-09-20',amount:999},{record_id:'wallet',date:'2026-09-12',entered:'2026-12-01',amount:50},{record_id:'wallet',date:'2026-09-20',entered:'2026-09-12',amount:50},{record_id:'wallet',date:'2026-09-12',entered:'2026-09-20',amount:NaN}];
 const result=portfolioHistory(records,events,{currency:'USD',rates:undefined,today,includePartial:true,moves});
 // 5 September only moves a change inside an account not opened yet: nothing to draw that day.
 assert.deepEqual(result.points.map(point=>[point.date,point.net,!!point.partial]),[['2026-09-01',100000,true],['2026-09-10',100800,false],['2026-09-20',100800,false]]);
 assert.deepEqual(portfolioHistory(records,events,{currency:'USD',rates:undefined,today,moves}).points.map(point=>point.date),['2026-09-10','2026-09-20']);
});
