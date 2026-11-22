// A cash account's past balances, rebuilt from what is on record today. The database writes a balance snapshot on the
// day an account changes, so deleting or editing an old transaction changes the balance today while the snapshots in
// between still hold the old transaction: the net worth line dipped from the transaction's day until the day it was
// corrected. Where an account's ledger is complete, its history is its balance today walked backwards through the dated
// changes that are still on record, and those stale snapshots are not read at all.
import type { Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { balanceMoves, transactionChange, type BalanceMove, type MovesInput } from './net-worth-moves';

/** A movement between two of the owner's records, with each side's balance before and after (amounts for cash). A
 * movement read without them leaves its accounts unexplained, so they keep their snapshots. */
export type LedgerMovement = { id: string; kind: string; source_id: string; target_id: string; occurred_on: string; created_at?: string | null; source_before?: number | string | null; source_after?: number | string | null; target_before?: number | string | null; target_after?: number | string | null };
export type LedgerInput = MovesInput & { movements?: readonly LedgerMovement[] };
/** One dated change of an account, in its own currency; `entered` is when it was saved (milliseconds), when known. */
type Change = { date: string; amount: number; entered: number | null };

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(.005, Math.abs(b) * 1e-9);
const savedAt = (value: unknown) => { const time = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(time) ? time : null; };
const inOrder = (a: HistoryEvent, b: HistoryEvent) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/** Every dated change of every cash account that is still on record: its transactions, the payments made from it, its
 * transfers, repayments, mortgage payments and balance adjustments, and the movements between it and another holding.
 * A transaction saved by one of those (a fee, a Tracker copy) moves the account through it and is not counted again. */
function accountChanges(input: LedgerInput, cash: ReadonlyMap<string, Entry>): Map<string, Change[]> {
 const changes = new Map<string, Change[]>([...cash.keys()].map(id => [id, []]));
 const add = (id: string | null | undefined, date: string, amount: number, createdAt: unknown) => {
  const list = id ? changes.get(id) : undefined;
  if (list && amount) list.push({ date, amount, entered: savedAt(createdAt) });
 };
 for (const row of input.cashflows ?? []) {
  const amount = transactionChange(row, cash.get(row.account_id ?? ''));
  if (amount !== null) add(row.account_id, row.date, amount, (row as { created_at?: unknown }).created_at);
 }
 const linked = new Set<string>();
 for (const event of input.events) {
  // A repayment saved from Accounts is read as an operation below, with the account's exact balances.
  if (event.id.startsWith('repayment:') || !event.account_link || !cash.has(event.account_link.account_id)) continue;
  linked.add(event.id);
  add(event.account_link.account_id, event.occurred_on, Number(event.account_link.amount), event.created_at);
 }
 for (const row of input.operations ?? []) {
  if (linked.has(row.id)) continue;
  add(row.account_id, row.occurred_on, Number(row.after_balance) - Number(row.before_balance), row.created_at);
  if (row.action === 'transfer') add(row.target_id, row.occurred_on, Number(row.received), row.created_at);
 }
 for (const row of input.movements ?? []) {
  if (row.kind !== 'interest') add(row.source_id, row.occurred_on, Number(row.source_after ?? NaN) - Number(row.source_before ?? NaN), row.created_at);
  add(row.target_id, row.occurred_on, Number(row.target_after ?? NaN) - Number(row.target_before ?? NaN), row.created_at);
 }
 return changes;
}

/** One account's balance at the end of each day it changed, from `current` backwards. `changes` are the ones saved
 * after the opening balance; one dated before the opening day is already part of that day's balance. */
function walkBack(account: Entry, opening: HistoryEvent, changes: readonly Change[], today: string): HistoryEvent[] {
 const byDay = new Map<string, number>();
 for (const change of changes) {
  if (change.date <= opening.occurred_on) continue;
  const day = change.date > today ? today : change.date;
  byDay.set(day, (byDay.get(day) ?? 0) + change.amount);
 }
 const at = (date: string, balance: number, event_type: HistoryEvent['event_type']): HistoryEvent => ({ id: 'ledger:' + account.id + ':' + date, record_id: account.id, event_type, occurred_on: date, created_at: date, amount: 0, balance, ownership_percentage: 100, principal: 0, interest: 0, notes: '' });
 const events: HistoryEvent[] = [];
 let balance = Number(account.amount);
 for (const day of [...byDay.keys()].sort().reverse()) {
  events.push(at(day, balance, 'valuation'));
  balance -= byDay.get(day)!;
 }
 events.push(at(opening.occurred_on, balance, opening.event_type));
 return events.reverse();
}

/** The balance events the net worth history replays, and the accounts rebuilt in them. An account is rebuilt only when
 * its ledger is complete: its opening balance plus every change saved since comes to the balance it has today. Then
 * nothing moved it that the records do not explain, and its past is today's balance less each later change. An account
 * that does not add up (a balance typed over, a payment at an unknown rate, a row the read did not return), or one with
 * no change on record at all, keeps its recorded snapshots as they are. Events that carry no balance, and every other record's events, pass through. */
export function cashLedgers(input: LedgerInput, today: string): { events: HistoryEvent[]; rebuilt: Set<string> } {
 const cash = new Map(input.records.filter(record => record.kind === 'Cash').map(record => [record.id, record]));
 const openings = new Map<string, HistoryEvent>();
 for (const event of input.events) {
  if (event.balance === null || event.occurred_on > today || !cash.has(event.record_id)) continue;
  const first = openings.get(event.record_id);
  if (!first || inOrder(event, first) < 0) openings.set(event.record_id, event);
 }
 const rebuilt = new Set<string>(), ledger: HistoryEvent[] = [];
 for (const [id, changes] of accountChanges(input, cash)) {
  const account = cash.get(id)!, opening = openings.get(id), current = Number(account.amount);
  if (!opening || !Number.isFinite(current)) continue;
  // A change saved before the opening balance was written is already inside it.
  const opened = savedAt(opening.created_at);
  const since = changes.filter(change => opened === null || change.entered === null || change.entered >= opened);
  const explained = Number(opening.balance) + since.reduce((sum, change) => sum + change.amount, 0);
  // With no change on record there is nothing to walk through, and a balance typed up and back down would read as
  // "nothing happened": such an account keeps its snapshots.
  if (!since.length || !Number.isFinite(explained) || !close(explained, current)) continue;
  rebuilt.add(id);
  ledger.push(...walkBack(account, opening, since, today));
 }
 if (!rebuilt.size) return { events: [...input.events], rebuilt };
 return { events: [...input.events.filter(event => event.balance === null || !rebuilt.has(event.record_id)), ...ledger], rebuilt };
}

/** What the net worth history replays: each record's balance events, with complete cash accounts rebuilt from their
 * ledgers, and the late-entered changes of every other record moved to their own day (`balanceMoves`). */
export function netWorthBalances(input: LedgerInput, today: string): { events: HistoryEvent[]; moves: BalanceMove[]; rebuilt: Set<string> } {
 const { events, rebuilt } = cashLedgers(input, today);
 return { events, moves: balanceMoves(input, today, rebuilt), rebuilt };
}
