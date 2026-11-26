// Statement reconciliation's figures (components/planning/statement-reconciliation.tsx, migrations 066 and 172).
// An account's entry is reconciled once a reconciled statement cleared it, cleared while a draft has it ticked, and
// pending otherwise. Amounts add exactly (`decimalSum`), so a difference of 0 is 0, never a floating-point tail.
import {decimalSum} from './decimal-amounts';
import {shiftDay} from './calendar-days';

export type StatementLeg={key:string;date:string;name:string;amount:number};
export type SavedStatement={id:string;account_id:string;start_date:string;end_date:string;opening_balance:number;closing_balance:number;cleared:string[];fingerprint:string;status:'draft'|'reconciled';revision:number|null};
/** A reconciled entry that no longer reads as it did: removed (no `now_date`), a new amount, or dated after the statement. */
export type StatementChange={key:string;name:string;was_date:string;was_amount:number;now_date:string|null;now_amount:number|null};
export type StatementReview={
 entries:StatementLeg[];fingerprint:string;saved:SavedStatement[];from:string;to:string;
 /** The app's balance at the end of the day before `from`, and at the end of `to`, worked back from today's. */
 balance_before:number;balance_at_end:number;
 /** The last reconciled statement that closed before `from`. */
 previous:{id:string;end_date:string;closing_balance:number}|null;
 /** Each reconciled statement's changed entries, by statement id; a statement missing here still matches. */
 changes:Record<string,StatementChange[]>;
};
export type StatementStatus='reconciled'|'draft'|'changed';

export const statementStatus=(statement:SavedStatement,changes:StatementReview['changes']):StatementStatus=>
 statement.status==='draft'?'draft':changes[statement.id]?.length?'changed':'reconciled';

/** The newest reconciled statement, which says how far the account is reconciled. */
export const latestReconciled=(saved:SavedStatement[])=>saved.filter(s=>s.status==='reconciled').sort((a,b)=>b.end_date.localeCompare(a.end_date))[0]??null;

/** A new statement opens where the previous reconciled one closed, when it starts the day after; otherwise it is typed. */
export function openingBalance(review:Pick<StatementReview,'previous'|'from'>){
 const previous=review.previous;
 return previous&&shiftDay(previous.end_date,1)===review.from?Number(previous.closing_balance):null;
}

/** The statement's figures, and why the app's balance on the closing day differs from the bank's. The app balance
 * is the cleared balance, plus the entries still pending, plus balance changes that have no entry at all (an
 * opening balance that differs from the app's, or a balance typed over directly). */
export function statementFigures(entries:StatementLeg[],cleared:string[],opening:number,closing:number,appBalance:number){
 const ticked=new Set(cleared),amounts=entries.map(e=>({amount:Number(e.amount),cleared:ticked.has(e.key)}));
 const clearedBalance=decimalSum([opening,...amounts.filter(e=>e.cleared).map(e=>e.amount)]);
 const pending=decimalSum(amounts.filter(e=>!e.cleared).map(e=>e.amount));
 return {
  clearedBalance,pending,
  difference:decimalSum([closing,-clearedBalance]),
  withoutEntry:decimalSum([appBalance,-clearedBalance,-pending]),
 };
}
