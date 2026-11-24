import type { InvestmentPortfolioInput } from './investment-portfolio';
import type { PlanningData } from './planning';
import { accountRepaymentEvents, assetIncomePayouts, benchmarkExpenseFunding } from './investment-benchmarks-funding';
import type { BenchmarkData, PricePoint } from './benchmark-data';
import { priceScale } from './holding-prices';
import type { DiversifiedPortfolio } from './diversified-portfolio';
import type { HistoryEvent } from './investment-history';
import { compareInvestments, convertHistorical, type CashFlow, type WealthPoint } from './investment-comparison';
import { isInvestmentRecord } from './comparison-profile';
import { liabilities, value } from './finance';
import { convertAmount, marketEntry, marketRates } from './market';
import { marketHistoryStart, validDay } from './benchmark-data';
import { shiftDay } from './calendar-days';

export type FundingScope='investments'|'expenses';
export type ComparisonMethod={mode:'purchases'|'date';date:string;scope?:FundingScope};
export type BenchmarkMovement=NonNullable<PlanningData['movements']>[number]&{created_at?:string};
export type FundingDetail={id:string;date:string;name:string;amount:number;currency:string;reused:number;principal?:number;source?:'investment'|'expense'|'opening';kind?:string;/** Part of a purchase paid from income the investments already paid out: earnings staying invested, not new money. */fromIncome?:number};
/** `prices` are each quoted holding's past closes by record (`pricesByRecord`): between two snapshots its value follows them, as the net worth line does. */
export type DecisionInput=InvestmentPortfolioInput&{movements?:BenchmarkMovement[];method:ComparisonMethod;prices?:ReadonlyMap<string,readonly PricePoint[]>};
/** Money entering or leaving investments: a purchase or principal repayment funds benchmarks; a payout is proceeds or income paid out (`income` for earnings, not proceeds). */
export {accountRepaymentEvents,benchmarkExpenseFunding};
export type {ExpenseFunding,AccountRepayment} from './investment-benchmarks-funding';
export type ActivityItem={id:string;date:string;recordId:string;name:string;amount:number;currency:string;reused:number;principal?:number;payout?:boolean;income?:boolean};
type Records=InvestmentPortfolioInput['records'];
/** Market and exchange-rate history is requested from this day at the earliest. */
export const benchmarkHistoryStart=marketHistoryStart;
// Cash is never an investment holding here, even when marked for investments: its
// balance moves with salary and spending, which would appear as gains and losses.
export const benchmarkInvestment=(record:Records[number])=>record.kind!=='Cash'&&isInvestmentRecord(record);
const inOrder=(a:{date:string;time:string;id:string},b:{date:string;time:string;id:string})=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id);

export function benchmarkMethodStorageKey(owner:string){return 'finance:benchmark-method:'+owner;}
// Only the funding scope is kept in this browser; the tracking start is saved to the account.
// Choices saved before funding scopes lack `scope`; they keep excluding expenses.
export function readBenchmarkScope(storage:Pick<Storage,'getItem'>,owner:string):FundingScope|null{
 try{
  const saved=JSON.parse(storage.getItem(benchmarkMethodStorageKey(owner))??'null');
  if(!saved||typeof saved!=='object')return null;
  if(saved.scope===undefined)return 'investments';
  return ['investments','expenses'].includes(saved.scope)?saved.scope:null;
 }catch{return null;}
}

const eventOrder=(a:HistoryEvent,b:HistoryEvent)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id);
/** `events` grouped under `key`, each group in the events' own order; an event `key` returns null for is left out. */
function grouped(events:readonly HistoryEvent[],key:(event:HistoryEvent)=>string|null){
 const groups=new Map<string,HistoryEvent[]>();
 for(const event of events){
  const name=key(event);if(name===null)continue;
  const list=groups.get(name);if(list)list.push(event);else groups.set(name,[event]);
 }
 return groups;
}
const legKey=(recordId:string,type:string,date:string,amount:unknown,notes:string)=>[recordId,type,date,Number(amount),notes].join('\u0001');
/** The events a movement or a security transfer already accounts for. Older movement rows predate an explicit event
 * link: each leg is matched once by its complete financial identity (matching identical legs is interchangeable), and a
 * leg with no event is `missing`. The same security moved between two of the owner's holdings is still one position:
 * neither sale proceeds nor a fresh purchase. Events are indexed once, so a long history is not searched per movement. */
