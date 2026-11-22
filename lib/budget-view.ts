import { budgetKey } from './finance';
import type { BudgetRow, LeftToBudget } from './budget';
import type { DueItem } from './planning';

// What the Budget page reads off its rows: which spending has no plan, each row's live state, how income splits into
// spending, goals and what is left. The month's spending pace is lib/spending-pace.ts, shared with the Dashboard.

/** Spending with no plan: money went out of a category that has no budget, no bill and no fund behind it. It is listed
 * apart as Unplanned, in ink: nothing was exceeded. A flexible category in flex mode is planned by its bucket, never here. */
export const isUnplanned = (row: BudgetRow) => row.direction === 'expense' && !row.excluded && !row.missing && row.budget === 0 && !row.rolloverIn && row.actual > 0;

/** Planned rows first, then the unplanned ones, each in the order they came. */
export function splitUnplanned(rows: readonly BudgetRow[]) {
 const unplanned = rows.filter(isUnplanned);
 return { planned: rows.filter(row => !isUnplanned(row)), unplanned, total: unplanned.reduce((sum, row) => sum + row.actual, 0) };
}

/** What Plan these fills in for an unplanned category: what it spent this month or its monthly average, whichever is
 * more, as a whole amount rounded up. */
export const unplannedSuggestion = (spent: number, average: number) => Math.max(0, Math.ceil(Math.max(spent, average) - 1e-9));

/** The first scheduled date still open in `month` for each category, from `upcomingPayments`. */
export function dueByCategory(items: readonly DueItem[], month: string) {
 const due = new Map<string, string>();
 for (const item of items) {
  if (item.type !== 'scheduled' || item.date.slice(0, 7) !== month) continue;
  const key = budgetKey(item.record);
  if (!due.has(key) || item.date < due.get(key)!) due.set(key, item.date);
 }
 return due;
}

export type RowState =
 | { kind: 'none' | 'not_planned' | 'due_today' | 'overdue' }
 | { kind: 'due'; date: string }
 | { kind: 'over'; amount: number }
 | { kind: 'progress'; percent: number };

/** A row's live state beside its progress bar: what was exceeded, what falls due, else how much of the plan is used.
 * `due` is the category's first open scheduled date this month; it leads only while nothing has been paid or received. */
export function rowState(row: Pick<BudgetRow, 'direction' | 'budget' | 'rolloverIn' | 'actual' | 'remaining' | 'missing' | 'progress'>, due: string | undefined, today: string): RowState {
 if (row.missing || row.remaining === null) return { kind: 'none' };
 const available = (row.budget ?? 0) + row.rolloverIn;
 if (available <= 0) return row.direction === 'income' && row.actual > 0 ? { kind: 'not_planned' } : row.actual > 0 ? { kind: 'over', amount: -row.remaining } : { kind: 'none' };
 if (row.direction === 'expense' && row.remaining < -0.005) return { kind: 'over', amount: -row.remaining };
 if (due && row.actual === 0) return due === today ? { kind: 'due_today' } : due < today ? { kind: 'overdue' } : { kind: 'due', date: due };
 return { kind: 'progress', percent: Math.max(0, row.progress * 100) };
}

/** Planned income as one bar: the shares planned for spending, for goals and still without a job. Null while a figure
 * is unknown or nothing is planned. When more is planned than earned, the bar splits what is planned and nothing is left. */
export function leftShares(left: Pick<LeftToBudget, 'income' | 'expenses' | 'contributions' | 'left'>): { spending: number; goals: number; left: number } | null {
 if (left.income === null || left.expenses === null || left.contributions === null || left.left === null) return null;
 const spending = Math.max(0, left.expenses), goals = Math.max(0, left.contributions), rest = Math.max(0, left.left);
 const whole = spending + goals + rest;
 if (whole <= 0) return null;
 return { spending: spending / whole * 100, goals: goals / whole * 100, left: rest / whole * 100 };
}
