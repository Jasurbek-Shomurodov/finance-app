import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const closed=loadTS('lib/closed-records.ts');
const {deletionBlockers,accountHasLinks,blockersFrom,blockerLabels,isDeleteBlocker}=loadTS('lib/account-deletion.ts');
const {portfolioHistory}=loadTS('lib/portfolio-history.ts');
const {netWorthBalances}=loadTS('lib/cash-ledger.ts');
const {financialTotals}=loadTS('lib/finance.ts');
const {movementSources,movementTargets}=loadTS('lib/asset-movements.ts');
const {snapshotTotals}=loadTS('lib/portfolio-snapshots.ts');
const en=loadTS('lib/i18n.ts').dictionaries.en;

const record=(id,kind,amount,extra={})=>({id,name:id,kind,currency:'USD',amount,quantity:1,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:'',ownership_percentage:100,...extra});
const at=day=>day+'T07:00:00Z';
const event=(id,record_id,date,event_type,balance)=>({id,record_id,occurred_on:date,created_at:at(date),event_type,amount:0,balance,ownership_percentage:100,principal:0,interest:0,notes:''});
const nets=(records,events,today='2026-11-21',extra={})=>Object.fromEntries(portfolioHistory(records,events,{currency:'USD',rates:{USD:1},today,includePartial:true,...extra}).points.map(point=>[point.date,point.net]));

test('a closed record leaves the lists and pickers, and waits in the closed ones with the latest closing first',()=>{
 const wallet=record('wallet','Cash',500),old=record('old','Cash',0,{closed_on:'2026-03-01'}),sold=record('sold','Stock',120,{quantity:0,closed_on:'2026-06-01'}),card=record('card','Cash',40);
 const broker={id:'broker',name:'Broker',kind:'Stock',currency:'USD'},gone={...broker,id:'gone',closed_on:'2026-05-01'};
 const data=closed.splitClosed({records:[wallet,old,sold,card],holdingAccounts:[broker,gone],goals:[]});
 assert.deepEqual(data.records.map(item=>item.id),['wallet','card']);
 assert.deepEqual(data.closed.map(item=>item.id),['sold','old'],'the latest closing first');
 assert.deepEqual([data.holdingAccounts.map(item=>item.id),data.closedAccounts.map(item=>item.id)],[['broker'],['gone']]);
 // Transfer sources and targets, and every other picker fed from the open records, never offer a closed account.
 assert.deepEqual(movementSources('transfer',data.records).map(item=>item.id),['wallet','card']);
 assert.deepEqual(movementTargets('transfer',wallet,data.records).map(item=>item.id),['card']);
 // A past transaction still names the closed account it was paid from.
 assert.equal(closed.recordAmong('old',data).name,'old');assert.equal(closed.recordAmong('wallet',data).name,'wallet');assert.equal(closed.recordAmong(null,data),undefined);
 // Nothing closed: the lists pass through untouched.
 const open=closed.splitClosed({records:[wallet,card]});
 assert.deepEqual([open.records,open.closed,open.closedAccounts,'holdingAccounts' in open],[[wallet,card],[],[],false]);
 assert.equal(closed.isClosed(old),true);assert.equal(closed.isClosed(wallet),false);
 assert.equal(closed.isClosable(wallet),true);assert.equal(closed.isClosable(record('pay','Salary',1)),false);
 assert.deepEqual(closed.openOnly([wallet,old]).map(item=>item.id),['wallet']);
});

test('a closed record counts nothing in current totals, and a day\'s snapshot keeps each record\'s own part',()=>{
 const records=[record('wallet','Cash',500),record('old','Cash',0,{closed_on:'2026-03-01'}),record('sold','Stock',120,{quantity:0,closed_on:'2026-06-01'}),record('loan','Loan',80)];
 assert.deepEqual((({totalAssets,totalDebt,netWorth,cash})=>({totalAssets,totalDebt,netWorth,cash}))(financialTotals(records)),{totalAssets:500,totalDebt:80,netWorth:420,cash:500});
 const totals=snapshotTotals(records,{quotes:{},rates:{USD:1},fx:null});
 assert.deepEqual(totals,{assets:500,debt:80,rates:{USD:1},parts:{wallet:500,loan:80}},'a record worth nothing has no part');
});

