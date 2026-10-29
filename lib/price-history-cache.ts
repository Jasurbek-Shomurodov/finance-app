// Kept daily price history (migration 157). One row keeps one series' daily closes (`stock:SPY`, `crypto:BTC`) for every
// workspace. A comparison is answered from the row when it already reaches the period; only the last few days are asked
// again, after the reply once the row is an hour old. A stock series is read in full once a week, because adjusted
// closes change with every dividend or split. A feed that fails leaves the kept closes standing when they still reach
// within a week of the period's end.
import { shiftDay } from './calendar-days';
import { serviceDatabase, type ServiceDatabase } from './service-role';
import type { PricePoint } from './benchmark-data';

export const historyFreshForMs = 60 * 60_000;
export const stockFullEveryMs = 7 * 24 * 60 * 60_000;
/** Days before the last asked day read again with each refresh: the latest candles can still change. */
const tailDays = 3;

type Kept = { series: string; points: PricePoint[]; first_day: string; checked_to: string; fetched_at: string; full_at: string };
/** Reads a series' closes from `from` through `to` from the feeds, with the feed's own completeness checks. */
export type LiveHistory = (from: string, to: string) => Promise<PricePoint[]>;
export type HistoryCacheDeps = { db?: ServiceDatabase | null; now?: () => number; later?: (work: () => Promise<void>) => void };

async function readKept(db: ServiceDatabase, series: string): Promise<Kept | null> {
 // Before migration 157 nothing is kept, and every series is read from the feeds as before.
 try { return (await db.read<Kept[]>(`/rest/v1/price_history?select=*&series=eq.${encodeURIComponent(series)}`))[0] ?? null; }
 catch { return null; }
}
async function keep(db: ServiceDatabase | null, row: Kept) {
 if (!db || !row.points.length) return;
 try { await db.write('/rest/v1/price_history?on_conflict=series', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) }); } catch { /* Kept next time. */ }
}
const byDate = (points: PricePoint[]) => [...points].sort((a, b) => a.date.localeCompare(b.date));
/** `kept` with `fresh` laid over it, day by day. */
const merged = (kept: PricePoint[], fresh: PricePoint[]) => byDate([...new Map([...kept, ...fresh].map(point => [point.date, point])).values()]);

/** The closes a comparison of `start`–`end` draws, as the feeds return them: a stock from its last close on or before
 * `start` (the feed reads ten days back), a coin from `start`, or from its latest close when `start` has none yet. */
function period(points: PricePoint[], start: string, end: string, stock: boolean) {
 const upTo = points.filter(point => point.date <= end);
 if (stock) return upTo.filter(point => point.date >= shiftDay(start, -10));
 const latest = upTo.at(-1)?.date;
 const opening = latest && latest < start ? latest : start;
 return upTo.filter(point => point.date >= opening);
}
const reaches = (kept: Kept | null, start: string, end: string) => !!kept && kept.first_day <= start && kept.checked_to >= end;
/** Kept closes still worth showing when a feed fails: they start in time and end within a week of `end`. */
const standsIn = (kept: Kept | null, start: string, end: string) => !!kept && kept.first_day <= start && kept.checked_to >= shiftDay(end, -7);

/** Reads `series` again: the whole kept span once a stock row is a week old (or the row starts too late), otherwise only
 * the days since it was last asked, from a few days before, laid over the kept closes. */
type Ask = { series: string; start: string; end: string; live: LiveHistory; now: number };
async function refreshed(kept: Kept | null, { series, start, end, live, now }: Ask): Promise<Kept> {
 const stock = series.startsWith('stock:'), stamp = new Date(now).toISOString();
 if (!kept || kept.first_day > start || (stock && now - Date.parse(kept.full_at) >= stockFullEveryMs)) {
  // The whole kept span is read again with the period, so a stock's closes share one adjustment.
  const from = kept && kept.first_day < start ? kept.first_day : start;
  const points = byDate(await live(from, end));
  return { series, points, first_day: points[0]?.date ?? from, checked_to: end, fetched_at: stamp, full_at: stamp };
 }
 const tail = await live(shiftDay(kept.checked_to < end ? kept.checked_to : end, -tailDays), end);
 return { ...kept, points: merged(kept.points, tail), checked_to: end > kept.checked_to ? end : kept.checked_to, fetched_at: stamp };
}

/** The closes of `series` for a comparison of `start`–`end`, from the kept row when it reaches the period, otherwise
 * from the feeds (`live`), which are then kept. */
export async function keptHistory(series: string, start: string, end: string, live: LiveHistory, deps: HistoryCacheDeps = {}): Promise<PricePoint[]> {
 const db = deps.db === undefined ? serviceDatabase() : deps.db, now = (deps.now ?? Date.now)(), stock = series.startsWith('stock:');
 const kept = db ? await readKept(db, series) : null;
 const ask = { series, start, end, live, now };
 const stale = !kept || now - Date.parse(kept.fetched_at) >= historyFreshForMs || (stock && now - Date.parse(kept.full_at) >= stockFullEveryMs);
 if (kept && reaches(kept, start, end)) {
  if (stale) {
   const work = async () => { try { await keep(db, await refreshed(kept, ask)); } catch { /* Read again next time. */ } };
   if (deps.later) deps.later(work); else void work();
  }
  return period(kept.points, start, end, stock);
 }
 try {
  const row = await refreshed(kept, ask);
  if (deps.later) deps.later(() => keep(db, row)); else await keep(db, row);
  return period(row.points, start, end, stock);
 } catch (error) {
  if (kept && standsIn(kept, start, end)) return period(kept.points, start, end, stock);
  throw error;
 }
}