function pairedEvents(events:readonly HistoryEvent[],movements:readonly BenchmarkMovement[],byId:ReadonlyMap<string,Records[number]>){
 const paired=new Set<string>();let missing=false;
 const legs=grouped(events,e=>legKey(e.record_id,e.event_type,e.occurred_on,e.amount,e.notes));
 for(const row of movements){
  for(const [id,type,amount] of [[row.source_id,'withdrawal',row.source_value],[row.target_id,row.kind==='interest'?'income':'contribution',row.target_value]] as const){
   if(row.kind==='interest'&&type==='withdrawal')continue;
   const match=legs.get(legKey(id,type,row.occurred_on,amount,row.notes))?.find(e=>!paired.has(e.id));
   if(match)paired.add(match.id);else missing=true;
  }
 }
 const position=(e:HistoryEvent)=>{const r=byId.get(e.record_id);return r?[e.occurred_on,Number(e.amount),e.notes,r.kind,r.name,r.currency].join('\u0001'):null;};
 const arrivals=grouped(events,e=>e.event_type==='contribution'&&!e.account_link?position(e):null);
 for(const out of events){
  const from=byId.get(out.record_id);
  if(!from||paired.has(out.id)||out.event_type!=='withdrawal'||out.account_link||!out.notes.startsWith('Security transfer. ')||!['Stock','Crypto'].includes(from.kind))continue;
  const match=arrivals.get(position(out)!)?.find(e=>!paired.has(e.id)&&e.record_id!==out.record_id);
  if(match){paired.add(out.id);paired.add(match.id);}
 }
 return {paired,missing};
}
type Activity={items:ActivityItem[];events:HistoryEvent[];byId:Map<string,Records[number]>;missing:boolean};
// The chart, its start day and the period summary each ask for the same history's activity: the last answer is kept.
// A list that grew in place is not the same history, so the sizes are part of the question.
let lastActivity:{records:Records;events:InvestmentPortfolioInput['events'];movements:BenchmarkMovement[]|undefined;today:string;sizes:string;activity:Activity}|null=null;
// One classification of investment money, shared by the chart and the summary figures.
// Only an explicit investment source proves reuse. A shared cash account does
// not establish which earlier receipt funded a later purchase or repayment.
export function investmentActivity(records:Records,allEvents:InvestmentPortfolioInput['events'],allMovements:BenchmarkMovement[]|undefined,today:string):Activity{
 const sizes=records.length+':'+allEvents.length+':'+(allMovements?.length??-1);
 if(lastActivity&&lastActivity.records===records&&lastActivity.events===allEvents&&lastActivity.movements===allMovements&&lastActivity.today===today&&lastActivity.sizes===sizes)return lastActivity.activity;
 const activity=classifyActivity(records,allEvents,allMovements,today);
 lastActivity={records,events:allEvents,movements:allMovements,today,sizes,activity};
 return activity;
}
function classifyActivity(records:Records,allEvents:InvestmentPortfolioInput['events'],allMovements:BenchmarkMovement[]|undefined,today:string):Activity{
 const byId=new Map(records.map(row=>[row.id,row]));
 const events=allEvents.filter(e=>e.occurred_on<=today).sort(eventOrder);
 const movements=(allMovements??[]).filter(row=>row.occurred_on<=today);
 const pairs=pairedEvents(events,movements,byId),paired=pairs.paired;let missing=pairs.missing;
 const timeline=[
  ...events.filter(row=>!paired.has(row.id)).map(row=>({type:'event' as const,date:row.occurred_on,time:row.created_at,id:row.id,row})),
  ...movements.map(row=>({type:'movement' as const,date:row.occurred_on,time:row.created_at??row.occurred_on,id:row.id,row})),
 ].sort(inOrder);
 const items:ActivityItem[]=[];
 for(const item of timeline){
  if(item.type==='event'){
   const e=item.row,r=byId.get(e.record_id);if(!r)continue;
   const entry={id:e.id,date:e.occurred_on,recordId:r.id,name:r.name,currency:r.currency,reused:0};
   if(benchmarkInvestment(r)&&e.event_type==='contribution')items.push({...entry,amount:Number(e.amount)});
   else if(benchmarkInvestment(r)&&['withdrawal','income'].includes(e.event_type))items.push({...entry,amount:Number(e.amount),payout:true,...(e.event_type==='income'?{income:true}:{})});
   else if(liabilities.includes(r.kind)&&['mortgage_payment','withdrawal'].includes(e.event_type)){
    const paid=e.event_type==='mortgage_payment'?Number(e.principal):Number(e.amount);
    items.push({...entry,amount:paid,principal:paid});
   }
  }else{
   const m=item.row,a=byId.get(m.source_id),b=byId.get(m.target_id);if(!a||!b){missing=true;continue;}
   if(m.kind==='interest')continue;
   const entry={id:m.id,date:m.occurred_on,recordId:b.id,name:b.name,currency:b.currency};
   if(b.kind==='Cash'&&benchmarkInvestment(a))items.push({...entry,amount:Number(m.target_value),reused:0,payout:true});
   else if(benchmarkInvestment(b)){const cost=Math.max(0,Number(m.target_value)-(m.kind==='buy'?Number(m.fee):0));items.push({...entry,amount:cost,reused:benchmarkInvestment(a)&&Number(m.sent)>0?cost:0});}
  }
 }
 return {items,events,byId,missing};
}

