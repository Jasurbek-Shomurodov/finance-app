import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {spendingPace,spendingOnDay}=loadTS('lib/spending-pace.ts');
const {shiftMonth}=loadTS('lib/calendar-days.ts');
const {monthlyReview}=loadTS('lib/transaction-tools.ts');
const record=(id,kind,amount,date,extra={})=>({id,name:id,kind,amount,quantity:1,cost:0,rate:0,currency:'USD',frequency:'Once',date,notes:'',...extra});
const records=[
 record('a','Living expense',100,'2026-10-01'),record('b','Rent expense',900,'2026-10-02'),record('salary','Salary',3000,'2026-10-02'),
 record('c','Living expense',40,'2026-09-01'),record('d','Living expense',60,'2026-09-15'),record('e','Charity',10,'2026-09-30'),
 record('later','Living expense',500,'2026-10-20'),record('plan','Living expense',70,'2026-09-03',{frequency:'Monthly'}),
];
const input={records,splits:[]};

test('spending pace is the Monthly review total with each day as the cut-off, for this month and last',()=>{
 const pace=spendingPace(input,'2026-10-02','USD',{USD:1});
 assert.equal(pace.month,'2026-10');assert.equal(pace.previousMonth,'2026-09');
 assert.equal(pace.points.length,31);
 assert.deepEqual(pace.points.slice(0,3),[{day:1,current:100,previous:40,pace:null},{day:2,current:1000,previous:40,pace:null},{day:3,current:null,previous:40,pace:null}]);
 assert.equal(pace.points[14].previous,100);assert.equal(pace.points[29].previous,110);
 assert.equal(pace.points[30].previous,110,'September has 30 days; day 31 keeps its total');
 // Income, planned (recurring) records and future-dated spending are not counted.
 assert.equal(pace.spent,1000);assert.equal(pace.previousToDate,40);
 assert.equal(pace.spent,monthlyReview(records,[],[],'2026-10','USD','2026-10-02').spent);
 assert.equal(pace.missing,false);
 assert.deepEqual([pace.running,pace.day,pace.days,pace.plan,pace.status],[true,2,31,null,null],'no plan, no pace line and no status');
});

test('spending pace handles year boundaries, February and missing exchange rates',()=>{
 assert.equal(shiftMonth('2026-01',-1),'2025-12');assert.equal(shiftMonth('2028-03',-1),'2028-02');
 const march=spendingPace({records:[record('x','Living expense',5,'2028-02-29')],splits:[]},'2028-03-31','USD',{USD:1});
 assert.equal(march.points.length,31);assert.equal(march.points[28].previous,5);assert.equal(march.points[30].previous,5);
 const foreign=spendingPace({records:[record('y','Living expense',50000,'2026-10-01',{currency:'UZS'})],splits:[]},'2026-10-01','USD',{USD:1});
 assert.equal(foreign.missing,true,'no rate is inferred');
});

test('a month and previous month without spending is empty, so the card shows an empty state instead of a $0–$1 axis',()=>{
 const empty=spendingPace({records:[record('salary','Salary',3000,'2026-10-02')],splits:[]},'2026-10-02','USD',{USD:1});
 assert.equal(empty.empty,true);assert.equal(empty.spent,0);
 assert.equal(spendingPace(input,'2026-10-02','USD',{USD:1}).empty,false);
 assert.equal(spendingPace({records:[record('x','Living expense',5,'2026-09-03',{currency:'EUR'})],splits:[]},'2026-10-02','USD',{USD:1}).empty,false,'missing rates are not an empty month');
});

test('the tooltip shows where the money went on a day: that day\'s spending only, largest first',()=>{
 const day=[...records,record('big','Rent expense',1200,'2026-09-15'),record('fx','Living expense',100,'2026-09-15',{currency:'EUR'}),record('pay','Salary',3000,'2026-09-15'),record('rent','Rent expense',800,'2026-09-15',{frequency:'Monthly'})];
 assert.deepEqual(spendingOnDay(day,'2026-09-15','USD',{USD:1}).map(item=>[item.name,item.kind,item.amount]),[['big','Rent expense',1200],['d','Living expense',60]],'income, plans and amounts without a rate are left out');
 assert.deepEqual(spendingOnDay(day,'2026-09-15','USD',{USD:1,EUR:.5}).map(item=>item.amount),[1200,200,60]);
 // Each item carries the transaction as entered (MONEY-011): the euro expense reads in euros, its converted amount only orders it.
 assert.deepEqual(spendingOnDay(day,'2026-09-15','USD',{USD:1,EUR:.5}).map(item=>item.entered),[{amount:1200,currency:'USD'},{amount:100,currency:'EUR'},{amount:60,currency:'USD'}]);
 assert.deepEqual(spendingOnDay(day,'2026-09-16','USD',{USD:1}),[]);
 const pace=spendingPace({records:day,splits:[]},'2026-10-02','USD',{USD:1});
 assert.equal(pace.points[14].previous-pace.points[13].previous,spendingOnDay(day,'2026-09-15','USD',{USD:1}).reduce((sum,item)=>sum+item.amount,0),'the day\'s items add up to the jump in the line');
});