test('closing needs an empty record; a cash account sends what is left to an account in its own currency',()=>{
 assert.equal(closed.isEmptyRecord(record('a','Cash',0)),true);assert.equal(closed.isEmptyRecord(record('a','Cash',.01)),false);
 assert.equal(closed.isEmptyRecord(record('s','Stock',250,{quantity:0})),true,'sold out, whatever the last price');
 assert.equal(closed.isEmptyRecord(record('s','Stock',250,{quantity:2})),false);
 assert.equal(closed.isEmptyRecord(record('s','Stock',0,{quantity:2})),false,'units left at a price of 0: a live quote would value them again (migration 174)');
 assert.equal(closed.isEmptyRecord(record('p','Property',0)),true);
 assert.equal(closed.isEmptyRecord(record('f','Business',90,{quantity:0,unit_label:'sheep'})),true,'a counted asset with none left');
 assert.equal(closed.isEmptyRecord(record('f','Business',90,{quantity:0})),false,'without a unit the quantity means nothing');
 const wallet=record('wallet','Cash',300),records=[wallet,record('card','Cash',5),record('euro','Cash',5,{currency:'EUR'}),record('safe','Deposit',9),record('shut','Cash',0,{closed_on:'2026-01-02'}),record('aapl','Stock',10)];
 assert.deepEqual(closed.closingTargets(wallet,records).map(item=>item.id),['card','safe']);
 assert.equal(closed.closesWithTransfer(wallet),true);assert.equal(closed.closesWithTransfer(records[5]),false);
 assert.deepEqual(closed.closingTransfer('m1',wallet,'card','2026-11-20'),{id:'m1',kind:'transfer',source_id:'wallet',target_id:'card',sent:300,received:300,source_value:300,target_value:300,fee:0,date:'2026-11-20',notes:''});
 // The sample workspace keeps the database's rules on its own rows.
 const moved=closed.closeLocally(records,'wallet','2026-11-20','card');
 assert.deepEqual(moved.filter(item=>['wallet','card'].includes(item.id)).map(item=>[item.id,item.amount,item.closed_on??null]),[['wallet',0,'2026-11-20'],['card',305,null]]);
 assert.throws(()=>closed.closeLocally(records,'wallet','2026-11-20',null),/Bring the balance to zero before closing/);
 assert.deepEqual(closed.closeLocally(records,'missing','2026-11-20'),records);
 assert.equal(closed.reopenLocally(moved,'wallet').find(item=>item.id==='wallet').closed_on,null);
 // An investment account: what would move or close with it, and whether it still names any holding at all.
 const account={id:'broker'},held=[record('a','Stock',10,{quantity:0,holding_account_id:'broker'}),record('b','Stock',10,{quantity:3,holding_account_id:'broker'}),record('c','Stock',10,{quantity:0,holding_account_id:'broker',closed_on:'2026-02-02'})];
 assert.deepEqual([closed.accountHoldings(account,held).holdings.map(item=>item.id),closed.accountHoldings(account,held).allEmpty],[['a','b'],false]);
 assert.equal(closed.accountHoldings(account,[held[0]]).allEmpty,true);
 assert.equal(closed.accountHasHoldings(account,{records:[],closed:[held[2]]}),true,'a closed holding still sits in it');
 assert.equal(closed.accountHasHoldings(account,{records:[wallet]}),false);
 assert.ok(en[closed.accountHoldsMessage]);
});

