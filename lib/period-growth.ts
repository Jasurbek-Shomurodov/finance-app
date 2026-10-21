import type { ComparisonPoint } from './investment-comparison';

export type PeriodGrowth = { returns: number; invested: number };

// A period's investment change, split in two: the money put in from outside the investments, and what they earned
// beyond it. Both run from the first shown day to the last, in the points' own currency.
export function periodGrowth(points: readonly ComparisonPoint[]): PeriodGrowth | null {
 const first = points[0], last = points.at(-1);
 const usable = (point: ComparisonPoint | undefined): point is ComparisonPoint & { actual: number; invested: number } => !!point && typeof point.actual === 'number' && typeof point.invested === 'number' && Number.isFinite(point.actual) && Number.isFinite(point.invested);
 if (!usable(first) || !usable(last)) return null;
 const invested = last.invested - first.invested;
 return { invested, returns: last.actual - first.actual - invested };
}
