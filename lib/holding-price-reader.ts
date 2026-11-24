// Server only: reads one holding's price series from the kept closes, asking the feeds for what is not kept yet.
import { afterResponse } from './after-response';
import type { PricePoint } from './benchmark-data';
import { cryptoHistory, metalHistory, stockHistory } from './price-feeds';
import { keptHistory } from './price-history-cache';

/** The closes of `series` from `start` through `end`: `shares:AAPL` (a held stock, adjusted for splits only),
 * `stock:AAPL` (adjusted for dividends too), `metal:XAU` or `crypto:BTC`. All but coins need the Twelve Data key. */
export function keptSeries(series: string, start: string, end: string): Promise<PricePoint[]> {
 const [kind, symbol] = series.split(':'), key = process.env.TWELVE_DATA_API_KEY;
 if (kind !== 'crypto' && !key) return Promise.resolve([]);
 const live = (from: string, to: string) => kind === 'crypto' ? cryptoHistory(from, to, symbol)
  : kind === 'metal' ? metalHistory(symbol, from, to, key!)
  : stockHistory(symbol, from, to, key!, kind === 'shares' ? 'splits' : 'all');
 return keptHistory(series, start, end, live, { later: afterResponse });
}
