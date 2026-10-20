import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {scheduledPaymentDue}=loadTS('lib/planning.ts');
const {demoScheduleLink}=loadTS('lib/record-save.ts');

const gym={id:'gym',date:'2026-08-05',frequency:'Monthly',recurrence_days:null,end_date:null};
const paid=due_on=>({record_id:'gym',due_on,status:'paid'}),skipped=due_on=>({record_id:'gym',due_on,status:'dismissed'});

test('a payment settles its own month first, then last month, then adds to its own month, as scheduled_payment_due does',()=>{
 assert.equal(scheduledPaymentDue(gym,'2026-10-20',[]),'2026-10-05','the open date of its own month');
 assert.equal(scheduledPaymentDue(gym,'2026-10-20',[paid('2026-10-05')]),'2026-09-05','else last month left open');
 assert.equal(scheduledPaymentDue(gym,'2026-10-20',[paid('2026-09-05'),paid('2026-10-05')]),'2026-10-05','else it adds to its own month');
 assert.equal(scheduledPaymentDue(gym,'2026-10-20',[skipped('2026-09-05'),paid('2026-10-05')]),'2026-10-05','a skipped date is never settled');
 assert.equal(scheduledPaymentDue(gym,'2026-10-20',[paid('2026-09-05'),skipped('2026-10-05')]),null,'nothing left to pay');
 assert.equal(scheduledPaymentDue({...gym,date:'2026-10-25'},'2026-10-20',[]),'2026-10-25','a later date of its own month');
 assert.equal(scheduledPaymentDue({...gym,end_date:'2026-08-31'},'2026-10-20',[]),null,'an ended schedule');
 const weekly={...gym,date:'2026-10-02',frequency:'Weekly'};
 assert.equal(scheduledPaymentDue(weekly,'2026-10-20',[{record_id:'gym',due_on:'2026-10-02',status:'paid'}]),'2026-10-09','the earliest open week');
 const others=[{record_id:'other',due_on:'2026-10-05',status:'paid'}];
 assert.equal(scheduledPaymentDue(gym,'2026-10-20',others),'2026-10-05','only its own occurrences count');
});

test('a sample expense that names its bill gets the due date it pays, so Recurring shows it paid',()=>{
 const bill={...gym,name:'Gym membership',kind:'Living expense',amount:60,currency:'USD',notes:'',quantity:1,cost:0,rate:0};
 const payment={id:'p',name:'Gym membership',kind:'Living expense',amount:60,currency:'USD',date:'2026-10-20',frequency:'Once',notes:'',quantity:1,cost:0,rate:0,occurrence_record_id:'gym'};
 assert.deepEqual(demoScheduleLink(payment,{},[],{records:[bill],occurrences:[]}),{occurrence_due_on:'2026-10-05'});
 assert.deepEqual(demoScheduleLink(payment,{},[],{records:[bill],occurrences:[paid('2026-09-05'),skipped('2026-10-05')]}),{occurrence_record_id:null},'nothing to pay: the link is dropped, as the database drops it');
 assert.deepEqual(demoScheduleLink(payment,{},[],{records:[],occurrences:[]}),{occurrence_record_id:null},'an unknown schedule');
 assert.deepEqual(demoScheduleLink({...payment,occurrence_due_on:'2026-09-05'},{},[],{records:[bill],occurrences:[]}),{},'a chosen due date stays');
 assert.deepEqual(demoScheduleLink({...payment,frequency:'Monthly'},{},[],{records:[bill],occurrences:[]}),{},'a schedule pays nothing');
});
