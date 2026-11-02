// The one place exchange rates are downloaded, and only from the daily Vercel job (/api/cron/exchange-rates). cbu.uz
// answers only addresses in Uzbekistan, so each day's table comes from the Currency API, whose dated files every
// server can reach. Every rate is units of a currency per US dollar (UZS/USD, EUR/USD, INR/USD); any other pair goes
// through the dollar. What a run downloads goes to the database, and a day or table already there is never asked again.
// Requests from people read the database only (lib/official-rate.ts, lib/day-rate-tables.ts, lib/market-cache.ts), so
// nobody waits for a rate.
import { forEachLimited } from './bounded-concurrency';
import { isCurrency } from './currencies';
import { keptDaysBetween } from './day-rate-tables';
import { keepMarket } from './market-cache';
import { feedRead, feedTimeoutMs } from './server-market';
import type { ServiceDatabase } from './service-role';
import type { DayTable } from './transaction-rates';

/** Where a downloaded day's rates came from, as exchange_rate_days.source allows it (migration 160). */
const daySource = 'Currency API';
/** The same dated file on the provider's two hosts, tried in order. */
const dayUrls = (day: string) => [`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day}/v1/currencies/usd.min.json`, `https://${day}.currency-api.pages.dev/v1/currencies/usd.min.json`];

/** A dated file as units of each catalogue currency per US dollar; its crypto and metals are left out. */
export function usdDayTable(body: unknown, day: string): DayTable {
 const { date, usd } = (body ?? {}) as { date?: unknown; usd?: Record<string, unknown> };
 const rates = Object.entries(usd ?? {}).map(([code, rate]) => [code.toUpperCase(), Number(rate)] as const).filter(([code, rate]) => isCurrency(code) && Number.isFinite(rate) && rate > 0);
 const table = Object.fromEntries(rates);
 if (date !== day || !table.UZS) throw Error('Historical exchange rates are unavailable.');
 return { ...table, USD: 1 };
}
/** A day's table; null when neither host has a file for it, and a throw when they could not be asked, so a later run tries again. */
async function fetchDay(day: string): Promise<DayTable | null> {
 let failure: unknown = null;
 for (const url of dayUrls(day)) {
  try {
   const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(feedTimeoutMs) });
   if (response.ok) return usdDayTable(await response.json(), day);
   if (response.status !== 404) failure = Error('Historical exchange rates are unavailable.');
  } catch (error) { failure = error; }
 }
 if (failure) throw failure;
 return null;
}

/** Today's table of every currency per dollar from open.er-api, for the currencies and the Settings credit. */
export async function loadGlobalRates(): Promise<{ rates: Record<string, number>; ratesDate: string }> {
 const result = await feedRead('https://open.er-api.com/v6/latest/USD', 86400, AbortSignal.timeout(feedTimeoutMs * 2)) as { result: string; base_code: string; rates: Record<string, number>; time_last_update_unix: number };
 if (result.result !== 'success' || result.base_code !== 'USD' || !Number.isFinite(result.time_last_update_unix)) throw Error('invalid_fx');
 const rates = Object.fromEntries(Object.entries(result.rates).filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0));
 return { rates: { ...rates, USD: 1 }, ratesDate: new Date(result.time_last_update_unix * 1000).toISOString().slice(0, 10) };
}

/** A global table this young is not asked for again: a retried run downloads nothing. */
const ratesFreshMs = 12 * 60 * 60_000;

async function keepDays(wanted: string[], db: ServiceDatabase) {
 const rows: Array<{ day: string; rates: DayTable; source: string }> = [];
 await Promise.all(wanted.map(day => fetchDay(day).then(rates => { if (rates) rows.push({ day, rates, source: daySource }); }, () => undefined)));
 const saved = rows.length ? await db.write('/rest/v1/exchange_rate_days?on_conflict=day', { ...dayWrite, body: JSON.stringify(rows) }) : null;
 const kept = saved?.ok ? new Set(rows.map(row => row.day)) : new Set<string>();
 return { kept: kept.size, missing: wanted.filter(day => !kept.has(day)) };
}
/** The first day the provider has a dated file for. */
const firstProviderDay = '2024-03-02';
/** Saved days fetched before this moment may lack currencies: CBU's tables hold about 75 of the catalogue's. Move it to now
 * when a currency joins lib/currencies.json, and the daily runs complete every saved day once more, by themselves. */
