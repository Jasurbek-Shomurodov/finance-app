// Tests load this module directly, so it has no imports; tests/more-asset-kinds.mjs checks these lists equal lib/finance.ts.
const interestKinds = ['Deposit','Treasury bill','Bond'], simpleInterestKinds = ['Treasury bill','Bond'];
const unitPricedKinds = ['Stock','Crypto','Precious metals','Equity compensation'];
const valuedKinds = ['Property','Business','Valuables','Vehicle','Retirement account'];
export const trackedKinds: readonly string[] = ['Cash','Stock','Crypto','Precious metals','Equity compensation','Deposit','Treasury bill','Bond','Retirement account','Property','Business','Vehicle','Valuables','Money lent','Mortgage','Loan','Debt'];
/** The columns of a transaction or income schedule the Overview charts read (/api/portfolio-history): the expense and
 * income funding of the benchmarks, the period summary, the income chart's receipts and monthly estimates, and the
 * rates each one converts at. A full row is about 60 columns, which made the read megabytes for a long history. */
export const historyCashflowColumns = 'id,name,kind,amount,currency,date,frequency,recurrence_days,end_date,source_paused,archived,archive_pauses,business_id,income_source_id,property_id,history_event_id,mortgage_payment_id,payment_principal,payment_interest,account_currency,account_exchange_rate,day_rates';
export const historyKindGroups = { interestKinds, simpleInterestKinds, unitPricedKinds, valuedKinds };
export type HistoryEvent = {
 id:string; record_id:string; event_type:'baseline'|'valuation'|'contribution'|'withdrawal'|'income'|'expense'|'mortgage_payment';
 occurred_on:string; amount:number; balance:number|null; ownership_percentage:number; principal:number; interest:number; notes:string; created_at:string;
 account_link?:{account_id:string;amount:number;account_currency?:string|null;record_currency?:string|null;exchange_rate?:number|null;rate_date?:string|null}|null;
 /** A payment linked to the asset (`assetPaymentEvents`), as it was entered; its row is the transaction itself. */
 entered?:{amount:number;currency:string;name:string};
};
/** A row of the Tracker's list. A linked payment no rate converts has no amount in the asset's currency: null, never 0. */
export type TrackerEvent = Omit<HistoryEvent,'amount'> & { amount:number|null };
const historyLabels: Record<HistoryEvent['event_type'],string> = {
 baseline:'Starting snapshot',valuation:'Value update',contribution:'Money invested',withdrawal:'Sale / withdrawal',income:'Income received',expense:'Expense paid',mortgage_payment:'Mortgage payment',
};
export type HistoryUpdateType = Exclude<HistoryEvent['event_type'], 'baseline'|'mortgage_payment'>;
export const isLendingKind = (kind:string) => ['Debt','Loan','Money lent','Mortgage'].includes(kind);
// Borrowing brings cash in; lending it out and repaying our own debt use cash.
export function historyCashDelta(kind:string,type:HistoryUpdateType,amount:number):number {
 if(type==='valuation')return 0;
 if(['Debt','Loan','Mortgage'].includes(kind))return type==='contribution'?amount:-amount;
 return ['income','withdrawal'].includes(type)?amount:-amount;
}
export function historyUpdateTypes(kind:string):HistoryUpdateType[] {
 if(kind==='Mortgage')return ['contribution'];
 if(isLendingKind(kind))return ['contribution','withdrawal'];
 if(kind==='Cash')return ['valuation'];
 if([...interestKinds,...unitPricedKinds].includes(kind))return ['valuation','income','expense'];
 if(valuedKinds.includes(kind))return ['valuation','contribution','withdrawal','income','expense'];
 return [];
}
export function historyEventLabel(kind:string,type:HistoryEvent['event_type']):string {
 if(isLendingKind(kind)){
  if(type==='valuation'&&kind==='Mortgage')return 'Balance update';
  if(type==='valuation')return 'Balance correction';
  if(type==='contribution')return kind==='Money lent'?'Lend more':kind==='Debt'?'Add to debt':'Additional borrowing';
  if(type==='withdrawal')return kind==='Money lent'?'Repayment received':'Repayment made';
 }
 if(type==='valuation'&&['Cash',...interestKinds].includes(kind))return 'Balance update';
 if(type==='income')return kind==='Bond'?'Coupon received':interestKinds.includes(kind)||kind==='Money lent'?'Interest received':kind==='Stock'||kind==='Equity compensation'?'Dividends / income':kind==='Property'?'Rent income':historyLabels[type];
 if(type==='contribution')return kind==='Deposit'||kind==='Cash'?'Top-up':kind==='Retirement account'?'Contribution':unitPricedKinds.includes(kind)||simpleInterestKinds.includes(kind)?'Buy':historyLabels[type];
 if(type==='withdrawal')return simpleInterestKinds.includes(kind)?'Redeem':kind==='Deposit'||kind==='Cash'?'Withdraw':unitPricedKinds.includes(kind)?'Sell / convert':historyLabels[type];
 return historyLabels[type];
}
/** A row headed by the money that moved; a baseline or valuation is headed by the value it set. */
export const historyEventMovesCash = (event:Pick<TrackerEvent,'event_type'|'amount'|'entered'>) => !!event.entered||!['baseline','valuation'].includes(event.event_type)&&Number(event.amount)>0;
/** Tracker updates and linked payments in one dated list, oldest first. */
export const byHistoryDate = (a:TrackerEvent,b:TrackerEvent) => a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id);
/** Contributions and receipts are null once a linked payment no rate converts is among them: unknown, never short.
 * `balance` is your share; `fullBalance` and `ownership` are the whole asset's value and the share it was valued at. */
export function historySeries(events:TrackerEvent[]) {
 const sorted=[...events].sort(byHistoryDate);
 let fullBalance:number|null=null, ownership=100;
 let balance:number|null=null, contributions:number|null=0, additions=0, repayments=0, receipts:number|null=0, expenses=0, principal=0, interest=0;
 const days=new Map<string,{date:string;timestamp:number;balance:number|null;contributions:number|null;receipts:number|null}>();
 const plus=(sum:number|null,amount:number|null)=>sum===null||amount===null?null:sum+Number(amount);
 for(const e of sorted){
  if(e.balance!==null){fullBalance=Number(e.balance);ownership=Number(e.ownership_percentage);balance=fullBalance*ownership/100;}
  if(e.event_type==='contribution'){contributions=plus(contributions,e.amount);additions+=Number(e.amount);}
  if(e.event_type==='withdrawal'){contributions=plus(contributions,e.amount===null?null:-e.amount);repayments+=Number(e.amount);}
  if(e.event_type==='income')receipts=plus(receipts,e.amount);
  if(e.event_type==='expense')expenses+=Number(e.amount);
  if(e.event_type==='mortgage_payment'){principal+=Number(e.principal);interest+=Number(e.interest);}
  days.set(e.occurred_on,{date:e.occurred_on,timestamp:Date.parse(e.occurred_on+'T00:00:00Z'),balance,contributions,receipts});
 }
 return {points:[...days.values()],balance,fullBalance,ownership,contributions,additions,repayments,receipts,expenses,principal,interest,missing:contributions===null||receipts===null};
}

// Convert chart coordinates back to stored date-only values before shared display formatting.
export const historyChartDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0,10);
