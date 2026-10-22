// Where a month's money went besides spending, for the Telegram digest's Sankey: income by source, and the cash moved
// into investments, a mortgage's principal, other debts and money lent. Pure: it walks the same flows as the Cash flow
// screen (`periodFlows`), so the digest and the app never disagree about what counts.
import {periodFlows} from './cash-flow-drill';
import {assets,liabilities,type Entry} from './finance';
import {categoryKey} from './period-summary';
import type {PlanningData} from './planning';
import type {TransactionSplit} from './transaction-tools';
/** Account operations of the period: transfers and repayments, buys and sales, and cash moved in or out of the Tracker. */
export type MonthOperations=Pick<PlanningData,'activity'|'movements'|'investmentLinks'>;
export type MoneyDestination='invested'|'mortgage'|'debt'|'lent';
/** Income by category key (lib/period-summary.ts) and the net amount moved to each destination, in the display
 * currency; `missing` counts flows without a rate, so the split is not complete. */
export type MonthMoves={income:Record<string,number>;moved:Record<MoneyDestination,number>;missing:number};
/** Where money is kept to spend, as on the Cash flow screen: moving it between these is neither saving nor investing. */
const kept=new Set(['Cash','Deposit']);
function destinationOf(record:Entry|undefined):MoneyDestination|null{
 if(!record||kept.has(record.kind))return null;
 if(record.kind==='Mortgage')return 'mortgage';
 if(liabilities.includes(record.kind))return 'debt';
 if(record.kind==='Money lent')return 'lent';
 return assets.includes(record.kind)?'invested':null;
}
/** The month from the 1st of `from`'s month to `to`. Cash into a holding, a debt or a loan counts toward it, and cash
 * back out of one (a sale, a loan repaid to you) counts against it; moves between two holdings change nothing. */
export function monthMoves(records:Entry[],operations:MonthOperations,splits:TransactionSplit[],{from,to,currency,rates}:{from:string;to:string;currency:string;rates:Record<string,number>}):MonthMoves{
 const {flows,missing,byId}=periodFlows({data:{records,...operations},splits,months:[from.slice(0,7)],currency,today:to,rates:{USD:1,...rates},t:key=>key});
 const moves:MonthMoves={income:{},moved:{invested:0,mortgage:0,debt:0,lent:0},missing};
 for(const flow of flows){
  if('income' in flow.from){const key=categoryKey(flow.from.income);moves.income[key]=(moves.income[key]??0)+flow.value;continue;}
  if(!('account' in flow.from)||!('account' in flow.to))continue;
  const into=destinationOf(byId.get(flow.to.account)),out=destinationOf(byId.get(flow.from.account));
  if(into&&!out)moves.moved[into]+=flow.value;
  else if(out&&!into)moves.moved[out]-=flow.value;
 }
 return moves;
}