export const catalogueChangedAt = '2026-11-02T10:00:00Z';
/** Older days completed per run: each is one download. */
const completedPerRun = 60, completeConcurrency = 8;
const dayWrite = { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } };

/** Adds to saved days the currencies they lack, leaving every saved rate and its source as they are. A day is asked
 * once: writing it moves its `fetched_at` past `catalogueChangedAt`, even when the provider has no file for it. */
export async function completeOlderDays(db: ServiceDatabase, at = new Date().toISOString()): Promise<number> {
 const rows = await db.read<Array<{ day: string; rates: DayTable; source: string }>>(`/rest/v1/exchange_rate_days?select=day,rates,source&day=gte.${firstProviderDay}&fetched_at=lt.${encodeURIComponent(catalogueChangedAt)}&order=day.desc&limit=${completedPerRun}`);
 const done: Array<{ day: string; rates: DayTable; source: string; fetched_at: string }> = [];
 await forEachLimited(rows, completeConcurrency, async row => {
  const table = await fetchDay(row.day).catch(() => undefined);
  if (table !== undefined) done.push({ ...row, rates: { ...table, ...row.rates }, fetched_at: at });
 });
 if (!done.length) return 0;
 const saved = await db.write('/rest/v1/exchange_rate_days?on_conflict=day', { ...dayWrite, body: JSON.stringify(done) });
 return saved.ok ? done.length : 0;
}

async function latestDay(db: ServiceDatabase, today: string) {
 const [row] = await db.read<Array<{ day: string; rates: DayTable; source: string }>>(`/rest/v1/exchange_rate_days?select=day,rates,source&day=lte.${today}&order=day.desc&limit=1`);
 return row;
}
async function globalRatesAreFresh(db: ServiceDatabase, now: number) {
 try { const [row] = await db.read<Array<{ fetched_at: string }>>('/rest/v1/market_quotes?select=fetched_at&key=eq.rates'); return !!row && now - Date.parse(row.fetched_at) < ratesFreshMs; }
 catch { return false; }
}

export type RefreshResult = { asked: number; kept: number; missing: string[]; completed: number; dollar: number | null; global: 'kept' | 'fresh' | 'failed' };
/** The daily run: downloads each of `days` not in the database yet, sets the dollar rate from the latest of them,
 * refreshes the global table when it is due and completes a batch of older days. Only what is missing is requested, so a
 * repeat run downloads nothing. */
export async function refreshExchangeRates(days: string[], { db, today, now = Date.now() }: { db: ServiceDatabase; today: string; now?: number }): Promise<RefreshResult> {
 const before = new Set(await keptDaysBetween(days[0], days.at(-1)!, db));
 const { kept, missing } = await keepDays(days.filter(day => !before.has(day)), db);
 const latest = await latestDay(db, today);
 const fx = latest && days.includes(latest.day) && latest.rates.UZS ? { rate: latest.rates.UZS, date: latest.day, source: latest.source } : null;
 let global: RefreshResult['global'] = 'fresh', ratesAnswer: Awaited<ReturnType<typeof loadGlobalRates>> | null = null;
 if (!await globalRatesAreFresh(db, now)) { ratesAnswer = await loadGlobalRates().catch(() => null); global = ratesAnswer ? 'kept' : 'failed'; }
 await keepMarket(db, { fx, ...ratesAnswer, quotes: {}, errors: {} } as Parameters<typeof keepMarket>[1]);
 const completed = await completeOlderDays(db).catch(() => 0);
 return { asked: days.length, kept, missing, completed, dollar: fx?.rate ?? null, global };
}
