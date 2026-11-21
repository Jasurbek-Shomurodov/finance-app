// Server only: reads one holding's price series from the kept closes, asking the feeds for what is not kept yet.
import { afterResponse } from './after-response';
import type { PricePoint } from './benchmark-data';
import { cryptoHistory, stockHistory } from './price-feeds';
import { keptHistory } from './price-history-cache';

/** The closes of `series` (`stock:AAPL`, `crypto:BTC`) from `start` through `end`. Stocks need the Twelve Data key. */
export function keptSeries(series: string, start: string, end: string): Promise<PricePoint[]> {
 const [kind, symbol] = series.split(':'), key = process.env.TWELVE_DATA_API_KEY;
 if (kind === 'stock' && !key) return Promise.resolve([]);
 return keptHistory(series, start, end, (from, to) => kind === 'crypto' ? cryptoHistory(from, to, symbol) : stockHistory(symbol, from, to, key!), { later: afterResponse });
}
