import type { MarketData, Quote } from '@/lib/market';
/** One feed read waits at most this long, and one market load at most `loadBudgetMs` in all: the dashboard waits for the
 * first market answer, so a slow feed must not hold it (it used to wait 8 s, retry and wait 8 s again, per feed). */
export const feedTimeoutMs = 5000, loadBudgetMs = 9000;
/** Runs one request under its own timeout and the load's deadline. A plain controller and timer, not AbortSignal.any:
 * a combined signal nothing else holds can be collected before it fires, and the request then never ends. It also stops
 * waiting on abort itself, so a request that ignores its signal cannot hold the load either. */
async function withinTime<T>(deadline: AbortSignal, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
 const controller = new AbortController(), stop = () => controller.abort(deadline.reason ?? new DOMException('Timed out', 'TimeoutError'));
 const timer = setTimeout(stop, feedTimeoutMs);
 const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
 if (deadline.aborted) stop(); else deadline.addEventListener('abort', stop, { once: true });
 try { return await Promise.race([run(controller.signal), aborted]); }
 finally { clearTimeout(timer); deadline.removeEventListener('abort', stop); }
}
async function read(url: string, seconds: number, deadline: AbortSignal): Promise<unknown> {
 for (let attempt = 0; attempt < 2; attempt++) {
  try {
   const response = await withinTime(deadline, signal => fetch(url, { next: { revalidate: seconds }, signal }).then(async answer => answer.ok ? { answer, body: await answer.json() } : { answer }));
   if (response.answer.ok) return response.body;
   if (attempt === 0 && !deadline.aborted && (response.answer.status === 429 || response.answer.status >= 500)) {
    await new Promise(resolve => setTimeout(resolve, 300));
    continue;
   }
   // Never log the full URL: some market providers include API keys in it.
   console.warn('Market feed unavailable', new URL(url).hostname, response.answer.status);
   throw new Error('feed_http_error');
  } catch (error) {
   if (error instanceof Error && error.message === 'feed_http_error') throw error;
   if (attempt === 0 && !deadline.aborted) { await new Promise(resolve => setTimeout(resolve, 300)); continue; }
   console.warn('Market feed unavailable', new URL(url).hostname, deadline.aborted ? 'load_budget_spent' : 'network_or_response_error');
   throw error;
  }
 }
 throw new Error('feed_unavailable');
}
function positive(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('invalid_price');
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error('invalid_price');
  return number;
}
/** A Twelve Data price without its float noise: `close` arrives as single precision, so 330.32 reads "330.32001" and 238.9
 * "238.89999" (FMT-023). Four decimals, or six significant digits below a dollar, keep every real quote. */
