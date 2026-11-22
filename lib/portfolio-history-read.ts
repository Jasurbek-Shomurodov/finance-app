// The net worth history read (/api/portfolio-history), without the request around it: which rows are asked for, in
// which order, and what is cut before it travels. Every owner row is read through `read`, which carries the signed-in
// person's token, so row security decides what comes back.
import type { FxPoint, PricePoint } from './benchmark-data';
import type { Entry } from './finance';
import { historyCurrencies } from './history-fx';
import { holdingPrices } from './holding-prices';
import { accountRepaymentEvents, type AccountRepayment, type BenchmarkMovement } from './investment-benchmarks';
import { historyCashflowColumns, trackedKinds, type HistoryEvent } from './investment-history';
import type { AccountOperation } from './net-worth-moves';

/** The columns of a balance event the charts read: the row without its owner. */
export const historyEventColumns = 'id,record_id,event_type,occurred_on,amount,balance,ownership_percentage,principal,interest,notes,created_at,account_link:investment_account_links(account_id,amount,account_currency,record_currency,exchange_rate,rate_date)';
/** A movement between two holdings, with each side's balance before and after it. */
export const historyMovementColumns = 'id,kind,source_id,target_id,sent,received,source_value,target_value,fee,occurred_on,notes,source_before,source_after,target_before,target_after,realized_gain,exchange_rate,rate_date,created_at';
/** An account operation: a transfer, a balance adjustment, a repayment or a mortgage payment. */
export const historyOperationColumns = 'id,action,account_id,target_id,amount,received,occurred_on,notes,created_at,before_balance,after_balance';
const incomeKinds = 'Salary,Rent%20income,Business%20income,Other%20income';
const expenseKinds = 'Rent%20expense,Living%20expense,Charity,Other%20expense';

export type HistoryReadDeps = {
 /** Every row of an owner-scoped query, in its order. A failed page throws, so nobody sees a partial history. */
 read: <T>(path: string) => Promise<T[]>;
 /** The signed-in person's preferred currencies: the ones a total can be shown in. */
 preferred: () => Promise<string[]>;
 /** A quoted holding's past closes (lib/holding-price-reader.ts). */
 closes: (series: string, start: string, end: string) => Promise<PricePoint[]>;
 /** The kept day rates of some currencies (lib/history-fx.ts). */
 rates: (from: string, to: string, currencies: readonly string[]) => Promise<FxPoint[]>;
 today: string;
};

/** A cash account changes with every transaction, and each change writes a balance snapshot: a busy account has several
 * a day, of which the history replays only the last. Those earlier same-day snapshots are dropped here, before they
 * travel. An account's first balance and every event that is more than a snapshot (a dated movement, a payment's link)
 * are kept. `events` are in the history's order: by day, then by the time they were saved. */
export function lastCashValuations(records: readonly Pick<Entry, 'id' | 'kind'>[], events: readonly HistoryEvent[]): HistoryEvent[] {
 const cash = new Set(records.filter(record => record.kind === 'Cash').map(record => record.id));
 const snapshot = (event: HistoryEvent) => cash.has(event.record_id) && event.event_type === 'valuation' && event.balance !== null && !event.account_link;
 const last = new Map<string, HistoryEvent>(), first = new Set<string>(), opened = new Set<string>();
 for (const event of events) {
  if (event.balance !== null && !opened.has(event.record_id)) { opened.add(event.record_id); first.add(event.id); }
  if (!snapshot(event)) continue;
  const key = event.record_id + ':' + event.occurred_on, latest = last.get(key);
  if (!latest || latest.created_at.localeCompare(event.created_at) <= 0) last.set(key, event);
 }
 return events.filter(event => !snapshot(event) || first.has(event.id) || last.get(event.record_id + ':' + event.occurred_on) === event);
}

type Activity = AccountRepayment & AccountOperation;
const byHistoryOrder = (a: HistoryEvent, b: HistoryEvent) => a.occurred_on.localeCompare(b.occurred_on) || String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id));

/** The first day a balance is recorded on, which is where the day rates start. */
function firstBalanceDay(events: readonly HistoryEvent[], today: string) {
 let first: string | undefined;
 for (const event of events) if (event.balance !== null && event.occurred_on <= today && !(first! <= event.occurred_on)) first = event.occurred_on;
 return first;
}

/** Everything the Overview charts read. The reads that do not depend on one another run together: the records, the
 * transactions, the operations, the movements and the preferred currencies first; then each batch of records' balance
 * events; then the closes and the day rates those events ask for. */
export async function readPortfolioHistory({ read, preferred, closes, rates, today }: HistoryReadDeps) {
 const [records, activity, cashflows, recurringIncome, movements, currencies] = await Promise.all([
  // Only current records enter the chart.
  read<Entry>(`/rest/v1/finance_records?kind=in.(${trackedKinds.map(encodeURIComponent).join(',')})&select=*&order=id.asc`),
  // Repayments saved from Accounts have no Tracker transaction; the chart reads them as one. Every operation also
  // carries its account's balance before and after, which dates the change on the operation's own day.
  read<Activity>(`/rest/v1/account_activity?select=${historyOperationColumns}&order=occurred_on.asc,created_at.asc,id.asc`),
  read<Entry>(`/rest/v1/finance_records?kind=in.(${incomeKinds},${expenseKinds})&frequency=eq.Once&select=${historyCashflowColumns}&order=date.asc,id.asc`),
  read<Entry>(`/rest/v1/finance_records?kind=in.(${incomeKinds})&frequency=neq.Once&select=${historyCashflowColumns}&order=date.asc,id.asc`),
  read<BenchmarkMovement>(`/rest/v1/asset_movements?select=${historyMovementColumns}&order=occurred_on.asc,created_at.asc,id.asc`),
  preferred().catch(() => [] as string[]),
 ]);
 const batches: string[] = [];
 for (let offset = 0; offset < records.length; offset += 100) batches.push(records.slice(offset, offset + 100).map(record => record.id).join(','));
 const history = await Promise.all(batches.map(ids => read<HistoryEvent>(`/rest/v1/investment_history?record_id=in.(${ids})&select=${historyEventColumns}&order=occurred_on.asc,created_at.asc,id.asc`)));
 const recorded = history.length > 1 ? history.flat().sort(byHistoryOrder) : history.flat();
 const events = [...lastCashValuations(records, recorded), ...accountRepaymentEvents(activity, records)];
 const operations: AccountOperation[] = activity.map(({ id, action, account_id, target_id, received, occurred_on, created_at, before_balance, after_balance }) => ({ id, action, account_id, target_id, received, occurred_on, created_at, before_balance, after_balance }));
 const from = firstBalanceDay(events, today);
 const wanted = historyCurrencies(currencies, records.map(record => record.currency), cashflows.flatMap(row => [row.currency, row.account_currency]));
 // Past closes for quoted holdings, so their value follows the market between edits (lib/holding-prices.ts), and each
 // past day's exchange rates, so a day is not restated at today's (lib/history-rates.ts).
 const [prices, fx] = await Promise.all([
  holdingPrices(records, events, today, closes),
  from ? rates(from, today, wanted).catch(() => [] as FxPoint[]) : Promise.resolve([] as FxPoint[]),
 ]);
 // Income receipts are already among the cash flows; the browser joins them to the schedules (`historyIncomeRecords`)
 // rather than receiving them twice.
 return { records, events, cashflows, recurringIncome, movements, operations, prices, fx, today };
}
