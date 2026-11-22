import { monthEnd } from './calendar-days';
import { otherShareKey, topShares, type Share } from './cash-flow-report';
import { budgetKey } from './finance';
import { incomingDue } from './overview';
import type { DueItem } from './planning';

// What the Dashboard says at a glance: how much may still be spent this month, where the money is going, and what to
// improve. Every amount is in the display currency; one that no rate converts leaves its figure unknown (null, shown as
// —), never a partial total.
type Convert = (amount: number, currency: string) => number | null;

/** Payments still to make by the end of `month`, overdue ones included, that `covered` does not already hold: money on
 * its way in is never due (`incomingDue`), and a payment whose budget category has a plan is part of that plan, never
 * added to it (`plannedIn`). Null when one has no rate. */
export function obligationsDue(items: readonly DueItem[], month: string, covered: ReadonlySet<string>, convert: Convert): number | null {
 const end = monthEnd(month);
 let total = 0;
 for (const item of items) {
  if (item.date > end || incomingDue(item) || covered.has(budgetKey(item.record))) continue;
  const value = convert(item.amount, item.record.currency);
  if (value === null || !Number.isFinite(value)) return null;
  total += value;
 }
 return total;
}

export type SafeToSpend = {
 /** What it is measured against: this month's budget for spending, or with no budget the month's expected income. */
 basis: 'budget' | 'income';
 /** What may still be spent this month; below zero is how far over. Null while a figure it counts is unknown. */
 amount: number | null;
 /** The plan, or the expected income, it starts from. */
 limit: number | null;
 /** What was spent of it so far. */
 spent: number | null;
 /** The payments still due this month that it takes off. */
 due: number | null;
};
type SafeInput = {
 month: string;
 /** This month's budget for spending: its plan (null without a rate, 0 when none is set), what was spent in its
  * categories, the keys of the categories with a plan, and whether the read failed or left an amount out. */
 budget: { plan: number | null; spent: number; covered: ReadonlySet<string>; unknown: boolean };
 /** Every open due date through the end of the month (`upcomingPayments`). */
 due: readonly DueItem[];
 /** Without a budget: income received and still expected, and everything spent, this month; null when unknown. */
 income: { received: number | null; expected: number | null; spent: number | null };
 convert: Convert;
};

/** Safe to spend: what the person can still spend this month without breaking the plan.
 * With a budget it is the plan minus what was spent in its categories, minus the payments still due this month that no
 * budget category covers (loan and mortgage installments, bills of excluded categories). A bill of a budgeted category
 * is already inside the plan, so it is not taken off a second time.
 * With no budget it is the month's expected income (received and still expected) minus everything spent and everything
 * still due. */
export function safeToSpend({ month, budget, due, income, convert }: SafeInput): SafeToSpend {
 if (budget.plan === null || budget.plan > 0) {
  const owed = obligationsDue(due, month, budget.covered, convert);
  const known = budget.plan !== null && !budget.unknown;
  return { basis: 'budget', limit: budget.plan, spent: known ? budget.spent : null, due: owed, amount: known && owed !== null ? budget.plan! - budget.spent - owed : null };
 }
 const owed = obligationsDue(due, month, new Set(), convert);
 const limit = budget.unknown || income.received === null || income.expected === null ? null : income.received + income.expected;
 return { basis: 'income', limit, spent: income.spent, due: owed, amount: limit === null || income.spent === null || owed === null ? null : limit - income.spent - owed };
}

type Amount = { id: string; amount: number };
export type SpendingRow = Share & {
 /** What the category had taken by the same day last month, and how this month differs from it. */
 previous: number; change: number;
 /** The category that grew the most against last month. */
 mover: boolean;
};
export type WhereItGoes = { total: number; rows: SpendingRow[]; /** The biggest increase among all categories, shown or not. */ mover: SpendingRow | null };

/** This month's spending by category, largest first, each with its share of the total and its change against last
 * month by the same day (`monthlyReview(...).categories` for both). The smallest categories merge into one "Other" row
 * (`topShares`), so the rows add up to the total. */
export function whereItGoes(current: readonly Amount[], previous: readonly Amount[], limit = 5): WhereItGoes {
 const before = new Map(previous.map(item => [item.id, item.amount]));
 const spent = current.filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);
 const total = spent.reduce((sum, item) => sum + item.amount, 0);
 const all = spent.map(item => ({ key: item.id, amount: item.amount, share: item.amount / total, previous: before.get(item.id) ?? 0, change: item.amount - (before.get(item.id) ?? 0), mover: false }));
 // A change that rounds to nothing is no mover.
 const top = all.reduce<SpendingRow | null>((best, row) => row.change >= 0.5 && (!best || row.change > best.change) ? row : best, null);
 if (top) top.mover = true;
 const rows = topShares(all, limit).map(share => {
  if (share.key !== otherShareKey) return share as SpendingRow;
  const rest = all.slice(limit), earlier = rest.reduce((sum, row) => sum + row.previous, 0);
  return { ...share, previous: earlier, change: share.amount - earlier, mover: false };
 });
 return { total, rows, mover: top };
}

export type Improvement =
 /** A payment whose date has passed: the first one, and how many there are. */
 | { kind: 'overdue'; recordId: string; name: string; date: string; count: number }
 /** The day the cash forecast goes below zero. */
 | { kind: 'below_zero'; date: string }
 /** A category that has spent more than its plan. */
 | { kind: 'over_budget'; key: string; amount: number }
 /** The category that grew the most against last month by this day. */
 | { kind: 'mover'; key: string; amount: number };
type ImproveInput = {
 /** Payments to make whose date has passed, earliest first. */
 overdue: readonly Pick<DueItem, 'record' | 'date'>[];
 belowZero: string | null;
 /** Categories over their plan, with how far over. */
 over: readonly { key: string; amount: number }[];
 mover: Pick<SpendingRow, 'key' | 'change'> | null;
};

/** What to improve, most pressing first, three lines at most: an overdue payment, the day cash goes below zero, the
 * categories furthest over budget, then the biggest mover unless it is one of those categories. Empty when all is well. */
export function improvements({ overdue, belowZero, over, mover }: ImproveInput, limit = 3): Improvement[] {
 const lines: Improvement[] = [];
 if (overdue.length) lines.push({ kind: 'overdue', recordId: overdue[0].record.id, name: overdue[0].record.name, date: overdue[0].date, count: overdue.length });
 if (belowZero) lines.push({ kind: 'below_zero', date: belowZero });
 const exceeded = over.filter(row => row.amount >= 0.5).sort((a, b) => b.amount - a.amount);
 for (const row of exceeded) lines.push({ kind: 'over_budget', key: row.key, amount: row.amount });
 if (mover && !exceeded.some(row => row.key === mover.key)) lines.push({ kind: 'mover', key: mover.key, amount: mover.change });
 return lines.slice(0, limit);
}
