import { depositToday } from './deposit-interest';
import { expenses, income, liabilities, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { accountAmount } from './record-balance';

/** A balance change that belongs to an earlier day than the one its balance was written on. A transaction, a payment
 * from an account or a mortgage payment entered late carries its own date, but the account's (or the mortgage's) new
 * balance is a snapshot written on the day it was typed. `amount` is the change in the record's own currency, `date`
 * the day it happened and `entered` the day the snapshot shows it. */
export type BalanceMove = { record_id: string; date: string; entered: string; amount: number };
/** An account operation as the history read returns it: a mortgage payment or a repayment, with the paying account's
 * balance before and after. */
export type AccountOperation = { id: string; action: string; account_id: string; occurred_on: string; created_at?: string | null; before_balance: number | string; after_balance: number | string };
type MovesInput = { records: readonly Entry[]; events: readonly HistoryEvent[]; cashflows?: readonly Entry[]; operations?: readonly AccountOperation[] };

/** The calendar day a row was saved on, on the calendar the database dates balance snapshots by. */
function enteredDay(createdAt: unknown): string | null {
 if (typeof createdAt !== 'string' || !createdAt) return null;
 const time = new Date(createdAt);
 return Number.isFinite(time.getTime()) ? depositToday(time) : null;
}
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(.005, Math.abs(b) * 1e-9);

/** What a one-time transaction did to its cash account, in the account's currency; null when it did not move one.
 * Copies of a Tracker update, a mortgage payment, an operation's fee or a movement move cash through their source. */
function transactionChange(row: Entry, account: Entry | undefined): number | null {
 if (!account || row.frequency !== 'Once' || !row.date || row.history_event_id || row.mortgage_payment_id || row.operation_id || row.movement_id) return null;
 const sign = income.includes(row.kind) ? 1 : expenses.includes(row.kind) ? -1 : 0;
 if (!sign || (row.currency !== account.currency && row.account_exchange_rate == null)) return null;
 try { return sign * accountAmount(Number(row.amount), row.account_exchange_rate); } catch { return null; }
}

/** Collects the moves: a change is kept when it was entered after its day, on or before today, and the record has a
 * balance written on the entry day. An account's own dated movement that carries its balance (`ownMovement`) shows the
 * change on its day already, so that change is left where it is. */
function collector(events: readonly HistoryEvent[], today: string) {
 const snapshots = new Set<string>(), used = new Set<string>(), moves: BalanceMove[] = [];
 for (const event of events) if (event.balance !== null) snapshots.add(event.record_id + ':' + event.occurred_on);
 const shownOnItsDay = (accountId: string, date: string, amount: number) => {
  const own = events.find(event => !used.has(event.id) && event.record_id === accountId && event.occurred_on === date && event.balance !== null
   && event.event_type === (amount < 0 ? 'withdrawal' : 'contribution') && close(Number(event.amount), Math.abs(amount)));
  if (own) used.add(own.id);
  return !!own;
 };
 const add = (recordId: string, date: string, createdAt: unknown, amount: number, ownMovement = false) => {
  const entered = enteredDay(createdAt);
  if (!entered || !Number.isFinite(amount) || !amount || !(date < entered) || entered > today) return;
  if (ownMovement && shownOnItsDay(recordId, date, amount)) return;
  if (snapshots.has(recordId + ':' + entered)) moves.push({ record_id: recordId, date, entered, amount });
 };
 return { moves, add };
}

/** Every balance change entered after its own day, so the net worth history can show it on the day it happened instead
 * of the day it was typed. Only changes whose late snapshot is on record are listed: the record must have a balance
 * written on the entry day, and an operation that already wrote the balance on its own date is left alone. A change
 * dated after its entry (a transaction saved for a coming day) stays where its snapshot is. */
export function balanceMoves(input: MovesInput, today: string): BalanceMove[] {
 const byId = new Map(input.records.map(record => [record.id, record]));
 const cash = (id: string | null | undefined) => { const record = id ? byId.get(id) : undefined; return record?.kind === 'Cash' ? record : undefined; };
 const { moves, add } = collector(input.events, today);
 for (const row of input.cashflows ?? []) {
  const account = cash(row.account_id), amount = transactionChange(row, account);
  if (account && amount !== null) add(account.id, row.date, (row as { created_at?: unknown }).created_at, amount);
 }
 const linked = new Set<string>();
 for (const event of input.events) {
  // A repayment saved from Accounts is read as an operation below, with the account's exact balances.
  if (event.id.startsWith('repayment:')) continue;
  const account = cash(event.account_link?.account_id);
  if (account) { linked.add(event.id); add(account.id, event.occurred_on, event.created_at, Number(event.account_link!.amount), true); }
  // A mortgage payment entered late carries no balance of its own: the principal it paid came off on the entry day.
  if (event.event_type === 'mortgage_payment' && event.balance === null && liabilities.includes(byId.get(event.record_id)?.kind ?? '')) add(event.record_id, event.occurred_on, event.created_at, -Number(event.principal));
 }
 for (const row of input.operations ?? []) {
  const account = cash(row.account_id);
  if (account && ['mortgage', 'repayment'].includes(row.action) && !linked.has(row.id)) add(account.id, row.occurred_on, row.created_at, Number(row.after_balance) - Number(row.before_balance), true);
 }
 return moves;
}
