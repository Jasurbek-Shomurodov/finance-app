import { benchmarkExpenseFunding, benchmarkInvestment, investmentActivity, openingFunding, type BenchmarkMovement, type FundingScope } from './investment-benchmarks';
import { income, liabilities } from './finance';
import { convertAmount, marketRates } from './market';
import { convertHistorical } from './investment-comparison';
import type { FxPoint } from './benchmark-data';
import type { InvestmentPortfolioInput } from './investment-portfolio';
import { capitalizedInterest, copiesCapitalizedInterest } from './investment-history';

/** `detail` is a row's own category when it is listed under a wider heading. */
export type PeriodRow={name:string;date:string;category:string;amount:number|null;detail?:string};
// The three figures follow the chart's funding rules: money invested is what funds benchmarks
// when expenses are excluded (purchases, principal repayments and values recorded without a purchase), and expenses paid is what "Including expenses" adds to it.
/** `categories` are the workspace's own categories, so an expense in one shows its name. */
type PeriodInput=InvestmentPortfolioInput&{movements?:BenchmarkMovement[];fx?:FxPoint[];categories?:readonly {id:string;name:string}[]};
type PeriodDetails=Record<'income'|'invested'|'expenses',PeriodRow[]>;
// With `scope` 'expenses' the benchmarks invest that spending too, so money invested includes it.
export function investmentPeriodTotals(input:PeriodInput,start:string,details?:PeriodDetails,scope:FundingScope='investments'){
 const totals=periodTotals(input,start,details);
 if(scope!=='expenses')return totals;
 // The expenses stay together under their own heading, apart from the purchases, each naming its category.
 details?.invested.push(...details.expenses.map(row=>({...row,category:'Expenses paid',detail:row.category})));
 return {...totals,invested:totals.invested+totals.expenses};
}
function periodTotals(input:PeriodInput,start:string,details?:PeriodDetails){
 const totals={income:0,invested:0,expenses:0};
 const missing=new Set<string>();
 const records=new Map(input.records.map(record=>[record.id,record]));
 const rates=marketRates(input.market)??{};
 let context={name:'',date:'',category:''};
 // `category` replaces the context's when the row belongs under another heading.
 const add=(key:keyof typeof totals,amount:number,currency:string,category=context.category)=>{
  // With the chart's dated rates, convert like the chart: to USD at the day's rate, then to the display currency at today's.
  const usd=input.fx?.length?convertHistorical(amount,currency,'USD',context.date,input.fx):null;
  const converted=usd===null?convertAmount(amount,currency,input.currency,rates):convertAmount(usd,'USD',input.currency,rates);
  if(amount!==0)details?.[key].push({...context,category,amount:converted});
  if(converted===null||!Number.isFinite(converted))missing.add(currency);else totals[key]+=converted;
 };
 const inPeriod=(date:string)=>date>=start&&date<=input.today;
 const activity=investmentActivity(input.records,input.events,input.movements,input.today);
 for(const item of activity.items){
  if(item.payout||!inPeriod(item.date))continue;
  const kind=records.get(item.recordId)?.kind??'';
  context={name:item.name,date:item.date,category:kind==='Property'?'Rental improvements':kind==='Valuables'?'Valuables purchase':kind==='Vehicle'?'Vehicle purchase':kind==='Retirement account'?'Retirement contribution':kind==='Business'?'Business investment':kind};
  // Money moved from another investment is the same capital, not a new investment.
  add('invested',Math.max(0,item.amount-item.reused),item.currency);
 }
 // A holding valued without a recorded purchase counts its first value as invested that day, as in the chart.
 for(const item of openingFunding(input.records,input.events,input.today).values()){
  if(!inPeriod(item.date))continue;
  context={name:item.name,date:item.date,category:'Recorded value · purchase not recorded'};
  add('invested',item.amount,item.currency);
 }
 const eventIds=new Set(activity.events.map(event=>event.id));
 const copied=new Set((input.cashflows??[]).map(row=>row.history_event_id).filter(Boolean));
 for(const event of activity.events){
  const record=records.get(event.record_id);
  if(!record||!inPeriod(event.occurred_on))continue;
  context={name:record.name,date:event.occurred_on,category:record.kind};
  if(benchmarkInvestment(record)&&event.event_type==='income')add('income',Number(event.amount),record.currency);
  // Older Tracker expenses and payments have no transaction copy; count them from the Tracker.
  // They carry no spending category, so they group under Other expense, not the holding's kind.
  else if(benchmarkInvestment(record)&&event.event_type==='expense'&&!copied.has(event.id))add('expenses',Number(event.amount),record.currency,'Other expense');
  else if(liabilities.includes(record.kind)&&event.event_type==='mortgage_payment'&&!(input.cashflows??[]).some(row=>row.mortgage_payment_id===event.id))add('expenses',Number(event.interest??Number(event.amount)-Number(event.principal)),record.currency,'Mortgage interest');
 }
 for(const row of benchmarkExpenseFunding(input.cashflows,input.today)){
  if(!inPeriod(row.date))continue;
  const source=(input.cashflows??[]).find(item=>'expense:'+item.id===row.id);
  const own=input.categories?.find(category=>category.id===source?.custom_category_id)?.name;
  context={name:row.name,date:row.date,category:source?.mortgage_payment_id?'Mortgage interest':own??row.kind};
  add('expenses',row.amount,row.currency);
 }
 // Actual cashflow rows include salary and other income. Linked Tracker
 // rows are counted once through their source event, not a second time here.
 const capitalized=capitalizedInterest(activity.events);
 for(const row of input.cashflows??[]){
  if(row.frequency!=='Once'||!row.date||!inPeriod(row.date))continue;
  context={name:row.name,date:row.date,category:row.kind};
  if(row.mortgage_payment_id&&!eventIds.has(row.mortgage_payment_id)){
   // The payment itself could not be read: its saved copy still carries the principal.
   context.category='Mortgage';
   add('invested',Number(row.payment_principal??Number(row.amount)-Number(row.payment_interest??0)),row.currency);
  }else if(income.includes(row.kind)&&!(row.history_event_id&&eventIds.has(row.history_event_id))&&!copiesCapitalizedInterest(row,capitalized))add('income',Number(row.amount),row.currency);
 }
 return {...totals,missing:[...missing]};
}