export function marketQuote(value: unknown) {
  const number = positive(value);
  const places = Math.max(4, 5 - Math.floor(Math.log10(number)));
  const scale = 10 ** places;
  return Math.round(number * scale) / scale;
}
// Coinbase's spot endpoint has no market for these coins, or answers with an unrelated asset that shares the ticker (JUP).
export const krakenCoins = new Set(['XMR', 'JUP', 'KAS', 'MNT', 'OKB', 'BGB', 'NEO', 'XDC', 'QTUM', 'CELO', 'AR', 'RUNE', 'A', 'DYDX', 'GMX', 'LRC', 'STORJ', 'GRASS', 'GALA', 'ENJ', 'NOT', 'MEW', 'USDE', 'RLUSD', 'XAUT']);
async function krakenPrice(symbol: string, deadline: AbortSignal) {
  const result = await read(`https://api.kraken.com/0/public/Ticker?pair=${symbol}USD`, 300, deadline) as { error?: string[]; result?: Record<string, { c?: string[] }> };
  const pairs = Object.entries(result.result ?? {});
  // Kraken names some pairs in its own style (XXMRZUSD), so accept one USD pair that carries the symbol.
  if (result.error?.length || pairs.length !== 1 || !pairs[0][0].includes(symbol) || !pairs[0][0].endsWith('USD')) throw new Error('invalid_quote');
  return positive(pairs[0][1].c?.[0]);
}
/** A Twelve Data quote that must answer for `symbol`; `usdOnly` also refuses a quote in another currency. */
async function twelveDataQuote(symbol: string, key: string, deadline: AbortSignal, usdOnly = false): Promise<Quote> {
  const url = new URL('https://api.twelvedata.com/quote');
  url.searchParams.set('symbol', symbol); url.searchParams.set('apikey', key);
  const result = await read(url.href, 300, deadline) as { symbol?: string; currency?: string; close?: string; timestamp?: number };
  if (result.symbol !== symbol || (usdOnly && result.currency !== 'USD')) throw new Error('invalid_quote');
  const quote: Quote = { usd: marketQuote(result.close), source: 'Twelve Data', fetchedAt: new Date().toISOString() };
  if (Number.isFinite(result.timestamp)) quote.marketTime = new Date(result.timestamp! * 1000).toISOString();
  return quote;
}
/** A metal's spot price per fine troy ounce in USD from gold-api.com, which needs no key. */
async function goldApiMetal(symbol: string, deadline: AbortSignal): Promise<Quote> {
  const result = await read(`https://api.gold-api.com/price/${symbol}`, 300, deadline) as { symbol?: string; currency?: string; price?: number; updatedAt?: string };
  if (result.symbol !== symbol || result.currency !== 'USD') throw new Error('invalid_quote');
  const quote: Quote = { usd: marketQuote(result.price), source: 'gold-api.com', fetchedAt: new Date().toISOString() };
  const marketTime = Date.parse(result.updatedAt ?? '');
  if (Number.isFinite(marketTime)) quote.marketTime = new Date(marketTime).toISOString();
  return quote;
}
/** `metalAccess` defaults to `stockAccess`; metals need no key of their own (gold-api.com), only a signed-in reader. */
export async function loadMarket(crypto:string[],stocks:string[],stockAccess:boolean,metals:string[]=[],metalAccess=stockAccess):Promise<MarketData> {
  const key = process.env.TWELVE_DATA_API_KEY;
  const data: MarketData = { fx: null, quotes: {}, errors: {}, stocksConfigured: !!key };
  // Feeds still unanswered when the budget is spent count as unavailable; the rest of the answer is kept.
  const budget = new AbortController(), deadline = budget.signal, budgetTimer = setTimeout(() => budget.abort(new DOMException('Market load budget spent', 'TimeoutError')), loadBudgetMs);
  const jobs: Array<() => Promise<void>> = [async () => {
    try {
      const rows = await read('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/', 3600, deadline) as Array<{ Ccy: string; Rate: string; Nominal: string; Date: string }>;
      const usd = rows.find(row => row.Ccy === 'USD');
      if (!usd || !/^\d{2}\.\d{2}\.\d{4}$/.test(usd.Date)) throw new Error('invalid_fx');
      data.fx = { rate: positive(usd.Rate) / positive(usd.Nominal), date: usd.Date.split('.').reverse().join('-'), source: 'CBU' };
    } catch { data.errors.fx = 'Exchange rate unavailable.'; }
  }];
  jobs.push(async () => {
    try {
      const result = await read('https://open.er-api.com/v6/latest/USD', 86400, deadline) as { result: string; base_code: string; rates: Record<string, number>; time_last_update_unix: number };
      if (result.result !== 'success' || result.base_code !== 'USD' || !Number.isFinite(result.time_last_update_unix)) throw Error('invalid_fx');
      data.rates = Object.fromEntries(Object.entries(result.rates).filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0));
      data.rates.USD = 1;
      data.ratesDate = new Date(result.time_last_update_unix * 1000).toISOString().slice(0, 10);
    } catch { data.errors.rates = 'Exchange rate unavailable.'; }
  });
  for (const symbol of crypto) jobs.push(async () => {
    try {
      if (krakenCoins.has(symbol)) { data.quotes[`Crypto:${symbol}`] = { usd: await krakenPrice(symbol, deadline), source: 'Kraken', fetchedAt: new Date().toISOString() }; return; }
      const result = await read(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`, 300, deadline) as { data?: { base: string; currency: string; amount: string } };
      if (result.data?.base !== symbol || result.data.currency !== 'USD') throw new Error('invalid_quote');
      data.quotes[`Crypto:${symbol}`] = { usd: positive(result.data.amount), source: 'Coinbase', fetchedAt: new Date().toISOString() };
    } catch { data.errors[`Crypto:${symbol}`] = 'Price unavailable. Saved price is shown.'; }
  });
  for (const symbol of stocks) jobs.push(async () => {
    if (!key) { data.errors[`Stock:${symbol}`] = 'Stock prices need a market-data API key.'; return; }
    if (!stockAccess) { data.errors[`Stock:${symbol}`] = 'Sign in to fetch stock prices.'; return; }
    try {
      // Only USD-denominated stocks are supported; never treat a foreign quote as USD.
      data.quotes[`Stock:${symbol}`] = await twelveDataQuote(symbol, key, deadline, true);
    } catch { data.errors[`Stock:${symbol}`] = 'Price unavailable. Saved price is shown.'; }
  });
  // Spot prices per fine troy ounce. The Twelve Data plan quotes gold (XAU/USD) only, so silver, platinum and palladium
  // come from gold-api.com (free, no key; INV-050). Each source stands in when the other fails.
  for (const symbol of metals) jobs.push(async () => {
    if (!metalAccess) { data.errors[`Metal:${symbol}`] = 'Sign in to fetch metal prices.'; return; }
    // A metal's spot price per fine troy ounce from Twelve Data (XAU/USD and so on).
    const twelveData = key ? [() => twelveDataQuote(`${symbol}/USD`, key, deadline)] : [];
    const sources = symbol === 'XAU' ? [...twelveData, () => goldApiMetal(symbol, deadline)] : [() => goldApiMetal(symbol, deadline), ...twelveData];
    for (const source of sources) {
      try { data.quotes[`Metal:${symbol}`] = await source(); return; } catch { /* try the next source */ }
    }
    data.errors[`Metal:${symbol}`] = 'Price unavailable. Saved price is shown.';
  });
  // Bound upstream concurrency; individual failures do not hide successful prices. The loop repeats forEachLimited
  // (lib/bounded-concurrency.ts) because scripts/create-test-investment-sql.mjs imports this file natively with Node,
  // which cannot resolve an `@/` or extensionless import; every job catches its own failure, so the two behave alike.
  let index = 0;
  try { await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => { while (index < jobs.length) await jobs[index++](); })); }
  finally { clearTimeout(budgetTimer); }
  if (data.fx) data.rates = { ...data.rates, USD: 1, UZS: data.fx.rate };
  return data;
}