test('a day\'s spending includes a Tracker expense on an investment, named after its holding, so the items add up to the line',()=>{
 const holding=record('stock','Stock',5000,'2026-01-01',{name:'Apple',frequency:'Monthly'});
 const links=[{id:'fee',account_id:'cash',account_currency:'USD',amount:-12,investment_history:{occurred_on:'2026-09-15',record_id:'stock',event_type:'expense'}}];
 const day=[...records,holding];
 assert.deepEqual(spendingOnDay(day,'2026-09-15','USD',{USD:1},links).map(item=>[item.name,item.kind,item.amount]),[['d','Living expense',60],['Apple','Other expense',12]]);
 const pace=spendingPace({records:day,splits:[],snapshots:[],investmentLinks:links},'2026-10-02','USD',{USD:1});
 assert.equal(pace.points[14].previous-pace.points[13].previous,72);
});

// The one series the Dashboard and Budget draw: Budget names the month, the plan and the categories it leaves out.
test('with a plan the month runs beside an even pace toward it, without excluded categories, for any month Budget shows',()=>{
 const rows=[record('a','Living expense',100,'2026-11-02'),record('b','Other expense',50,'2026-11-02',{custom_category_id:'gym'}),record('c','Living expense',30,'2026-11-10'),record('pay','Salary',5000,'2026-11-05'),
  record('late','Living expense',999,'2026-11-20'),record('old','Living expense',999,'2026-10-31'),record('bill','Living expense',400,'2026-11-01',{frequency:'Monthly'}),record('som','Living expense',125000,'2026-11-03',{currency:'UZS'}),record('odd','Living expense',7,'2026-11-04',{currency:'XYZ'})];
 const today='2026-11-14',rates={USD:1,UZS:12500},read=(plan,extra={})=>spendingPace({records:rows,splits:[]},today,'USD',rates,{month:'2026-11',plan,...extra});
 const pace=read(600);
 assert.equal(pace.points.length,31,'October, the month before, has 31 days');assert.equal(pace.days,30);assert.equal(pace.day,14);assert.equal(pace.plan,600);
 assert.deepEqual(pace.points[0],{day:1,current:0,previous:0,pace:20});
 assert.equal(pace.points[1].current,150);
 assert.equal(pace.points[2].current,160,'another currency counts at its rate');
 assert.equal(pace.points[3].current,160,'an amount no rate converts is left out, never added as it stands');assert.equal(pace.missing,true,'and the month says so');
 assert.equal(pace.points[13].current,190);assert.equal(pace.points[13].pace,280);
 assert.equal(pace.points[14].current,null,'days not reached carry no spending');
 assert.equal(pace.points[29].pace,600,'the even pace ends on the plan');assert.equal(pace.points[30].pace,null,'and stops with the month');
 assert.equal(pace.points[30].previous,999,'last month runs beside it, to its own last day');
 assert.equal(pace.spent,190,'income, schedules, other months and later days are not spending so far');
 assert.equal(pace.status,'on_pace');
 assert.equal(read(300).status,'above_pace','190 spent against 140 by day 14');
 assert.equal(read(150).status,'over_plan');
 assert.equal(read(0).status,null,'no plan, no pace');
 const unknown=read(null);assert.equal(unknown.status,null);assert.equal(unknown.points[0].pace,null);
 assert.equal(read(600,{excluded:new Set(['gym'])}).spent,140,'an excluded category is left out, as in the budget totals');
 // A past month is whole and has no status; a split counts in its parts.
 const past=spendingPace({records:rows,splits:[{record_id:'old',category_id:'gym',amount:99},{record_id:'old',category_id:'Living expense',amount:900}]},today,'USD',rates,{month:'2026-10',plan:600,excluded:new Set(['gym'])});
 assert.equal(past.day,31);assert.equal(past.status,null);assert.equal(past.running,false);assert.equal(past.points[30].current,900);assert.equal(past.spent,900);
 const ahead=spendingPace({records:rows,splits:[]},today,'USD',rates,{month:'2026-12',plan:600});
 assert.equal(ahead.day,0);assert.equal(ahead.spent,0);assert.equal(ahead.points[0].current,null);
});
