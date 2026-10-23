import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {entry,reportFixture,reportMarket} from './helpers/report-fixture.mjs';
const {buildFinancialReport}=loadTS('lib/financial-report.ts');
const {rangeTicks}=loadTS('lib/financial-report-insights.ts');
const {lineChart,listChart}=loadTS('lib/report-pdf-charts.ts');
const {layoutReport}=loadTS('lib/report-pdf-layout.ts');

const fonts={width:(text,size)=>Array.from(text).length*size*.5,clean:text=>text};
const tableOf=(r,header)=>r.blocks.find(b=>b.kind==='table'&&b.headers.includes(header));
const after=(r,text)=>r.blocks[r.blocks.findIndex(b=>b.text===text||b.text.startsWith(text))+1];

/** Three full months of $1,000 salary and $300 leisure before September, a $700 monthly rent, a loan paid $50 a month
 * and two month-end net-worth snapshots. */
function history(){
 const f=structuredClone(reportFixture);
 for(const month of ['06','07','08'])f.tables.finance_records.push(entry(`Salary ${month}`,'Salary',1000,'USD',{date:`2026-${month}-10`}),entry(`Leisure ${month}`,'Other expense',300,'USD',{custom_category_id:'leisure',date:`2026-${month}-12`}));
 f.tables.finance_records.push(entry('Rent','Rent expense',700,'USD',{frequency:'Monthly',date:'2026-09-05'}));
 f.tables.finance_records.find(r=>r.kind==='Loan').estimated_monthly_payment=50;
 f.tables.portfolio_snapshots=[{occurred_on:'2026-06-30',assets:5000,debt:500,rates:{USD:1,UZS:10000}},{occurred_on:'2026-07-15',assets:9999,debt:0,rates:{USD:1}},{occurred_on:'2026-07-31',assets:5200,debt:400,rates:{USD:1,UZS:10000}}];
 return f;
}

test('highlights state net worth since the first snapshot, spending against the average, cash cover, debt payments and what goes out next',()=>{
 const r=buildFinancialReport(history(),'en','',reportMarket,{currency:'USD'});
 const list=r.blocks.find(b=>b.kind==='list');
 assert.equal(list.text,'Highlights');
 assert.equal(r.blocks.indexOf(list),3,'right under the key figures');
 assert.deepEqual(list.items,[
  'Net worth is $4,700, +$200 since 1 June 2026.',
  'Spending so far this month is $25, 8% of your 3-month monthly average.',
  'Other expense spending is $25 above its 3-month average.',
  'Your cash covers 4 months of average spending.',
  'Debt payments take 5% of your average income.',
  '$700 is due to go out in the next 30 days.',
 ]);
});

test('net worth over time takes each month\'s last snapshot at its own rates and ends with today',()=>{
 const r=buildFinancialReport(history(),'en','',reportMarket,{currency:'USD'});
 const line=r.blocks.find(b=>b.kind==='line');
 assert.match(line.text,/^Net worth over time · Last 12 months$/);
 assert.equal(line.points.length,12);
 assert.deepEqual(line.points.slice(-4).map(p=>[p.label,p.value]),[['Jun',4500],['Jul',4800],['Aug',null],['Sep',4700]]);
 assert.ok(line.ticks[0].value<=4500&&line.ticks.at(-1).value>=4800);
 // Without two known months there is no chart.
 const bare=structuredClone(reportFixture);
 assert.ok(!buildFinancialReport(bare,'en','',reportMarket).blocks.some(b=>b.kind==='line'));
});

test('financial health ratios are worked out from the last three full months, and unknown without a rate',()=>{
 let r=buildFinancialReport(history(),'en','',reportMarket,{currency:'USD'});
 assert.deepEqual(tableOf(r,'Measure').rows.map(row=>row.slice(0,2)),[['Months of spending covered by cash','4 months'],['Savings rate, last 3 months','70%'],['Debt payments to income','5%'],['Debt to assets','6%']]);
 // UZS cash cannot be converted without a rate: cover and debt to assets are unknown, never counted as dollars.
 r=buildFinancialReport(history(),'en','',null,{currency:'USD'});
 const rows=tableOf(r,'Measure').rows;
 assert.equal(rows[0][1],'Not available');assert.equal(rows[3][1],'Not available');
 assert.ok(!r.blocks.find(b=>b.kind==='list').items.some(item=>item.includes('cash covers')));
});

