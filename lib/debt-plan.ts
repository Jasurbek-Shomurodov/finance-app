import { monthEnd, shiftMonth } from './calendar-days';
import { debtPayoff, payoffPriority, type PayoffMethod, type PayoffResult } from './debt-payoff';
import { liabilities, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';

/** The saved payoff plan (`debt_plan` in workspace preferences): extra money a month, the method, and a minimum per debt. */
export type DebtPlan = { currency: string; extra: number; method: PayoffMethod; payments: Record<string, number> };
export const emptyDebtPlan = (currency: string): DebtPlan => ({ currency, extra: 0, method: 'avalanche', payments: {} });
/** The plan as saved for this display currency, else an empty one: a plan never carries over to another currency. */
export const planFor = (saved: DebtPlan | undefined, currency: string): DebtPlan => saved?.currency === currency ? saved : emptyDebtPlan(currency);
export const otherMethod = (method: PayoffMethod): PayoffMethod => method === 'snowball' ? 'avalanche' : 'snowball';
export const methodLabels: Record<PayoffMethod, string> = { avalanche: 'Highest interest first', snowball: 'Smallest balance first' };

/** The debts a plan covers: what is still owed in the plan's currency. Amounts in different currencies are never added. */
export const plannedDebts = (records: readonly Entry[], currency: string) => records.filter(record => liabilities.includes(record.kind) && record.currency === currency && record.amount > 0);

/** A plan worked out: the debts, the plan itself, the same debts on minimum payments only, and the other method. */
export function payoffPlan(records: readonly Entry[], plan: DebtPlan) {
 const debts = plannedDebts(records, plan.currency);
 const inputs = debts.map(record => ({ id: record.id, balance: record.amount, annualRate: record.rate, minimum: plan.payments[record.id] ?? record.estimated_monthly_payment ?? 0 }));
 return {
  debts, inputs,
  result: debtPayoff(inputs, plan.extra, plan.method),
  minimums: debtPayoff(inputs, 0, plan.method),
  alternative: debtPayoff(inputs, plan.extra, otherMethod(plan.method)),
  /** The debt the extra payment goes to first. */
  first: payoffPriority(inputs, plan.method)[0]?.id ?? null,
 };
}

/** The month a payoff ends in, as its last day: a projection never promises an exact payment day. Null when it never ends. */
export const payoffDay = (today: string, months: number | null | undefined) => months === null || months === undefined ? null : monthEnd(shiftMonth(today.slice(0, 7), months));

/** What is owed at the end of each month under the plan and on minimum payments only, for the balance chart. The chart
 * ends when the slower of the two does; one that never ends is cut at twice the plan's length. Long plans are thinned
 * to one point a quarter or a year, always keeping the first and the last month. */
export function payoffSeries(today: string, plan: PayoffResult, minimums: PayoffResult | null, maxPoints = 120) {
 const planEnd = plan.months ?? plan.balances.length - 1;
 const end = Math.min(Math.max(planEnd, minimums?.months ?? planEnd * 2), Math.max(plan.balances.length, minimums?.balances.length ?? 0) - 1);
 const step = Math.max(1, Math.ceil(end / maxPoints));
 const at = (result: PayoffResult | null, month: number) => !result ? null : month < result.balances.length ? result.balances[month] : result.months === null ? null : 0;
 const points: { month: string; plan: number | null; minimums: number | null }[] = [];
 for (let month = 0; month <= end; month += step) points.push({ month: shiftMonth(today.slice(0, 7), month), plan: at(plan, month), minimums: at(minimums, month) });
 if (end % step) points.push({ month: shiftMonth(today.slice(0, 7), end), plan: at(plan, end), minimums: at(minimums, end) });
 return points;
}

/** How far a debt or a loan to someone is repaid, from its Tracker history: the first balance recorded for it plus
 * whatever was borrowed (or lent) afterwards, against what is owed today. Null without a recorded starting amount:
 * a record stores no original amount of its own. */
export function debtProgress(record: Pick<Entry, 'id' | 'amount'>, events: readonly HistoryEvent[]) {
 const own = events.filter(event => event.record_id === record.id).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at));
 const first = own[0];
 if (!first) return null;
 const opening = first.event_type === 'contribution' ? Number(first.amount) : Number(first.balance ?? 0);
 const total = own.slice(1).reduce((sum, event) => event.event_type === 'contribution' ? sum + Number(event.amount) : sum, opening);
 if (!(total > 0) || !Number.isFinite(total)) return null;
 const paid = Math.min(Math.max(total - record.amount, 0), total);
 return { paid, total, share: paid / total * 100 };
}
