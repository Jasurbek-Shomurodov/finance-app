// The one place exchange rates are downloaded, and only from the daily Vercel job (/api/cron/exchange-rates). cbu.uz
// answers only addresses in Uzbekistan, so each day's table comes from the Currency API, whose dated files every
// server can reach. Every rate is units of a currency per US dollar (UZS/USD, EUR/USD, INR/USD); any other pair goes
// through the dollar. What a run downloads goes to the database, and a day or table already there is never asked again.
// Requests from people read the database only (lib/official-rate.ts, lib/day-rate-tables.ts, lib/market-cache.ts), so
// nobody waits for a rate.
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
async function fetchDay(day: string): Promise<DayTable> {
 let failure: unknown;
 for (const url of dayUrls(day)) {
  try {
   const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(feedTimeoutMs) });
   if (response.ok) return usdDayTable(await response.json(), day);
   failure = Error('Historical exchange rates are unavailable.');
  } catch (error) { failure = error; }
 }
 throw failure;
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
 await Promise.all(wanted.map(day => fetchDay(day).then(rates => { rows.push({ day, rates, source: daySource }); }, () => undefined)));
 const saved = rows.length ? await db.write('/rest/v1/exchange_rate_days?on_conflict=day', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }) : null;
 const kept = saved?.ok ? new Set(rows.map(row => row.day)) : new Set<string>();
 return { kept: kept.size, missing: wanted.filter(day => !kept.has(day)) };
}
async function latestDay(db: ServiceDatabase, today: string) {
 const [row] = await db.read<Array<{ day: string; rates: DayTable; source: string }>>(`/rest/v1/exchange_rate_days?select=day,rates,source&day=lte.${today}&order=day.desc&limit=1`);
 return row;
}
async function globalRatesAreFresh(db: ServiceDatabase, now: number) {
 try { const [row] = await db.read<Array<{ fetched_at: string }>>('/rest/v1/market_quotes?select=fetched_at&key=eq.rates'); return !!row && now - Date.parse(row.fetched_at) < ratesFreshMs; }
 catch { return false; }
}

export type RefreshResult = { asked: number; kept: number; missing: string[]; dollar: number | null; global: 'kept' | 'fresh' | 'failed' };
/** The daily run: downloads each of `days` not in the database yet, sets the dollar rate from the latest of them, and
 * refreshes the global table when it is due. Only what is missing is requested, so a repeat run downloads nothing. */
export async function refreshExchangeRates(days: string[], { db, today, now = Date.now() }: { db: ServiceDatabase; today: string; now?: number }): Promise<RefreshResult> {
 const before = new Set(await keptDaysBetween(days[0], days.at(-1)!, db));
 const { kept, missing } = await keepDays(days.filter(day => !before.has(day)), db);
 const latest = await latestDay(db, today);
 const fx = latest && days.includes(latest.day) && latest.rates.UZS ? { rate: latest.rates.UZS, date: latest.day, source: latest.source } : null;
 let global: RefreshResult['global'] = 'fresh', ratesAnswer: Awaited<ReturnType<typeof loadGlobalRates>> | null = null;
 if (!await globalRatesAreFresh(db, now)) { ratesAnswer = await loadGlobalRates().catch(() => null); global = ratesAnswer ? 'kept' : 'failed'; }
 await keepMarket(db, { fx, ...ratesAnswer, quotes: {}, errors: {} } as Parameters<typeof keepMarket>[1]);
 return { asked: days.length, kept, missing, dollar: fx?.rate ?? null, global };
}
