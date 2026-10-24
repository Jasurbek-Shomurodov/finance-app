import type { InvestmentPortfolioInput } from './investment-portfolio';
import type { HistoryEvent } from './investment-history';
import { validDay } from './benchmark-data';
import { expenses, income } from './finance';
import { spendingAmount } from './spending';

export type ExpenseFunding={id:string;date:string;name:string;kind:string;amount:number;currency:string};
export type AccountRepayment={id:string;action:string;account_id:string;target_id:string|null;amount:number;occurred_on:string;notes:string;created_at?:string};
type Records=InvestmentPortfolioInput['records'];

// Actual one-time spending that "Including expenses" also invests. Tracker,
// fee and interest copies are the only record of that spending, so they count;
// a mortgage copy counts only its interest because its principal already funds
// through the mortgage payment event. Transfers are never expense records.
export function benchmarkExpenseFunding(cashflows:InvestmentPortfolioInput['cashflows'],today:string):ExpenseFunding[]{
 return (cashflows??[]).flatMap(row=>{
  if(!expenses.includes(row.kind)||row.frequency!=='Once'||!validDay(row.date)||row.date>today)return [];
  const amount=spendingAmount(row);
  return Number.isFinite(amount)&&amount>0?[{id:'expense:'+row.id,date:row.date,name:row.name,kind:row.kind,amount,currency:row.currency}]:[];
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}

// Income received from a held business or property is saved as a transaction linked to it, not as
// a history event. It is the holding's return paid out: the actual side counts it like a payout,
// and benchmarks never receive it. A copy of an income event is already counted through that event.
export function assetIncomePayouts(cashflows:InvestmentPortfolioInput['cashflows'],held:ReadonlySet<string>,events:readonly HistoryEvent[],today:string){
 const eventIds=new Set(events.map(e=>e.id));
 return (cashflows??[]).flatMap(row=>{
  const asset=row.business_id??row.income_source_id??row.property_id;
  if(!income.includes(row.kind)||row.frequency!=='Once'||!validDay(row.date)||row.date>today||!asset||!held.has(asset))return [];
  if(row.history_event_id&&eventIds.has(row.history_event_id))return [];
  const amount=Number(row.amount);
  return Number.isFinite(amount)&&amount>0?[{date:row.date,amount,currency:row.currency}]:[];
 }).sort((a,b)=>a.date.localeCompare(b.date));
}

// A repayment recorded from Accounts changes both balances but leaves no Tracker
// transaction. Present it as the same dated repayment the Tracker would have saved.
export function accountRepaymentEvents(activity:readonly AccountRepayment[],records:Records):HistoryEvent[]{
 const byId=new Map(records.map(row=>[row.id,row]));
 return activity.flatMap(row=>{
  const target=byId.get(row.target_id??'');
  if(row.action!=='repayment'||!target||!['Money lent','Loan','Debt'].includes(target.kind)||!(Number(row.amount)>0))return [];
  const amount=Number(row.amount);
  return [{id:'repayment:'+row.id,record_id:target.id,event_type:'withdrawal' as const,occurred_on:row.occurred_on,created_at:row.created_at??row.occurred_on,amount,balance:null,ownership_percentage:100,principal:0,interest:0,notes:row.notes,account_link:{account_id:row.account_id,amount:target.kind==='Money lent'?amount:-amount}}];
 });
}