// Inspect coverage before requesting market data. Unknown purchase costs can
// still support a clearly labeled valuation-based comparison.
export function investmentComparisonCoverage(records:Records,events:InvestmentPortfolioInput['events'],today:string){
 const missing:string[]=[];const dates:string[]=[];
 const held=new Map(records.filter(benchmarkInvestment).map(record=>[record.id,record]));
 // Each holding's events, read once: its first purchase, whether any balance is recorded, its first positive value.
 const seen=new Map<string,{purchase?:string;valued:boolean;observed?:string}>();
 let earliest:string|undefined;
 for(const e of events.filter(e=>e.occurred_on<=today&&held.has(e.record_id)).sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at))){
  earliest??=e.occurred_on;
  let facts=seen.get(e.record_id);if(!facts)seen.set(e.record_id,facts={valued:false});
  if(e.event_type==='contribution')facts.purchase??=e.occurred_on;
  if(e.balance!==null){facts.valued=true;if(Number(e.balance)>0)facts.observed??=e.occurred_on;}
 }
 for(const record of held.values()){
  const facts=seen.get(record.id);
  if(!facts?.valued){missing.push(record.name);dates.push(today);continue;}
  // Value that appears without a purchase is an observation, including the
  // first value entered for a holding that was created empty.
  if(facts.observed&&(!facts.purchase||facts.purchase>facts.observed)){
   missing.push(record.name);dates.push(facts.observed);
  }
 }
 return {missing:[...new Set(missing)],start:dates.sort().at(-1)??earliest??today};
}

// From original purchases, the comparison opens on the first day investment money moved:
// the earliest holding history, repayment or, when spending funds benchmarks, expense.
// Cash accounts and the day a debt was opened are not investment activity.
export function purchaseComparisonStart(input:Pick<DecisionInput,'records'|'events'|'movements'|'cashflows'|'today'>,scope:FundingScope){
 const activity=investmentActivity(input.records,input.events,input.movements,input.today);
 const holding=activity.events.find(e=>{const r=activity.byId.get(e.record_id);return !!r&&benchmarkInvestment(r);})?.occurred_on;
 const funded=activity.items.map(item=>item.date).sort()[0];
 const spent=scope==='expenses'?benchmarkExpenseFunding(input.cashflows,input.today)[0]?.date:undefined;
 return [holding,funded,spent].filter((date):date is string=>!!date).sort()[0]??input.today;
}

