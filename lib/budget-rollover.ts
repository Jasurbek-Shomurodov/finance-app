// Rollover funds: the money a budget category (or the Flexible bucket) carries from one month into the next, and the
// months of actuals a view must read for it. `lib/budget.ts` re-exports these, so callers keep one import.
import { shiftMonth } from './calendar-days';
import { flexPlan, plannedIn, type PlanSource } from './budget-schedules';
import { historyMonths, isFlexibleCategory, monthsBetween, type BudgetCategory, type MonthActuals, type RolloverFund } from './budget';
import { convertAmount } from './market';

type Rates = number | Record<string, number> | undefined;
/** What a month's budget is read from: the plans, the months of actuals that were loaded, and the display currency. */
export type BudgetRead = { plan: PlanSource; history: ReadonlyMap<string, MonthActuals>; currency: string; rates: Rates };

/** The fund's starting balance in `currency`; zero when it has none, null when its currency cannot be converted. */
export function startingBalanceIn(fund: RolloverFund, currency: string, rates: Rates): number | null {
 if (!fund.rolloverBalance) return 0;
 return convertAmount(fund.rolloverBalance, fund.rolloverCurrency ?? currency, currency, rates);
}

/** Money carried into `month`: the starting balance, then each earlier month's budget minus what was spent.
 * Overspending is taken from the fund and can make it negative; with negative carry off an overspent month resets it to zero.
 * Nothing carries before the start month or when rollover is off. Null when the starting balance or an earlier budget
 * cannot be converted: the carry is unknown, never counted as zero. Pure, so every chain can be tested month by month. */
export function rolloverCarry(fund: RolloverFund, month: string, starting: number | null, budgetOf: (month: string) => number | null, actualOf: (month: string) => number): number | null {
 if (!fund.rollover || !fund.rolloverStart || fund.rolloverStart > month) return 0;
 if (starting === null) return null;
 let balance = starting;
 for (const past of monthsBetween(fund.rolloverStart, shiftMonth(month, -1))) {
  const budget = budgetOf(past);
  if (budget === null) return null;
  balance += budget - actualOf(past);
  if (!fund.rolloverNegative && balance < 0) balance = 0;
 }
 return balance;
}

/** The earliest month of actuals that was loaded (`budgetReadRange` bounds a read to two years). A fund that started
 * before it would count every unloaded month as fully unspent (MONEY-013), so its carry is unknown instead: null, shown as —. */
function startsBeforeRead(fund: RolloverFund, month: string, history: ReadonlyMap<string, MonthActuals>) {
 if (!fund.rollover || !fund.rolloverStart || fund.rolloverStart > month) return false;
 let earliest: string | null = null;
 for (const loaded of history.keys()) if (earliest === null || loaded < earliest) earliest = loaded;
 return earliest !== null && fund.rolloverStart < earliest;
}

/** Unspent (or overspent) money carried into `month` from earlier months of a rollover category: each month's plan (`plannedIn`) minus its spending. */
export function rolloverBalance(category: BudgetCategory, read: BudgetRead, month: string) {
 if (startsBeforeRead(category, month, read.history)) return null;
 return rolloverCarry(category, month, startingBalanceIn(category, read.currency, read.rates), past => plannedIn(read.plan, category.key, past, read.currency, read.rates), past => read.history.get(past)?.byCategory.get(category.key) ?? 0);
}

/** Money the Flexible bucket carries into `month` in flex mode: its plan (`flexPlan`) minus everything spent in flexible categories. */
export function flexBucketRollover(bucket: BudgetCategory, categories: readonly BudgetCategory[], read: BudgetRead, month: string) {
 if (startsBeforeRead(bucket, month, read.history)) return null;
 const flexible = categories.filter(isFlexibleCategory);
 return rolloverCarry(bucket, month, startingBalanceIn(bucket, read.currency, read.rates), past => flexPlan(read.plan, categories, past, read.currency, read.rates), past => flexible.reduce((sum, category) => sum + (read.history.get(past)?.byCategory.get(category.key) ?? 0), 0));
}

/** Months of actuals a view needs: the year, or the History window, extended back to the earliest rollover start. */
export function budgetReadRange(month: string, view: 'month' | 'year', categories: readonly Pick<BudgetCategory, 'rollover' | 'rolloverStart'>[]) {
 let from = view === 'year' ? month.slice(0, 4) + '-01' : shiftMonth(month, -historyMonths);
 const to = view === 'year' ? month.slice(0, 4) + '-12' : month;
 for (const category of categories) if (category.rollover && category.rolloverStart && category.rolloverStart < from) from = category.rolloverStart;
 // Reads stay bounded: two years at most. A fund that started earlier then shows its rollover as unknown (`rolloverBalance`).
 const earliest = shiftMonth(to, -23);
 return { from: from < earliest ? earliest : from, to };
}