test('the net worth history keeps a closed record\'s value before its closing day and counts zero from it',()=>{
 const wallet=record('wallet','Cash',700),fund=record('fund','Property',0,{closed_on:'2026-06-10'});
 const events=[event('w0','wallet','2026-01-01','baseline',700),event('f0','fund','2026-01-01','baseline',50000),event('f1','fund','2026-03-01','valuation',52000),
  // The balance went to zero in a snapshot written three days after the closing day.
  event('f2','fund','2026-06-13','valuation',0)];
 assert.deepEqual(nets([wallet,fund],events),{'2026-01-01':50700,'2026-03-01':52700,'2026-06-10':700,'2026-06-13':700},'the line steps on the closing day itself');
 // Still open, the same events hold its value until the snapshot.
 assert.deepEqual(nets([wallet,{...fund,closed_on:null}],events),{'2026-01-01':50700,'2026-03-01':52700,'2026-06-13':700});
 // Reopened and funded again: it counts from its new balance.
 const reopened=[...events,event('f3','fund','2026-09-01','valuation',1000)];
 assert.deepEqual(nets([wallet,{...fund,amount:1000,closed_on:null}],reopened)['2026-09-01'],1700);
 // A closing day in the future, or before the first balance, draws no day of its own.
 assert.deepEqual(Object.keys(nets([wallet,{...fund,closed_on:'2027-01-01'}],events)),['2026-01-01','2026-03-01','2026-06-13']);
 assert.deepEqual(nets([wallet,{...fund,closed_on:'2025-12-01'}],events),{'2026-01-01':700,'2026-03-01':700,'2026-06-13':700});
 // A closed debt stops counting too.
 const loan=record('loan','Loan',0,{closed_on:'2026-04-01'});
 assert.deepEqual(nets([wallet,loan],[events[0],event('l0','loan','2026-01-01','baseline',300)]),{'2026-01-01':400,'2026-04-01':700});
});

test('a closed cash account is rebuilt from its ledger: its balance leaves on the day of the closing transfer',()=>{
 const today='2026-11-21';
 const wallet=record('wallet','Cash',0,{closed_on:'2026-11-10'}),card=record('card','Cash',1300);
 const events=[event('w0','wallet','2026-09-01','baseline',1000),event('c0','card','2026-09-01','baseline',300),
  // The transfer was typed on 12 November and dated the closing day, so both snapshots are dated the 12th.
  event('w1','wallet','2026-11-12','valuation',0),event('c1','card','2026-11-12','valuation',1300)];
 const movements=[{id:'m1',kind:'transfer',source_id:'wallet',target_id:'card',occurred_on:'2026-11-10',created_at:at('2026-11-12'),source_before:1000,source_after:0,target_before:300,target_after:1300}];
 const input={records:[wallet,card],events,movements};
 const balances=netWorthBalances(input,today);
 assert.deepEqual([...balances.rebuilt].sort(),['card','wallet']);
 const points=portfolioHistory(input.records,balances.events,{currency:'USD',rates:{USD:1},today,includePartial:true,moves:balances.moves}).points;
 assert.deepEqual(points.map(point=>[point.date,point.net,point.parts.Cash]),[['2026-09-01',1300,1300],['2026-11-10',1300,1300]],'the money moved, net worth did not');
});

test('what still points at an account is named from the loaded data, and a refusal\'s detail reads as the same names',()=>{
 const empty={records:[record('acc','Cash',5)],goals:[],activity:[],movements:[],investmentLinks:[]};
 assert.deepEqual(deletionBlockers('acc',empty),[]);assert.equal(accountHasLinks('acc',empty),false);
 const linked={records:[...empty.records,record('t','Living expense',5,{account_id:'acc'}),record('rent','Rent income',9,{frequency:'Monthly',income_source_id:'acc'})],goals:[{id:'g',account_id:'acc'}],
  activity:[{id:'a',account_id:'x',target_id:'acc'}],movements:[],investmentLinks:[{id:'l',account_id:'x',investment_history:{record_id:'acc'}}]};
 assert.deepEqual(deletionBlockers('acc',linked),['transactions','schedules','transfers','payments','goals']);
 assert.deepEqual(deletionBlockers('acc',{...empty,movements:[{id:'m',source_id:'acc',target_id:'x'}]}),['transfers']);
 assert.deepEqual(deletionBlockers('biz',{...empty,records:[record('sale','Business income',5,{business_id:'biz'})]}),['transactions']);
 assert.deepEqual(blockersFrom('goals,transactions,unknown'),['transactions','goals'],'in the order the confirmation lists them');
 assert.deepEqual(blockersFrom(null),[]);
 assert.equal(isDeleteBlocker('statements'),true);assert.equal(isDeleteBlocker('toString'),false);
 for(const label of Object.values(blockerLabels))assert.ok(en[label],label+' is translated');
});
