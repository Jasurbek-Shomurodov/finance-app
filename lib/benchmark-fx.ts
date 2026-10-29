// The official rates a comparison converts with, from the kept day tables (`exchange_rate_days`). A published rate
// stays in force until the next one, so the comparison needs one kept day on or before its start and one close to its
// end, and a day a month between: those are read in one request. The archive (cbu.uz) is asked only for an edge no
// kept day covers, within a short budget; it answers only addresses in Uzbekistan, so on the server it usually fails
// fast (lib/day-rate-tables.ts rests it after a timeout) and the kept days carry the comparison.
import { daysBetween, shiftDay } from './calendar-days';
import { dayTables, keptDaysBetween, type DayTableDeps } from './day-rate-tables';
import type { FxPoint } from './benchmark-data';
import type { DayTable } from './transaction-rates';

/** Kept days this far before the start may stand for it: the archive publishes daily, so a month always has some. */
const leadDays = 45;
/** The latest kept day may stand for the period's end when it is at most this old. */
const tailDays = 7;
/** At most about this many points: a long period keeps every k-th month, on a grid fixed by the calendar. */
const maxPoints = 40;

const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
/** The last kept day of each month, every k-th month on a calendar grid, so the same days are read every time. */
function monthly(days: string[], months: number) {
 const step = Math.max(1, Math.ceil(months / maxPoints)), last = new Map<number, string>();
 for (const day of days) last.set(monthIndex(day), day);
 return [...last].filter(([month]) => month % step === 0).map(([, day]) => day);
}

export type BenchmarkFxDeps = Pick<DayTableDeps, 'db' | 'fetchDay' | 'later' | 'today'> & { budgetMs?: number };

/** The rate points for a comparison of `start`–`end`: the latest kept day on or before `start`, a day a month between,
 * and the latest kept day; an edge with no kept day is asked of the archive. Throws when nothing covers the start or
 * the end, as the comparison would read those dates at no rate. */
export async function benchmarkFx(start: string, end: string, deps: BenchmarkFxDeps): Promise<FxPoint[]> {
 const kept: Map<string, DayTable> = await keptDaysBetween(shiftDay(start, -leadDays), end, deps.db);
 let days = [...kept.keys()].sort();
 const missing = [
  ...(days.some(day => day <= start) ? [] : [start, shiftDay(start, -1), shiftDay(start, -2)]),
  ...(days.some(day => day >= shiftDay(end, -tailDays)) ? [] : [end, shiftDay(end, -1), shiftDay(end, -2)]),
 ];
 if (missing.length) {
  const fetched = await dayTables(missing, { db: deps.db, fetchDay: deps.fetchDay, later: deps.later, today: deps.today, budgetMs: deps.budgetMs ?? 3000 });
  for (const [day, table] of fetched) kept.set(day, table);
  days = [...kept.keys()].sort();
 }
 const opening = days.findLast(day => day <= start), latest = days.at(-1);
 if (!opening || !latest || latest < shiftDay(end, -tailDays)) throw Error('Historical exchange rates are unavailable.');
 // The latest day already stands for its own month.
 const between = monthly(days.filter(day => day > opening && monthIndex(day) < monthIndex(latest)), daysBetween(start, end) / 30);
 return [...new Set([opening, ...between, latest])].map(date => ({ date, rates: kept.get(date)! }));
}
