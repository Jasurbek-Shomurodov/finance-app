import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

// Loans › Record payment saves through the Tracker; only the activity log used to settle a loan's month.
const {debtPaymentsFrom,upcomingPayments,withTrackerRepayments}=loadTS('lib/planning.ts');
const {ownerDebtPayments}=loadTS('lib/telegram-owner.ts');
const loan={id:'loan',name:'Car',kind:'Loan',currency:'USD',amount:4000,date:'2027-08-31',opened_on:'2026-08-05',estimated_monthly_payment:500,frequency:'Once',created_at:'2026-08-05T00:00:00Z'};
const installments=payments=>upcomingPayments([loan],[],'2026-10-20','2026-10-31',payments).filter(item=>item.type==='installment').map(item=>[item.date,item.overdue]);

test('a loan paid through the Tracker settles its month, with what it paid in the loan\'s currency',()=>{
 assert.deepEqual(installments(debtPaymentsFrom(withTrackerRepayments([],[]))),[['2026-09-05',true],['2026-10-05',true]],'unpaid, each month stays overdue');
 const tracked=[{id:'t1',record_id:'loan',occurred_on:'2026-10-06',amount:450,account_link:{account_id:'eur'}}];
 const payments=debtPaymentsFrom(withTrackerRepayments([],tracked),[],new Map([['loan','USD'],['eur','EUR']]));
 assert.deepEqual(payments,[{record_id:'loan',date:'2026-10-06',amount:450,currency:'USD',account_id:'eur'}]);
 assert.deepEqual(installments(payments),[['2026-09-05',true]],'October is settled; September, unpaid, is not');
});

test('a repayment written to both the activity log and the history counts once, and a link-less row still counts',()=>{
 const activity=[{id:'both',action:'repayment',target_id:'loan',occurred_on:'2026-10-06',amount:40,fee:0,account_id:'eur'}];
 const tracked=[{id:'both',record_id:'loan',occurred_on:'2026-10-06',amount:450,account_link:{account_id:'eur'}},{id:'other',record_id:'loan',occurred_on:'2026-11-06',amount:100,account_link:null}];
 const payments=debtPaymentsFrom(withTrackerRepayments(activity,tracked),[],new Map([['loan','USD'],['eur','EUR']]));
 assert.deepEqual(payments,[{record_id:'loan',date:'2026-10-06',amount:40,currency:'EUR',account_id:'eur'},{record_id:'loan',date:'2026-11-06',amount:100,currency:'USD'}]);
});

test('the bot reads a loan\'s Tracker repayments too, paged, and a failed page throws',async()=>{
 const reads=[];
 const db={read:async path=>{reads.push(path);if(path.includes('account_activity'))return [{id:'a',action:'repayment',target_id:'loan',occurred_on:'2026-09-06'}];if(path.includes('investment_history'))return [{id:'t1',record_id:'loan',occurred_on:'2026-10-06'},{id:'a',record_id:'loan',occurred_on:'2026-09-06'}];return [];}};
 const [repayments,mortgages]=await ownerDebtPayments(db,'owner');
 assert.deepEqual(mortgages,[]);
 assert.deepEqual(installments(debtPaymentsFrom(repayments,mortgages)),[],'September from the log, October from the Tracker');
 assert.equal(debtPaymentsFrom(repayments,mortgages).length,2,'the repayment in both reads counts once');
 assert.ok(reads.some(path=>path.startsWith('/rest/v1/investment_history?')&&path.includes('event_type=eq.withdrawal')&&path.includes('user_id=eq.owner')&&path.includes('limit=500&offset=0')));
 await assert.rejects(ownerDebtPayments({read:async path=>{if(path.includes('investment_history'))throw Error('down');return [];}},'owner'),/down/);
});
