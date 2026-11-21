// The daily price feeds behind every kept price series (lib/price-history-cache.ts): Twelve Data for USD-listed stocks,
// Coinbase then Bitfinex for coins. The benchmark comparison and the net worth history's past prices both read through here.
import { dateMillis, dayMillis, shiftDay, validDay, type PricePoint } from './benchmark-data';
import { depositToday } from './deposit-interest';

async function read(url: string, fresh = false): Promise<unknown> {
 for (let attempt = 0; attempt < 2; attempt++) {
  try {
   const response = await fetch(url, { ...(fresh ? { cache: 'no-store' as const } : { next: { revalidate: 3600 } }), signal: AbortSignal.timeout(6000) });
   if (response.ok) return await response.json();
   if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
    await new Promise(resolve => setTimeout(resolve, 300));
    continue;
   }
   // Never log the full URL: some market providers include API keys in it.
   console.warn('Market feed unavailable', new URL(url).hostname, response.status);
   throw new Error('feed_http_error');
  } catch (error) {
   if (error instanceof Error && error.message === 'feed_http_error') throw error;
   if (attempt === 0) { await new Promise(resolve => setTimeout(resolve, 300)); continue; }
   console.warn('Market feed unavailable', new URL(url).hostname, 'network_or_response_error');
   throw error;
  }
 }
 throw new Error('feed_unavailable');
}
const positive = (value: unknown) => (typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value)) && Number(value) > 0;
export async function stockHistory(symbol: string, start: string, end: string, key: string): Promise<PricePoint[]> {
 const params = new URLSearchParams({ symbol, interval: '1day', start_date: shiftDay(start, -10), end_date: end, outputsize: '5000', order: 'asc', adjust: 'all', apikey: key });
 const result = await read('https://api.twelvedata.com/time_series?' + params) as { meta?: { symbol?: string; currency?: string }; values?: { datetime: string; close: string }[] };
 if (result.meta?.symbol !== symbol || result.meta?.currency !== 'USD' || !Array.isArray(result.values)) throw Error('Unavailable');
 const prices = result.values.filter(row => validDay(row.datetime) && positive(row.close) && row.datetime <= end).map(row => ({ date: row.datetime, close: Number(row.close) })).sort((a,b) => a.date.localeCompare(b.date));
 if (!prices.some(row => row.date <= start) || !prices.some(row => row.date >= shiftDay(end, -7))) throw Error('Incomplete history');
 return prices;
}
async function cryptoProviderHistory(start: string, end: string, provider: 'coinbase' | 'bitfinex', symbol = 'BTC'): Promise<PricePoint[]> {
 const rows = new Map<string, PricePoint>();
 const windows: string[] = [];
 for (let cursor = shiftDay(start, -2); cursor <= end; cursor = shiftDay(cursor, 299)) windows.push(cursor);
 let index=0;
 let failure:unknown;
 // Bound provider traffic while avoiding one network round trip per 299 days.
 await Promise.all(Array.from({length:Math.min(3,windows.length)},async()=>{
  while(index<windows.length&&!failure){
   const cursor=windows[index++];
   try {
  const last = shiftDay(cursor, 299) < shiftDay(end, 1) ? shiftDay(cursor, 299) : shiftDay(end, 1);
  let candles: unknown;
  // Closed days never change: a window ending three days or more before `end` is the same request on every load and may
  // come from the fetch cache. Only the window with the latest candles is read fresh.
  const fresh = last > shiftDay(end, -3);
  if (provider === 'coinbase') {
   const params = new URLSearchParams({ granularity: '86400', start: cursor + 'T00:00:00Z', end: last + 'T00:00:00Z' });
   candles = await read('https://api.exchange.coinbase.com/products/'+symbol+'-USD/candles?' + params, fresh);
  } else {
   const params = new URLSearchParams({ start: String(dateMillis(cursor)), end: String(dateMillis(last) - 1), limit: '299', sort: '1' });
   candles = await read('https://api-pub.bitfinex.com/v2/candles/trade:1D:t'+symbol+'USD/hist?' + params, fresh);
  }
  if (!Array.isArray(candles)) throw Error('Unavailable');
  for (const row of candles) {
   if (!Array.isArray(row)) continue;
   const timestamp = row[0];
   const close = row[provider === 'coinbase' ? 4 : 2];
   if (!positive(timestamp) || !positive(close)) continue;
   const millis = Number(timestamp) * (provider === 'coinbase' ? 1000 : 1);
   // Reject malformed timestamps before constructing dates or accepting intraday rows.
   if (!Number.isSafeInteger(millis) || millis % dayMillis !== 0 || millis < dateMillis(cursor) || millis >= dateMillis(last)) continue;
   const date = new Date(millis).toISOString().slice(0, 10);
   rows.set(date, { date, close: Number(close) });
  }
   }catch(error){failure=error;}
  }
 }));
 if(failure)throw failure;
 // Local today can be a day ahead of UTC. Exchanges may publish only the
 // last completed UTC candle; allow that tail without accepting interior gaps.
 const latest=[...rows.keys()].sort().at(-1);
 const tailDays=end===depositToday()&&new Date().getUTCHours()>=19?2:1;
 const validTail=!!latest&&(latest===end||(end===depositToday()&&latest>=shiftDay(end,-tailDays)));
 const openingDate=validTail&&latest!<start?latest!:start;
 const points=[...rows.values()].filter(point=>point.date>=openingDate).sort((a,b)=>a.date.localeCompare(b.date));
 const lastDate=points.at(-1)?.date;
 if(!validTail||points[0]?.date!==openingDate||!lastDate||points.length!==Math.round((dateMillis(lastDate)-dateMillis(openingDate))/dayMillis)+1)throw Error('Incomplete history');
 return points;
}
export async function cryptoHistory(start: string, end: string, symbol = 'BTC'): Promise<PricePoint[]> {
 for (const provider of ['coinbase', 'bitfinex'] as const) {
  try { return await cryptoProviderHistory(start, end, provider, symbol); }
  catch {
   // Fetch the entire series from the fallback, avoiding artificial returns from
   // mixing daily prices across exchanges. Do not log response bodies or URLs.
   console.warn('Crypto history unavailable', provider, 'request_or_incomplete_history');
  }
 }
 throw Error('Unavailable');
}
