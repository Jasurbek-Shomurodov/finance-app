import { shiftMonth } from './calendar-days';
import { periodFlows, span, type DrillContext } from './cash-flow-drill';
import { decimalSum } from './decimal-amounts';
import { expenses, income, type Entry } from './finance';
import { convertAmount } from './market';
import type { PlanningData } from './planning';
import { compareRecordDates } from './record-dates';
import { signedAmount } from './transaction-list';

/** What an account operation and a movement between accounts are called, on Recent activity and in an account's panel. */
export const operationLabels: Record<string, string> = { transfer: 'Transfer money', reconcile: 'Reconcile balance', repayment: 'Record repayment', mortgage: 'Record mortgage payment' };
export const movementLabels = { transfer: 'Transfer money', buy: 'Buy holding', sell: 'Sell / convert holding', interest: 'Record capitalized interest' } as const;

export type StoryData = Pick<PlanningData, 'records' | 'activity' | 'investmentLinks' | 'movements'>;
/** The records an account's story is told from, in `currency` (the display currency) at `rates`. */
export type StoryContext = { data: StoryData; currency: string; today: string; rates: DrillContext['rates'] };
/** One account over the last months: its balance at each month's end (today for this month), and this month's money in and out. */
export type AccountStory = { points: Array<{ month: string; balance: number }>; moneyIn: number; moneyOut: number };

const add = (totals: Map<string, number>, key: string, amount: number) => totals.set(key, (totals.get(key) ?? 0) + amount);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** One month of every account: what came in, what went out, and what changed a balance without being a flow (a
 * reconciliation's correction, interest a bank added to a deposit). `missing` counts amounts no rate converts. */
function monthMoves(month: string, context: StoryContext) {
 const { data, currency, today, rates } = context, { from, to } = span([month], today);
 const { flows, missing, byId } = periodFlows({ data, splits: [], months: [month], currency, today, rates, t: key => key });
 const into = new Map<string, number>(), outOf = new Map<string, number>(), corrected = new Map<string, number>();
 let unknown = missing;
 for (const flow of flows) {
  if ('account' in flow.from) add(outOf, flow.from.account, flow.value);
  if ('account' in flow.to) add(into, flow.to.account, flow.value);
 }
 const correct = (id: string, amount: number) => {
  const value = convertAmount(amount, byId.get(id)?.currency ?? currency, currency, rates);
  if (value === null) unknown += 1; else add(corrected, id, value);
 };
 const within = (day: string) => day >= from && day <= to;
 for (const row of data.activity ?? []) if (row.action === 'reconcile' && within(row.occurred_on) && finite(row.before_balance) && finite(row.after_balance)) correct(row.account_id, row.after_balance - row.before_balance);
 for (const row of data.movements ?? []) if (row.kind === 'interest' && within(row.occurred_on)) correct(row.target_id, Number(row.target_value));
 return { into, outOf, corrected, missing: unknown };
}

/** How each account's balance moved this month, in the display currency; null when an amount has no rate. */
export function monthChanges(context: StoryContext): Map<string, number> | null {
 const { into, outOf, corrected, missing } = monthMoves(context.today.slice(0, 7), context);
 if (missing) return null;
 const changes = new Map<string, number>();
 for (const [id, amount] of into) add(changes, id, amount);
 for (const [id, amount] of outOf) add(changes, id, -amount);
 for (const [id, amount] of corrected) add(changes, id, amount);
 return changes;
}

/** An account's last `months` months, from today's `balance` (in the display currency) backwards: each earlier month
 * ended with the balance less everything recorded since. Null when an amount has no rate, so no figure is guessed. */
export function accountStory(accountId: string, balance: number, context: StoryContext, months = 6): AccountStory | null {
 const now = context.today.slice(0, 7), points = [{ month: now, balance }];
 let moneyIn = 0, moneyOut = 0, running = balance;
 for (let back = 0; back < months; back++) {
  const month = shiftMonth(now, -back), moves = monthMoves(month, context);
  if (moves.missing) return null;
  const into = moves.into.get(accountId) ?? 0, outOf = moves.outOf.get(accountId) ?? 0;
  if (back === 0) { moneyIn = into; moneyOut = outOf; }
  if (back === months - 1) break;
  running -= into - outOf + (moves.corrected.get(accountId) ?? 0);
  points.unshift({ month: shiftMonth(month, -1), balance: running });
 }
 return { points, moneyIn, moneyOut };
}

/** One line of an account's latest activity: a transaction as it was entered (`record`, with its own name), or an
 * operation named by `label` (a translation key) with the other account as `name`. `amount` is signed for the account
 * and in `currency`; null when the records do not say by how much the balance moved. */
export type StoryEntry = { id: string; date: string; label: string | null; name: string; amount: number | null; currency: string; record?: Entry };

type Activity = PlanningData['activity'][number];
/** By how much an operation moved the account: what left it (a mortgage payment with its fee), what reached it, or a
 * reconciliation's correction, which the records tell only when they kept the balance before it. */
function operationAmount(row: Activity, out: boolean): number | null {
 if (row.action === 'reconcile') return finite(row.before_balance) && finite(row.after_balance) ? row.after_balance - row.before_balance : null;
 if (!out) return Number(row.received || row.amount);
 return -(row.action === 'mortgage' ? decimalSum([row.amount, row.fee]) : Number(row.amount));
}

/** The newest things recorded against an account: its income and spending, its transfers, repayments, purchases and
 * corrections. A transaction saved by an operation is listed once, as the transaction. */
export function latestActivity(accountId: string, data: StoryData, count = 3): StoryEntry[] {
 const byId = new Map(data.records.map(record => [record.id, record]));
 const unit = byId.get(accountId)?.currency ?? '', nameOf = (id: string | null) => (id && byId.get(id)?.name) || '';
 const kinds = new Set<string>([...income, ...expenses]);
 const booked = data.records.filter(record => record.account_id === accountId && record.frequency === 'Once' && kinds.has(record.kind));
 const listed = new Set(booked.map(record => record.id));
 const entries: StoryEntry[] = booked.map(record => ({ id: record.id, date: record.date, label: null, name: record.name.trim() || record.kind, amount: signedAmount(record), currency: record.currency, record }));
 for (const row of (data.activity ?? []).filter(row => !listed.has(row.id) && (row.account_id === accountId || row.target_id === accountId))) {
  const out = row.account_id === accountId;
  entries.push({ id: row.id, date: row.occurred_on, label: operationLabels[row.action] ?? row.action, name: nameOf(out ? row.target_id : row.account_id), amount: operationAmount(row, out), currency: unit });
 }
 for (const row of (data.movements ?? []).filter(row => row.source_id === accountId || row.target_id === accountId)) {
  const incoming = row.target_id === accountId, other = row.kind === 'interest' ? '' : nameOf(incoming ? row.source_id : row.target_id);
  entries.push({ id: row.id, date: row.occurred_on, label: movementLabels[row.kind], name: other, amount: incoming ? Number(row.target_value) : -Number(row.source_value), currency: unit });
 }
 return entries.sort((a, b) => compareRecordDates(a.date, b.date) || a.id.localeCompare(b.id)).slice(0, count);
}
