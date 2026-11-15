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