// A holding valued before any purchase was recorded holds capital that was already invested:
// its first recorded value counts as invested on the day it was recorded, so it is never a gain.
// The chart funds benchmarks with it and the period summary counts it as money invested.
export function openingFunding(records:Records,events:InvestmentPortfolioInput['events'],today:string){
 const byId=new Map(records.map(row=>[row.id,row]));
 const rows=events.filter(e=>e.occurred_on<=today).sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 const purchases=new Map<string,string>(),valued=new Set<string>(),openings=new Map<string,FundingDetail&{recordId:string}>();
 for(const e of rows)if(e.event_type==='contribution'&&!purchases.has(e.record_id))purchases.set(e.record_id,e.occurred_on);
 for(const e of rows){
  const r=byId.get(e.record_id);
  if(!r||!benchmarkInvestment(r)||e.balance===null||!(Number(e.balance)>0)||valued.has(r.id))continue;
  valued.add(r.id);
  if((purchases.get(r.id)??'9999')>e.occurred_on)openings.set(e.id,{id:'opening:'+e.id,date:e.occurred_on,recordId:r.id,name:r.name,amount:Number(e.balance)*Number(e.ownership_percentage)/100,currency:r.currency,reused:0,source:'opening'});
 }
 return openings;
}

/** The day benchmark comparisons start from. They cannot precede the first recorded investment: there is no value to compare from that day.
 * A start saved earlier than that compares from the first investment day (the saved day itself is kept and shown); a future one is ignored. */
export function effectiveTrackingStart(trackingStart:string|null,firstInvestment:string,today:string){
 if(!trackingStart||trackingStart>today)return null;
 return trackingStart<firstInvestment?firstInvestment:trackingStart;
}

/** How benchmarks are compared for a saved tracking start. A start on or before the first investment day compares
 * from original purchases on that day: nothing was invested earlier, so opening holdings and that day's principal
 * repayments fund benchmarks exactly as the period summary counts them. A later start compares from the value that day. */
export function comparisonMethod(trackingStart:string|null,purchaseStart:string,today:string,scope:FundingScope){
 // Market history is limited. Earlier purchases compare from recorded values on its first day.
 const earliestStart=purchaseStart<benchmarkHistoryStart?benchmarkHistoryStart:purchaseStart;
 const trackingFrom=effectiveTrackingStart(trackingStart,earliestStart,today);
 const beforeMarketHistory=!trackingFrom&&purchaseStart<benchmarkHistoryStart;
 const method:ComparisonMethod=trackingFrom&&trackingFrom>purchaseStart?{mode:'date',date:trackingFrom,scope}:beforeMarketHistory?{mode:'date',date:earliestStart,scope}:{mode:'purchases',date:purchaseStart,scope};
 // The saved day is earlier than the day comparisons can start: the settings say so instead of contradicting the picker.
 const chosenEarlier=method.mode==='purchases'&&!!trackingStart&&trackingStart<method.date;
 return {method,trackingFrom,earliestStart,beforeMarketHistory,chosenEarlier};
}

