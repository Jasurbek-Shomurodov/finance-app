import { budgetAmountFor, type BudgetAmount } from './budget';
import { budgetKey, expenses, income, type Entry } from './finance';
import { convertAmount } from './market';
import { activeSchedule } from './planning';

type Rates = number | Record<string, number> | undefined;
/** What Settings shows beside a category: its budget this month and the recurring bills or incomes counted under it. */
export type CategoryPlan = {
 /** In the display currency; null when its currency has no usable rate, undefined when no budget is set. */
 budget: number | null | undefined;
 /** The running schedules of the category (`budgetKey`), in the order they were read. */
 schedules: Entry[];
};
export type CategoryPlanSource = { amounts: readonly BudgetAmount[]; records: readonly Entry[]; month: string; currency: string; rates: Rates };

/** The plan of one category. A budget of zero is still a budget; an amount no rate converts is unknown, never zero. */
export function categoryPlan(key: string, direction: 'income' | 'expense', source: CategoryPlanSource): CategoryPlan {
 const saved = budgetAmountFor(source.amounts, key, source.month);
 const kinds = direction === 'income' ? income : expenses;
 return {
  budget: saved ? convertAmount(Number(saved.amount), saved.currency, source.currency, source.rates) : undefined,
  schedules: source.records.filter(record => activeSchedule(record) && kinds.includes(record.kind) && budgetKey(record) === key),
 };
}
