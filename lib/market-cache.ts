// Kept market prices (migration 156). Each feed answer (the CBU dollar rate, the global rate table, one instrument's
// quote) is kept in `market_quotes` for every workspace. A reader is answered from the kept rows at once; only an answer
// nobody holds yet is fetched before replying, and one past its freshness is refreshed after the reply (`later`). A feed
// that fails keeps its last good answer instead of reading as unavailable, for up to `usableForMs`.
import { loadFeeds, type FeedRequest } from './server-market';
import { serviceDatabase, type ServiceDatabase } from './service-role';
import type { MarketData, Quote } from './market';

/** How long each kind of answer counts as current; quotes move by the minute, the official rates once a day. */
export const freshForMs = { quote: 5 * 60_000, fx: 60 * 60_000, rates: 6 * 60 * 60_000 };
/** A kept answer older than this is not shown at all: it is fetched before replying, as if never kept. */
export const usableForMs = 3 * 24 * 60 * 60_000;

type Fx = NonNullable<MarketData['fx']>;
type RatesRow = { rates: Record<string, number>; ratesDate?: string };
type Kept = { key: string; data: Quote | Fx | RatesRow; fetched_at: string };
export type MarketCacheDeps = { db?: ServiceDatabase | null; now?: () => number; later?: (work: () => Promise<void>) => void; load?: typeof loadFeeds };

const freshness = (key: string) => key === 'fx' ? freshForMs.fx : key === 'rates' ? freshForMs.rates : freshForMs.quote;
const quoted = (keys: string[]) => keys.map(key => `"${key}"`).join(',');

async function readKept(db: ServiceDatabase, keys: string[]): Promise<Kept[]> {
 if (!keys.length) return [];
 // Before migration 156 nothing is kept, and every feed is fetched as before.
 try { return await db.read<Kept[]>(`/rest/v1/market_quotes?select=key,data,fetched_at&key=in.(${encodeURIComponent(quoted(keys))})`); }
 catch { return []; }
}

/** The answers of `data` worth keeping: the rate feeds that answered and every quote. */
function keepable(data: MarketData) {
 const rows: Array<{ key: string; data: unknown; fetched_at: string }> = [], at = new Date().toISOString();
 if (data.fx && !data.errors.fx) rows.push({ key: 'fx', data: data.fx, fetched_at: at });
 // Only an answer of the global rate table carries its date; a load that asked for the CBU rate alone holds just
 // USD and UZS in `rates`, which must never replace the kept table.
 if (data.rates && data.ratesDate && !data.errors.rates) rows.push({ key: 'rates', data: { rates: data.rates, ratesDate: data.ratesDate }, fetched_at: at });
 for (const [key, quote] of Object.entries(data.quotes)) rows.push({ key, data: quote, fetched_at: quote.fetchedAt });
 return rows;
}
/** Keeps a live answer of the feeds for every reader; a failed write is retried by the next reader's refresh. */
export async function keepMarket(db: ServiceDatabase | null, data: MarketData) {
 if (!db) return;
 // Keeping never fails the caller (the nightly snapshot run, a reply already sent): the next refresh keeps them.
 try {
  const rows = keepable(data);
  if (rows.length) await db.write('/rest/v1/market_quotes?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
 } catch { /* Kept next time. */ }
}

/** `request` narrowed to the keys in `keys`; the rest are answered from kept rows. */
function narrowed(request: FeedRequest, keys: Set<string>): FeedRequest {
 return { ...request, fx: request.fx && keys.has('fx'), rates: request.rates && keys.has('rates'), crypto: request.crypto.filter(s => keys.has(`Crypto:${s}`)), stocks: request.stocks.filter(s => keys.has(`Stock:${s}`)), metals: request.metals.filter(s => keys.has(`Metal:${s}`)) };
}
const asks = (request: FeedRequest) => request.fx || request.rates || request.crypto.length + request.stocks.length + request.metals.length > 0;

/** Lays the kept rows under `live`: a live answer wins, a kept one fills a feed live did not answer and clears its error.
 * `liveRates` says whether live asked the global rate table; otherwise live's rates hold only the CBU dollar rate. */
function merged(kept: Kept[], live: MarketData | null, liveRates: boolean, stocksConfigured: boolean): MarketData {
 const data: MarketData = live ? { ...live, quotes: { ...live.quotes }, errors: { ...live.errors } } : { fx: null, quotes: {}, errors: {}, stocksConfigured };
 for (const row of kept) {
  if (row.key === 'fx') { if (!data.fx) { data.fx = row.data as Fx; delete data.errors.fx; } continue; }
  if (row.key === 'rates') { if (!liveRates || data.errors.rates) { const table = row.data as RatesRow; data.rates = { ...table.rates, ...data.rates }; data.ratesDate = table.ratesDate; delete data.errors.rates; } continue; }
  if (!data.quotes[row.key]) { data.quotes[row.key] = row.data as Quote; delete data.errors[row.key]; }
 }
 if (data.fx) data.rates = { ...data.rates, USD: 1, UZS: data.fx.rate };
 return data;
}

/** Answers `request` from the kept prices: what is kept and current at once, what nobody holds yet live (within the
 * feeds' own budget), and what is kept but past its freshness from the kept row while `later` refreshes it. A stock or
 * metal the reader may not fetch is never read from the kept rows either; the feeds answer it with their own note. */
export async function cachedMarket(request: FeedRequest, deps: MarketCacheDeps = {}): Promise<MarketData> {
 const db = deps.db === undefined ? serviceDatabase() : deps.db, load = deps.load ?? loadFeeds, now = (deps.now ?? Date.now)();
 const allowed = [...(request.fx ? ['fx'] : []), ...(request.rates ? ['rates'] : []), ...request.crypto.map(s => `Crypto:${s}`),
  ...(request.stockAccess && process.env.TWELVE_DATA_API_KEY ? request.stocks.map(s => `Stock:${s}`) : []), ...(request.metalAccess ? request.metals.map(s => `Metal:${s}`) : [])];
 const kept = db ? (await readKept(db, allowed)).filter(row => now - Date.parse(row.fetched_at) < usableForMs) : [];
 const keptKeys = new Set(kept.map(row => row.key));
 const stale = new Set(kept.filter(row => now - Date.parse(row.fetched_at) >= freshness(row.key)).map(row => row.key));
 // Everything not kept goes to the feeds now, including the stocks and metals this reader may not fetch, which the
 // feeds answer at once with their note and no request.
 const all = new Set([...allowed, ...request.stocks.map(s => `Stock:${s}`), ...request.metals.map(s => `Metal:${s}`)]);
 const missing = narrowed(request, new Set([...all].filter(key => !keptKeys.has(key))));
 const live = asks(missing) ? await load(missing) : null;
 if (live && deps.later) deps.later(() => keepMarket(db, live)); else if (live) await keepMarket(db, live);
 const refresh = narrowed(request, stale);
 if (stale.size && asks(refresh)) {
  const work = async () => { await keepMarket(db, await load(refresh)); };
  if (deps.later) deps.later(work); else void work().catch(() => undefined);
 }
 return merged(kept, live, missing.rates, !!process.env.TWELVE_DATA_API_KEY);
}