export function investmentDecisionComparison(input:DecisionInput,data:BenchmarkData,portfolio?:DiversifiedPortfolio|null){
 const scope=input.method.scope??'investments',dated=input.method.mode==='date';
 const activity=investmentActivity(input.records,input.events,input.movements,input.today);
 const {byId,items}=activity;let missing=activity.missing;
 const assets=input.records.filter(benchmarkInvestment);
 const held=new Set(assets.map(row=>row.id));
 const events=activity.events.filter(e=>held.has(e.record_id));
 const spending=scope==='expenses'?benchmarkExpenseFunding(input.cashflows,input.today):[];
 const earned=assetIncomePayouts(input.cashflows,held,activity.events,input.today);
 const start=dated?input.method.date:purchaseComparisonStart(input,scope);
 if(!validDay(start)||start>input.today||start<data.start)return null;
 // From a dated start, that day's holdings are in the starting value; a principal repayment that day is not, so it funds benchmarks.
 const counted=(date:string,repayment=false)=>date>start||((!dated||repayment)&&date===start);
 const balances=new Map<string,number>(),cost=new Map<string,number>();
 // `own` is the money put in from outside the investments, without the spending that "Including expenses" also funds.
 const flows:CashFlow[]=[],own:CashFlow[]=[],details:FundingDetail[]=[],points:WealthPoint[]=[];
 const observed=new Set<string>();let principal=0,payouts=0,cursor=0,next=0,spent=0,paid=0,seeded=false;
 // Income the investments paid out and not yet put back in. A later purchase spends it first, in any holding:
 // that part is earnings staying invested, so no benchmark receives it and the actual side does not count it twice.
 let earnings=0,reinvested=0;
 const usd=(amount:number,currency:string,date:string)=>{const converted=convertHistorical(amount,currency,'USD',date,data.fx);if(converted===null||!Number.isFinite(converted)){missing=true;return 0;}return converted;};
 const fund=(id:string,date:string,name:string,amount:number,currency:string,reused=0,principalPaid?:number,expenseKind?:string,opening=false,fromIncome=0)=>{
  if(!counted(date,principalPaid!==undefined))return;
  const fresh=Math.max(0,amount-reused-fromIncome),converted=usd(fresh,currency,date);
  if(converted>0){flows.push({date,amount:converted});if(expenseKind===undefined)own.push({date,amount:converted});}
  if(amount>0)details.push({id,date,name,amount:fresh,currency,reused,...(fromIncome>0?{fromIncome}:{}),...(principalPaid===undefined?{}:{principal:principalPaid}),...(expenseKind===undefined?{}:{source:'expense' as const,kind:expenseKind}),...(opening?{source:'opening' as const}:{})});
 };
 // How much of a purchase the unspent earnings cover, in the purchase's own currency.
 const fromEarnings=(item:ActivityItem)=>{
  if(item.principal!==undefined||!counted(item.date)||!(earnings>0))return 0;
  const cost=Math.max(0,item.amount-item.reused),converted=usd(cost,item.currency,item.date);
  if(!(converted>0))return 0;
  const used=Math.min(earnings,converted);earnings-=used;reinvested+=used;
  return cost*used/converted;
 };
 const openings=openingFunding(input.records,input.events,input.today);
 // A quoted holding is carried from its latest snapshot by its price, exactly as the net worth history carries it:
 // a benchmark line is net worth with these holdings swapped out, so both must value them alike on every day.
 const scale=priceScale(input.prices??new Map());
 const opening=new Map<string,HistoryEvent>(),firstBalance=new Map<string,HistoryEvent>();
 for(const e of events){
  if(!opening.has(e.record_id))opening.set(e.record_id,e);
  if(e.balance!==null&&!firstBalance.has(e.record_id))firstBalance.set(e.record_id,e);
 }
 // A holding joins the comparison on the day its history begins. Earlier days do not include it:
 // nothing is known about it then, and one new record must not erase every other holding's history.
 const absentBefore=(id:string,date:string)=>{
  const first=opening.get(id);
  return !!first&&!!firstBalance.get(id)&&first.occurred_on>date;
 };
 const firstDate=[events[0]?.occurred_on,items[0]?.date,start].filter((date):date is string=>!!date).sort()[0];
 for(let date=firstDate;date<=input.today;date=shiftDay(date,1)){
  // Spending funds benchmarks only; it never adds to actual holdings or proceeds.
  while(spent<spending.length&&spending[spent].date<=date){const row=spending[spent++];fund(row.id,row.date,row.name,row.amount,row.currency,0,undefined,row.kind);}
  while(paid<earned.length&&earned[paid].date<=date){const row=earned[paid++];if(counted(row.date)){const amount=usd(row.amount,row.currency,row.date);payouts+=amount;earnings+=amount;}}
  while(cursor<events.length&&events[cursor].occurred_on<=date){
   const e=events[cursor++];
   if(e.balance!==null){
    const balance=Number(e.balance)*Number(e.ownership_percentage)/100;
    // Value recorded without a purchase: benchmarks receive the same amount on the same day.
    const first=openings.get(e.id);
    if(first){observed.add(e.record_id);fund(first.id,first.date,first.name,first.amount,first.currency,0,undefined,undefined,true);}
    balances.set(e.record_id,balance);scale.anchor(e.record_id,e.occurred_on);
   }else if(!balances.has(e.record_id)&&['contribution','withdrawal'].includes(e.event_type)){
    // Bought but not yet valued: carry the money put in until the first recorded value.
    cost.set(e.record_id,Math.max(0,(cost.get(e.record_id)??0)+(e.event_type==='contribution'?1:-1)*Number(e.amount)));
   }
  }
  while(next<items.length&&items[next].date<=date){
   const item=items[next++];
   if(!counted(item.date,item.principal!==undefined))continue;
   if(item.payout){const amount=usd(item.amount,item.currency,item.date);payouts+=amount;if(item.income)earnings+=amount;continue;}
   if(item.principal!==undefined)principal+=usd(item.principal,item.currency,item.date);
   fund(item.id,item.date,item.name,item.amount,item.currency,item.reused,item.principal,undefined,false,fromEarnings(item));
  }
  if(date<start)continue;
  let total=0;
  for(const r of assets){
   const recorded=balances.get(r.id),balance=recorded===undefined?cost.get(r.id):recorded*scale.factor(r.id,date);
   if(balance===undefined){if(!absentBefore(r.id,date))missing=true;continue;}
   const live=date===input.today?marketEntry(r,r.currency,input.market):null;
   total+=usd(live?value(live):balance,r.currency,date);
  }
  if(dated&&!seeded){
   flows.push({date,amount:total});own.push({date,amount:total});details.push({id:'opening',date,name:'Starting investment value',amount:total,currency:'USD',reused:0});seeded=true;
  }
  points.push({date,amount:total+principal+payouts-reinvested});
 }
 if(missing)return null;
 const compared=compareInvestments(0,flows,points,{...data,start},'USD',true,portfolio);
 // Each day also carries `invested`: the money put in up to that day, for splitting a period's change into returns and new money.
 const rates=marketRates(input.market)??{};
 if(convertAmount(1,'USD',input.currency,rates)===null)return null;
 // Each day leaves USD at that day's rate, the one it entered at: a UZS deposit shown in UZS only grows,
 // instead of moving with today's dollar. Today's live rate covers a day the feed has no rate for.
 const shown=(amount:number,date:string)=>convertHistorical(amount,'USD',input.currency,date,data.fx)??convertAmount(amount,'USD',input.currency,rates)!;
 // Money put in is a sum of dated amounts: each counts at its own day's rate and never moves afterwards, so a change in
 // the exchange rate is not read as new money. `contributed` is all benchmark funding, `invested` the part from outside.
 const running=(list:CashFlow[])=>{
  const sorted=list.filter(flow=>flow.date<=data.end).sort((a,b)=>a.date.localeCompare(b.date));
  let index=0,total=0;
  return (date:string)=>{while(index<sorted.length&&sorted[index].date<=date){total+=shown(sorted[index].amount,sorted[index].date);index++;}return total;};
 };
 const contributedBy=running(flows),investedBy=running(own);
 const shownPoints=compared.points.map(point=>({...Object.fromEntries(Object.entries(point).map(([key,amount])=>[key,key==='date'||amount===null?amount:shown(Number(amount),point.date)])),contributed:contributedBy(point.date),invested:investedBy(point.date)}) as typeof point&{invested:number});
 // The starting value adds every holding, so it reads in the display currency like any other total.
 const shownDetails=details.map(detail=>detail.id==='opening'?{...detail,amount:shown(detail.amount,detail.date),currency:input.currency}:detail);
 return {missingPurchases:[...observed].map(id=>byId.get(id)!.name),details:shownDetails,result:{...compared,points:shownPoints}};
}
