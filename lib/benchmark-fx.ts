// The official rates a comparison converts with, from the kept day tables (`exchange_rate_days`). A published rate
// stays in force until the next one, so the comparison needs one kept day on or before its start and one close to its
// end, and a day a month between: the kept days are listed, and only those are read.
import { daysBetween, shiftDay } from './calendar-days';
import { dayTables, keptDaysBetween, type DayTableDeps } from './day-rate-tables';
import type { FxPoint } from './benchmark-data';

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

export type BenchmarkFxDeps = DayTableDeps;

/** The rate points for a comparison of `start`–`end`: the latest kept day on or before `start`, a day a month between,
 * and the latest kept day. Throws when nothing covers the start or
 * the end, as the comparison would read those dates at no rate. */
export async function benchmarkFx(start: string, end: string, deps: BenchmarkFxDeps): Promise<FxPoint[]> {
 const days = await keptDaysBetween(shiftDay(start, -leadDays), end, deps.db);
 const opening = days.findLast(day => day <= start), latest = days.at(-1);
 if (!opening || !latest || latest < shiftDay(end, -tailDays)) throw Error('Historical exchange rates are unavailable.');
 // The latest day already stands for its own month.
 const between = monthly(days.filter(day => day > opening && monthIndex(day) < monthIndex(latest)), daysBetween(start, end) / 30);
 const points = [...new Set([opening, ...between, latest])];
 const tables = await dayTables(points, deps);
 if (!points.every(day => tables.has(day))) throw Error('Historical exchange rates are unavailable.');
 return points.map(date => ({ date, rates: tables.get(date)! }));
}
