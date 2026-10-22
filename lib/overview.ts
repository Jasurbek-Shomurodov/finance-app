import { assets, income, totalValue, type Entry } from './finance';
import { upcomingPayments, type DueItem, type PlanningData } from './planning';
import { shiftDay } from './calendar-days';
import { amountIn, type PairRate, type RateTable } from './money';
import { topShares } from './cash-flow-report';

/** Entries must already be expressed in the display currency. Shares stay precise; round only when displaying. */
export function assetAllocation(entries: readonly Entry[]) {
 const total = totalValue(entries, assets);
 return assets.map(kind => ({ kind, total: totalValue(entries, [kind]) }))
  .filter(item => item.total > 0)
  .sort((a, b) => b.total - a.total)
  .map(item => ({ ...item, share: item.total / total * 100 }));
}

/** The allocation as a short list: the five largest kinds, then the rest as one row under `otherShareKey`. A single kind
 * left over is shown by name rather than as an Other row of one. */
export function allocationRows(items: ReturnType<typeof assetAllocation>, limit = 5) {
 return topShares(items.map(item => ({ key: item.kind as string, amount: item.total, share: item.share })), items.length === limit + 1 ? items.length : limit).map(share => ({ kind: share.key, total: share.amount, share: share.share }));
}

/** Percentage change against the opening value; null when the opening value is not positive. */
export function changePercent(current: number, change: number | null) {
 if (change === null) return null;
 const opening = current - change;
 return opening > 0 ? change / opening * 100 : null;
}

/** Overdue items come first, then the nearest due dates. */
export function nextPayments(due: readonly DueItem[], limit = 5) {
 return [...due].sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date) || a.record.name.localeCompare(b.record.name)).slice(0, limit);
}

/** What falls due to be paid by `days` from today, overdue included: how many payments, and their total in `currency`.
 * Income on its way is not a payment due. The total is null when one has no rate to convert it, never a figure under the
 * wrong currency. */
export function dueSoon(data: Pick<PlanningData, 'records' | 'occurrences' | 'debtPayments'>, today: string, days: number, currency: string, rates?: RateTable | PairRate | null) {
 const items = upcomingPayments(data.records, data.occurrences, today, shiftDay(today, days), data.debtPayments).filter(item => !income.includes(item.record.kind));
 let total: number | null = 0;
 for (const item of items) {
  const amount = amountIn({ amount: item.amount, currency: item.record.currency }, currency, rates);
  total = total === null || amount === null ? null : total + amount;
 }
 // The first item is the next one due: upcomingPayments lists them by date.
 const next = items[0] ? { name: items[0].record.name, date: items[0].date } : null;
 return { count: items.length, total, next };
}
