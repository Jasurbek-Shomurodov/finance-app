// The one place exchange rates are downloaded, and only from the daily jobs: `npm run rates:fill` on the Mac, the one
// address cbu.uz answers, and /api/cron/exchange-rates on the server. Every rate is units of a currency per US dollar
// (UZS/USD, EUR/USD, INR/USD); any other pair goes through the dollar. What a run downloads goes to the database, and a
// day or table already there is never asked again. Requests from people read the database only (lib/official-rate.ts,
// lib/day-rate-tables.ts, lib/market-cache.ts), so nobody waits for a rate.
import { dayTables, keptDaysBetween } from './day-rate-tables';
import { keepMarket } from './market-cache';
import { feedRead, feedTimeoutMs } from './server-market';
import type { ServiceDatabase } from './service-role';
import type { DayTable } from './transaction-rates';

const unavailable = () => Error('Historical exchange rates are unavailable.');
const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

/** A day's archive rows (UZS per `Nominal` units, effective on or before the day) as units of each currency per US dollar. */
export function cbuDayTable(rows: unknown, day: string): DayTable {
 if (!validDay(day) || !Array.isArray(rows)) throw unavailable();
 const uzs: Record<string, number> = { UZS: 1 };
 for (const row of rows as Record<string, unknown>[]) {
  const effective = typeof row?.Date === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(row.Date) ? row.Date.split('.').reverse().join('-') : '';
  if (typeof row?.Ccy === 'string' && /^[A-Z]{3}$/.test(row.Ccy) && row.Ccy !== 'UZS' && validDay(effective) && effective <= day && positive(row.Rate) && positive(row.Nominal)) uzs[row.Ccy] = Number(row.Rate) / Number(row.Nominal);
 }
 if (!uzs.USD) throw unavailable();
 return Object.fromEntries(Object.entries(uzs).map(([currency, value]) => [currency, currency === 'USD' ? 1 : uzs.USD / value]));
}

/** How long the archive is left alone after it did not answer: on the server every day would otherwise wait out the timeout. */
export const archiveRestMs = 10 * 60_000;
let archiveSilentUntil = 0;
async function fetchCbuDay(day: string, now = Date.now): Promise<DayTable> {
 if (now() < archiveSilentUntil) throw unavailable();
 let response: Response;
 try { response = await fetch(`https://cbu.uz/ru/arkhiv-kursov-valyut/json/all/${day}/`, { cache: 'no-store', signal: AbortSignal.timeout(4000) }); }
 catch (error) { if ((error as Error)?.name === 'TimeoutError') archiveSilentUntil = now() + archiveRestMs; throw error; }
 if (!response.ok) throw unavailable();
 return cbuDayTable(await response.json(), day);
}

/** Today's table of every currency per dollar from open.er-api, which answers everywhere and covers the currencies the archive does not. */
export async function loadGlobalRates(): Promise<{ rates: Record<string, number>; ratesDate: string }> {
 const result = await feedRead('https://open.er-api.com/v6/latest/USD', 86400, AbortSignal.timeout(feedTimeoutMs * 2)) as { result: string; base_code: string; rates: Record<string, number>; time_last_update_unix: number };
 if (result.result !== 'success' || result.base_code !== 'USD' || !Number.isFinite(result.time_last_update_unix)) throw Error('invalid_fx');
 const rates = Object.fromEntries(Object.entries(result.rates).filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0));
 return { rates: { ...rates, USD: 1 }, ratesDate: new Date(result.time_last_update_unix * 1000).toISOString().slice(0, 10) };
}

/** Days kept per write, so a long run that stops loses little. */
const dayBatch = 100, dayConcurrency = 4;
/** A global table this young is not asked for again: the feed publishes one a day and two jobs run. */
const ratesFreshMs = 12 * 60 * 60_000;

async function keepDays(wanted: string[], db: ServiceDatabase) {
 const missing: string[] = [];
 let kept = 0;
 for (let start = 0; start < wanted.length; start += dayBatch) {
  const queue = wanted.slice(start, start + dayBatch), rows: Array<{ day: string; rates: DayTable; source: 'CBU' }> = [];
  missing.push(...queue);
  const worker = async () => { for (let day = queue.shift(); day; day = queue.shift()) { const asked = day; await fetchCbuDay(asked).then(rates => { rows.push({ day: asked, rates, source: 'CBU' }); missing.splice(missing.indexOf(asked), 1); }, () => undefined); } };
  await Promise.all(Array.from({ length: dayConcurrency }, worker));
  if (rows.length) { const saved = await db.write('/rest/v1/exchange_rate_days?on_conflict=day', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }); if (saved.ok) kept += rows.length; else missing.push(...rows.map(row => row.day)); }
 }
 return { kept, missing };
}
async function globalRatesAreFresh(db: ServiceDatabase, now: number) {
 try { const [row] = await db.read<Array<{ fetched_at: string }>>('/rest/v1/market_quotes?select=fetched_at&key=eq.rates'); return !!row && now - Date.parse(row.fetched_at) < ratesFreshMs; }
 catch { return false; }
}

export type RefreshResult = { asked: number; kept: number; missing: string[]; dollar: number | null; global: 'kept' | 'fresh' | 'failed' };
/** The daily run: downloads each of `days` not in the database yet, sets today's dollar rate from today's table, and
 * refreshes the global table when it is due. Only what is missing is requested, so a repeat run downloads nothing. */
export async function refreshExchangeRates(days: string[], { db, today, now = Date.now() }: { db: ServiceDatabase; today: string; now?: number }): Promise<RefreshResult> {
 const before = new Set(await keptDaysBetween(days[0], days.at(-1)!, db));
 const { kept, missing } = await keepDays(days.filter(day => !before.has(day)), db);
 const table = (await dayTables([today], { db, today })).get(today);
 const fx = table?.UZS ? { rate: table.UZS, date: today, source: 'CBU' as const } : null;
 let global: RefreshResult['global'] = 'fresh', ratesAnswer: Awaited<ReturnType<typeof loadGlobalRates>> | null = null;
 if (!await globalRatesAreFresh(db, now)) { ratesAnswer = await loadGlobalRates().catch(() => null); global = ratesAnswer ? 'kept' : 'failed'; }
 await keepMarket(db, { fx, ...ratesAnswer, quotes: {}, errors: {} } as Parameters<typeof keepMarket>[1]);
 return { asked: days.length, kept, missing, dollar: fx?.rate ?? null, global };
}
