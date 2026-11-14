import type { ComparisonPoint } from './investment-comparison';

export type HypotheticalNetWorth = { key: string; netWorth: number; difference: number };

// Net worth today had the investments and spending that funded each benchmark gone into it instead:
// the actual investments are swapped for the benchmark's value, everything else stays as it is.
export function hypotheticalNetWorth(netWorth: number | null | undefined, point: ComparisonPoint | undefined, keys: readonly string[]): HypotheticalNetWorth[] {
 if (netWorth === null || netWorth === undefined || !Number.isFinite(netWorth) || !point || typeof point.actual !== 'number') return [];
 const actual = point.actual;
 return keys.flatMap(key => {
  const value = point[key];
  return typeof value === 'number' && Number.isFinite(value) ? [{ key, netWorth: netWorth - actual + value, difference: value - actual }] : [];
 });
}

// The comparison on the net worth scale: each day's main figure is net worth (assets minus debts), and every benchmark
// is what net worth would be that day had the same money gone into it, so the gap between two lines stays what it was.
// `history` is net worth by day, oldest first; a day without its own figure carries the latest earlier one, and days
// before the first figure are left out. The points' own `contributed` and `invested` totals are kept.
export function netWorthComparison(points: readonly ComparisonPoint[], history: readonly { date: string; net: number }[], keys: readonly string[]): ComparisonPoint[] {
 let index = 0, net: number | null = null;
 return points.flatMap(point => {
  while (index < history.length && history[index].date <= point.date) net = history[index++].net;
  if (net === null || !Number.isFinite(net)) return [];
  const worth = net, actual = point.actual;
  const shifted = keys.map(key => {
   const value = point[key];
   return [key, typeof actual === 'number' && typeof value === 'number' && Number.isFinite(value) ? worth - actual + value : null] as const;
  });
  return [{ ...point, ...Object.fromEntries(shifted), actual: worth }];
 });
}
