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
// Each day also names what moved net worth since the day before it on the chart: a `move:<kind>` key per kind of record
// whose value changed (debts as `move:Debt`), read from the history's `parts`. A day without parts names nothing.
export const movePrefix = 'move:';
export function netWorthComparison(points: readonly ComparisonPoint[], history: readonly { date: string; net: number; parts?: Record<string, number> }[], keys: readonly string[]): ComparisonPoint[] {
 let index = 0, net: number | null = null, parts: Record<string, number> | undefined, before: Record<string, number> | undefined;
 return points.flatMap(point => {
  while (index < history.length && history[index].date <= point.date) ({ net, parts } = history[index++]);
  const moves = movesBetween(before, parts);
  before = parts;
  if (net === null || !Number.isFinite(net)) return [];
  const worth = net, actual = point.actual;
  const shifted = keys.map(key => {
   const value = point[key];
   return [key, typeof actual === 'number' && typeof value === 'number' && Number.isFinite(value) ? worth - actual + value : null] as const;
  });
  return [{ ...point, ...Object.fromEntries(shifted), ...moves, actual: worth }];
 });
}

// Net worth alone, one point per recorded day: what the chart draws while the benchmarks are still loading, or when
// they cannot be worked out (no price history, a missing exchange rate). The main line never waits for them.
export function netWorthLine(history: readonly { date: string; net: number; parts?: Record<string, number> }[]): ComparisonPoint[] {
 return netWorthComparison(history.map(point => ({ date: point.date, actual: null, contributed: 0 })), history, []);
}

// What changed between two days' parts, as `move:<kind>` keys; a change under half a unit is not a change.
function movesBetween(before: Record<string, number> | undefined, after: Record<string, number> | undefined): Record<string, number> {
 if (!before || !after) return {};
 const moves: Record<string, number> = {};
 for (const kind of new Set([...Object.keys(before), ...Object.keys(after)])) {
  const change = (after[kind] ?? 0) - (before[kind] ?? 0);
  if (Number.isFinite(change) && Math.abs(change) >= .5) moves[movePrefix + kind] = change;
 }
 return moves;
}
