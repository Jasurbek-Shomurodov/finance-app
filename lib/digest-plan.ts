// What the morning digest shows of the month ahead: the month's budget against what was spent in its categories, the
// savings goal funded first, and the cash balance projected for the month's last day. Pure: the same budget lines,
// goal currency and cash forecast as the Budget, Goals and Forecast screens, so the digest never disagrees with them.
import {budgetLines,type BudgetSource} from './budget-forecast';
import {monthEnd} from './calendar-days';
import {cashForecast} from './cash-forecast';
import type {Entry} from './finance';
import {goalCurrency} from './goal-projection';
import type {DebtPayment,Goal,Occurrence} from './planning';
type Rates=Record<string,number>;
/** Spending by category key as lib/period-summary.ts writes it (`k:<kind>` or `c:<id>`), by the key Budget uses. */
const byBudgetKey=(spending:Record<string,number>)=>new Map(Object.entries(spending).map(([key,amount])=>[key.slice(2),amount]));
/** The month's spending budgets and what was spent in their categories so far, in `currency`; none without a budget or
 * when one cannot be converted. */
export function digestBudget(source:BudgetSource,month:string,currency:string,rates:Rates,spending:Record<string,number>){
 const {lines,missing}=budgetLines(source,month,currency,{USD:1,...rates});
 if(missing||!lines.length)return undefined;
 const spent=byBudgetKey(spending);
 return {total:lines.reduce((sum,line)=>sum+line.amount,0),spent:lines.reduce((sum,line)=>sum+line.categoryKeys.reduce((part,key)=>part+(spent.get(key)??0),0),0)};
}
/** The open savings goal to show: the one funded first, else the largest. A net-worth or investment goal tracks
 * something else than money set aside, so it is left out. It reads in its own currency. */
export function digestGoal(goals:readonly Goal[],records:readonly Entry[],fallback:string){
 const open=goals.filter(goal=>!goal.archived&&!goal.completed_on&&(goal.kind??'savings')==='savings'&&Number(goal.target)>0);
 const [goal]=open.sort((a,b)=>(a.funding_priority??Infinity)-(b.funding_priority??Infinity)||Number(b.target)-Number(a.target));
 return goal?{name:goal.name,saved:Number(goal.allocated),target:Number(goal.target),currency:goalCurrency(goal,{records},fallback)}:undefined;
}
/** The cash balance projected for the month's last day, and the first day it goes below zero; none without a cash
 * account or when an amount cannot be converted. */
export function digestForecast({records,occurrences,debtPayments,source,spending,today,currency,rates}:{records:Entry[];occurrences:Occurrence[];debtPayments:DebtPayment[];source?:BudgetSource;spending:Record<string,number>;today:string;currency:string;rates:Rates}){
 if(!records.some(record=>record.kind==='Cash'))return undefined;
 const all={USD:1,...rates},end=monthEnd(today.slice(0,7)),days=Math.round((Date.parse(end)-Date.parse(today))/86400000);
 const budget=source&&{linesFor:(month:string)=>budgetLines(source,month,currency,all),spent:byBudgetKey(spending)};
 const forecast=cashForecast({records,occurrences,debtPayments,...(budget?{budget}:{}),today,days,currency,rates:all});
 const [total]=forecast.totals;
 return forecast.missing||!total?undefined:{balance:total.end,belowZero:total.belowZero};
}
