// The exchange rates the net worth history converts with. Every past day converts at the official rates of that day
// (the kept day tables the history read returns), and today at the live rates today's own figure uses. The benchmark
// comparison reads the same series (`mergeFx`), so a period's change and the returns inside it stand on one basis.
import type { FxPoint } from './benchmark-data';

/** Units of each currency per US dollar. */
export type RateTable = Record<string, number>;
const usable = (rate: unknown): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
const byDate = (a: FxPoint, b: FxPoint) => a.date.localeCompare(b.date);

/** Today's rates as one table; the older single UZS rate reads as {USD:1,UZS:rate}. */
export function rateTable(rates: number | RateTable | undefined): RateTable | undefined {
 return typeof rates === 'number' ? { USD: 1, UZS: rates } : rates;
}

/** The kept day tables up to yesterday, then today at the live rates: the rates today's net worth is shown at. Without
 * live rates the kept tables stand alone; a currency the live feed lacks keeps its latest kept rate. */
export function historyFx(kept: readonly FxPoint[] | undefined, live: number | RateTable | undefined, today: string): FxPoint[] {
 const table = rateTable(live);
 const sorted = (kept ?? []).filter(point => point.date <= today).sort(byDate);
 if (!table) return sorted;
 const earlier = sorted.filter(point => point.date < today);
 return [...earlier, { date: today, rates: { ...sorted.at(-1)?.rates, ...table, USD: 1 } }];
}

/** The table a day converts with: the kept one closest on or before it, or the earliest kept one for a day before any.
 * A currency a day's table lacks reads at `live`, and with nothing kept every day reads at `live`. Tables are built once
 * per kept day, so asking day after day costs a search, not a copy. */
export function dayRates(fx: readonly FxPoint[], live: number | RateTable | undefined): (date: string) => RateTable | undefined {
 const base = rateTable(live), tables: Array<RateTable | undefined> = [];
 if (!fx.length) return () => base;
 const tableAt = (index: number) => tables[index] ??= { ...base, ...Object.fromEntries(Object.entries(fx[index].rates).filter(([, rate]) => usable(rate))), USD: 1 };
 return date => {
  let low = 0, high = fx.length - 1, found = 0;
  while (low <= high) {
   const middle = (low + high) >> 1;
   if (fx[middle].date <= date) { found = middle; low = middle + 1; } else high = middle - 1;
  }
  return tableAt(found);
 };
}

/** The comparison's rates with the history's laid over them: on every day the history's rate wins, and the benchmark
 * feed answers for a currency or an earlier day the history does not cover. Both are sorted by day. */
export function mergeFx(feed: readonly FxPoint[] | undefined, history: readonly FxPoint[] | undefined): FxPoint[] {
 const benchmark = feed ?? [];
 if (!history?.length) return [...benchmark];
 const days = [...new Set([...benchmark, ...history].map(point => point.date))].sort();
 let b = -1, h = -1;
 return days.map(date => {
  while (b + 1 < benchmark.length && benchmark[b + 1].date <= date) b++;
  while (h + 1 < history.length && history[h + 1].date <= date) h++;
  return { date, rates: { ...(b < 0 ? undefined : benchmark[b].rates), ...(h < 0 ? undefined : history[h].rates) } };
 });
}
