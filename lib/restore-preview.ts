import { applyRecordChange } from './record-balance';
import { budgetKey, expenses, type Entry } from './finance';
import { budgetRows, monthActuals, type BudgetAmount, type BudgetCategory } from './budget';
import type { PlanningData } from './planning';
import type { TransactionSplit } from './transaction-tools';

/** A figure before and after a restore. */
export type Change = { before: number; after: number };
/** What restoring a deleted transaction moves, computed only from what the app already holds. A part is left out
 * (undefined) whenever it cannot be told exactly: an account in another currency without the saved rate, a split
 * transaction, a currency no rate converts, a category whose budget carries money over from earlier months. */
export type RestorePreview = {
 /** The cash account it was paid from or into, in that account's own currency. */
 account?: { id: string; name: string; currency: string; balance: Change };
 /** This month's spending in its category (`name`, as the person reads it), in the display currency `currency`; `budget`
  * and `left` only with a plain monthly budget. */
 category?: { key: string; name: string; currency: string; spent: Change; budget?: number; left?: Change };
};

/** The cash account's balance once `entry` is back, as the database moves it (`applyRecordChange`). */
export function accountChange(accounts: readonly Entry[], entry: Entry): RestorePreview['account'] {
 const account = entry.account_id ? accounts.find(row => row.id === entry.account_id && row.kind === 'Cash') : undefined;
 if (!account) return undefined;
 try {
  const after = applyRecordChange([account], undefined, entry).find(row => row.id === account.id);
  if (!after || after.amount === account.amount) return undefined;
  return { id: account.id, name: account.name, currency: account.currency, balance: { before: account.amount, after: after.amount } };
 } catch { return undefined; }
}

export type MonthRead = {
 /** This month's records, activity and links as the Budget reads them (`/api/planning?scope=review`). */
 data: Pick<PlanningData, 'records' | 'activity' | 'investmentLinks'>; splits: TransactionSplit[]; month: string; today: string; currency: string;
 rates: number | Record<string, number> | undefined;
 /** The Budget's categories and amounts, and the schedules a category plans at least. */
 categories: readonly BudgetCategory[]; amounts: readonly BudgetAmount[]; schedules: readonly Entry[];
};

/** This month's spending in the category of a one-time expense dated this month, before and after it is back. */
export function categoryChange(entry: Entry, split: boolean, name: string, read: MonthRead): RestorePreview['category'] {
 const { data, splits, month, today, currency, rates } = read;
 if (split || entry.frequency !== 'Once' || !expenses.includes(entry.kind) || entry.date.slice(0, 7) !== month || entry.date > today) return undefined;
 const before = monthActuals(data, splits, month, currency, today, rates);
 const after = monthActuals({ ...data, records: [entry, ...data.records.filter(row => row.id !== entry.id)] }, splits, month, currency, today, rates);
 const key = budgetKey(entry);
 const spent = { before: before.byCategory.get(key) ?? 0, after: after.byCategory.get(key) ?? 0 };
 // A currency no rate converts, or spending the month does not count, says nothing reliable.
 if (after.missing > before.missing || spent.after === spent.before) return undefined;
 const category = read.categories.find(item => item.key === key);
 // Money rolled over from earlier months needs their history, which this read does not hold.
 const shown = { key, name, currency, spent };
 if (!category || category.rollover || category.excluded) return shown;
 const budget = budgetRows([category], read.amounts, new Map([[month, before]]), month, currency, rates, read.schedules)[0]?.budget;
 if (budget === null || budget === undefined || budget <= 0) return shown;
 return { ...shown, budget, left: { before: budget - spent.before, after: budget - spent.after } };
}
