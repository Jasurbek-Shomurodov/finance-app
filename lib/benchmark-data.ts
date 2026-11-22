import { dayMs as dayMillis, dayTime as dateMillis, shiftDay } from './calendar-days';
// Re-exported for app/api/benchmarks/route.ts, which still imports these names from here.
export { dayMillis, dateMillis, shiftDay };
export type PricePoint = { date: string; close: number };
export type FxPoint = { date: string; rates: Record<string, number> };
export type BenchmarkData = { start: string; end: string; prices: Record<string, PricePoint[]>; fx: FxPoint[]; errors: Record<string, string> };
export function validDay(date: string) {
 return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(dateMillis(date)) && new Date(dateMillis(date)).toISOString().slice(0, 10) === date;
}
/** The latest point on or before `date`. Inputs are sorted by day (their source adapters sort them), so this is a
 * binary search: a comparison asks it for every day of every series. */
export function latestOn<T extends { date: string }>(points: readonly T[], date: string): T | undefined {
 let low = 0, high = points.length - 1, found: T | undefined;
 while (low <= high) {
  const middle = (low + high) >> 1;
  if (points[middle].date <= date) { found = points[middle]; low = middle + 1; } else high = middle - 1;
 }
 return found;
}
export function historicalRate(fx: FxPoint[], currency: string, date: string) {
 if (currency === 'USD') return 1;
 const point = latestOn(fx, date);
 const rate = point?.rates[currency];
 return rate && Number.isFinite(rate) && rate > 0 ? rate : null;
}
