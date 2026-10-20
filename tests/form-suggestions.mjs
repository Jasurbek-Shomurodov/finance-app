import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {suggestedCashAccount,recentCategories,scheduleChoice,changedFields}=loadTS('lib/form-suggestions.ts');
const {openPaymentSchedules}=loadTS('lib/planning.ts');
const entry=(id,kind,extra={})=>({id,name:id,kind,amount:0,quantity:1,cost:0,rate:0,currency:'USD',frequency:'Once',date:'2026-10-01',notes:'',...extra});

test('a new transaction starts in the cash account last used for its direction and currency, else the only one',()=>{
 const checking=entry('checking','Cash'),savings=entry('savings','Cash'),euro=entry('euro','Cash',{currency:'EUR'});
 const records=[checking,savings,euro,
  entry('lunch','Living expense',{account_id:'checking',date:'2026-10-03'}),
  entry('rent','Rent expense',{account_id:'savings',date:'2026-10-09'}),
  entry('pay','Salary',{account_id:'checking',date:'2026-10-15'}),
  entry('bill','Living expense',{account_id:'checking',date:'2026-10-20',frequency:'Monthly'})];
 assert.equal(suggestedCashAccount(records,'USD','expense'),'savings','the newest expense, not the schedule or the income');
 assert.equal(suggestedCashAccount(records,'USD','income'),'checking');
 assert.equal(suggestedCashAccount(records,'EUR','expense'),'euro','the only account in that currency');
 assert.equal(suggestedCashAccount([checking,savings],'USD','expense'),null,'two accounts and no history: no guess');
 assert.equal(suggestedCashAccount(records,'GBP','expense'),null);
 // A business account would tag a personal expense to the business: personal accounts come first.
 const shop=entry('shop','Cash',{business_id:'candles'});
 assert.equal(suggestedCashAccount([...records,shop,entry('wax','Living expense',{account_id:'shop',date:'2026-10-30'})],'USD','expense'),'savings');
 assert.equal(suggestedCashAccount([shop],'USD','expense'),'shop','the only account, even a business one');
});

test('recent categories are the newest distinct ones still offered, as budget keys',()=>{
 const records=[entry('a','Living expense',{date:'2026-10-01'}),entry('b','Other expense',{custom_category_id:'cafe',date:'2026-10-05'}),entry('c','Living expense',{date:'2026-10-07'}),entry('d','Rent expense',{date:'2026-10-02'}),entry('e','Salary',{date:'2026-10-09'}),entry('f','Charity',{date:'2026-09-01'})];
 assert.deepEqual(recentCategories(records,'expense',()=>true),['Living expense','cafe','Rent expense','Charity']);
 assert.deepEqual(recentCategories(records,'expense',key=>key!=='Rent expense',2),['Living expense','cafe']);
 assert.deepEqual(recentCategories(records,'income',()=>true),['Salary']);
});

test('choosing a schedule fills a blank amount in its currency only when that is one of the person\'s currencies',()=>{
 const bill=entry('bill','Rent expense',{name:'Rent',amount:1200,currency:'EUR',frequency:'Monthly'});
 assert.deepEqual(scheduleChoice(entry('p','Rent expense',{name:''}),bill,['USD','EUR']),{currency:'EUR',account_exchange_rate:null,account_rate_date:null,account_currency:null,occurrence_record_id:'bill',name:'Rent',amount:1200});
 assert.deepEqual(scheduleChoice(entry('p','Rent expense',{name:''}),bill,['USD']),{occurrence_record_id:'bill',name:'Rent'},'a currency the person does not use is never picked for them');
 assert.deepEqual(scheduleChoice(entry('p','Rent expense',{name:'',amount:50}),bill,['USD','EUR']),{occurrence_record_id:'bill',name:'Rent'},'a typed amount keeps its currency');
 assert.deepEqual(scheduleChoice(entry('p','Rent expense'),null,['USD']),{occurrence_record_id:null});
});

test('changedFields lists only what a suggestion added',()=>{
 assert.deepEqual(changedFields(entry('p','Living expense'),{...entry('p','Living expense'),account_id:'checking',business_id:null}),{account_id:'checking',business_id:null});
});

test('only schedules with a due date still open by the end of the payment\'s month are offered, of any category when asked',()=>{
 const rent=entry('rent','Rent expense',{amount:1200,frequency:'Monthly',date:'2026-09-01'});
 const gym=entry('gym','Living expense',{amount:40,frequency:'Monthly',date:'2026-10-05'});
 const salary=entry('salary','Salary',{amount:5000,frequency:'Monthly',date:'2026-10-01'});
 const records=[rent,gym,salary];
 const paid=(record_id,due_on)=>({id:record_id+due_on,record_id,due_on,status:'paid'});
 const payment=entry('p','Rent expense',{date:'2026-10-20'});
 assert.deepEqual(openPaymentSchedules(records,[],payment).map(r=>r.id),['rent'],'its own category by default');
 assert.deepEqual(openPaymentSchedules(records,[],payment,true).map(r=>r.id),['rent','gym'],'every expense category, never income');
 assert.deepEqual(openPaymentSchedules(records,[paid('rent','2026-09-01'),paid('rent','2026-10-01')],payment,true).map(r=>r.id),['gym'],'a fully paid bill is not offered');
 assert.deepEqual(openPaymentSchedules(records,[paid('rent','2026-10-01')],payment).map(r=>r.id),['rent'],'last month left unpaid stays open');
 assert.deepEqual(openPaymentSchedules(records,[],entry('p','Living expense',{date:'2026-09-20'}),true).map(r=>r.id),['rent'],'a bill not yet started is not due');
 assert.deepEqual(openPaymentSchedules([{...rent,archived:true}],[],payment).length,0);
});