test('spending per category compares this month so far with last month and the three-month average, in whole amounts',()=>{
 const r=buildFinancialReport(history(),'en','',reportMarket,{currency:'USD'});
 const table=tableOf(r,'3-month average');
 assert.deepEqual(table.headers,['Category','This month so far','Last month','3-month average','Compared with average']);
 assert.deepEqual(table.rows[0],['Leisure custom','$0','$300','$300','-$300']);
 assert.ok(table.rows.some(row=>row[0]==='Other expense'&&row[1]==='$25'));
 assert.ok(table.rows.flat().every(cell=>!/\d\.\d/.test(cell)));
});

test('the next 30 days list unpaid payments as entered, in and out, with converted totals',()=>{
 const r=buildFinancialReport(history(),'en','',reportMarket,{currency:'USD'});
 const heading=r.blocks.find(b=>b.kind==='heading'&&b.text.startsWith('Next 30 days'));
 assert.equal(heading.text,'Next 30 days · 18 September 2026 - 18 October 2026');
 const table=tableOf(r,'Money out');
 assert.deepEqual(table.rows,[['1 October 2026','Salary schedule · Salary','$9,000',''],['5 October 2026','Rent · Rent expense','','$700']]);
 assert.ok(after(r,'Next 30 days').kind==='table');
 assert.ok(r.blocks.some(b=>b.text.startsWith('Expected in: $9,000 · Expected out: $700.')));
 const quiet=structuredClone(reportFixture);quiet.tables.finance_records=quiet.tables.finance_records.filter(rec=>rec.frequency==='Once');
 assert.ok(buildFinancialReport(quiet,'en').blocks.some(b=>b.text==='Nothing scheduled in the next 30 days.'));
});

test('a loan\'s monthly installment is due in the next 30 days, as on Overview',()=>{
 const f=structuredClone(reportFixture);
 f.tables.finance_records.push(entry('Car loan','Loan',5000,'USD',{date:'2027-06-15',opened_on:'2026-06-15',estimated_monthly_payment:200}));
 f.tables.account_activity=[{id:'p',action:'repayment',account_id:'Cash account',target_id:'Car loan',amount:200,fee:0,occurred_on:'2026-09-15'}];
 assert.deepEqual(tableOf(buildFinancialReport(f,'en'),'Money out').rows.at(-1),['15 October 2026','Car loan · Loan','','$200']);
});

test('range ticks are round, cover the values and need not start at zero',()=>{
 assert.deepEqual(rangeTicks(0,900),[0,500,1000]);
 assert.deepEqual(rangeTicks(4500,4900),[4400,4600,4800,5000]);
 assert.deepEqual(rangeTicks(-300,400),[-500,-250,0,250,500]);
 assert.deepEqual(rangeTicks(1000,1000),[1000,1500]);
});

test('the line and list cards draw finite shapes and lay out on a page',()=>{
 const line={kind:'line',text:'Net worth',points:[{label:'Jun',value:4500},{label:'Jul',value:null},{label:'Aug',value:4800},{label:'Sep',value:4900}],ticks:[4500,4600,4700,4800,4900].map(value=>({value,label:'$'+value})),note:'Saved rates'};
 const list={kind:'list',text:'Highlights',items:['One short sentence.','A second sentence that is long enough to wrap onto a further line when the card is narrow.']};
 for(const chart of [lineChart(fonts,line,400),listChart(fonts,list,200)]){
  const ops=chart.draw(0,0);
  assert.ok(chart.height>0&&ops.length>0);
  assert.ok(ops.every(op=>Object.values(op).every(value=>typeof value!=='number'||Number.isFinite(value))));
 }
 // A gap in the months breaks the line: only August to September is joined.
 assert.equal(lineChart(fonts,line,400).draw(0,0).filter(op=>op.op==='line'&&op.color==='#0f766e').length,1);
 const pages=layoutReport([line,list],fonts,'Report');
 assert.ok(pages[0].ops.some(op=>op.op==='text'&&op.text==='Highlights'));
});
