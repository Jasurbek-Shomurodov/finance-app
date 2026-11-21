// Past prices for the net worth history. A stock or coin is saved with the value it had when it was last edited, so
// without these its line stays flat between edits and jumps on the day live prices take over. Each quoted holding's
// balance is carried between its own snapshots by how far its price moved (lib/portfolio-history.ts, `priceScale`).
import type { PricePoint } from './benchmark-data';
import type { Entry } from './finance';
import { instrumentFor } from './market';

/** Daily closes by series (`stock:AAPL`, `crypto:BTC`), as lib/price-history-cache.ts keeps them. */
export type HoldingPrices = Record<string, PricePoint[]>;
type Dated = { record_id: string; occurred_on: string; balance: number | null };
/** Kept market history starts here (the benchmark comparison's own floor). */
const earliest = '2016-01-01';

/** The price series a holding follows, or null for one that is not quoted (a valued asset, a metal, an unknown name). */
export function priceSeries(record: Pick<Entry, 'kind' | 'name'>): string | null {
 if (record.kind !== 'Stock' && record.kind !== 'Crypto') return null;
 const instrument = instrumentFor(record);
 return instrument ? `${instrument.kind.toLowerCase()}:${instrument.symbol}` : null;
}

/** Every series the history needs and the first day it is needed from: its holdings' first recorded balance. */
export function neededSeries(records: readonly Pick<Entry, 'id' | 'kind' | 'name'>[], events: readonly Dated[], today: string): Map<string, string> {
 const first = new Map<string, string>();
 for (const event of events) if (event.balance !== null && event.occurred_on <= today && !(first.get(event.record_id)! <= event.occurred_on)) first.set(event.record_id, event.occurred_on);
 const needed = new Map<string, string>();
 for (const record of records) {
  const series = priceSeries(record), from = first.get(record.id);
  if (!series || !from) continue;
  const start = from < earliest ? earliest : from;
  if (!(needed.get(series)! <= start)) needed.set(series, start);
 }
 return needed;
}

/** Reads each needed series through `read`. A series that fails, or takes longer than `waitMs`, is left out: its
 * holdings keep their recorded values, and the kept closes answer at once the next time. */
export async function holdingPrices(records: readonly Pick<Entry, 'id' | 'kind' | 'name'>[], events: readonly Dated[], today: string, read: (series: string, start: string, end: string) => Promise<PricePoint[]>, waitMs = 2500): Promise<HoldingPrices> {
 const prices: HoldingPrices = {};
 await Promise.all([...neededSeries(records, events, today)].map(async ([series, start]) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   const points = await Promise.race([read(series, start, today), new Promise<PricePoint[]>(resolve => { timer = setTimeout(() => resolve([]), waitMs); })]);
   if (points.length) prices[series] = points;
  } catch { /* Left out. */ }
  finally { clearTimeout(timer); }
 }));
 return prices;
}

/** The closes by holding, for `portfolioHistory`. */
export function pricesByRecord(records: readonly Pick<Entry, 'id' | 'kind' | 'name'>[], prices: HoldingPrices | undefined): Map<string, readonly PricePoint[]> {
 const byRecord = new Map<string, readonly PricePoint[]>();
 if (!prices) return byRecord;
 for (const record of records) {
  const series = priceSeries(record), points = series ? prices[series] : undefined;
  if (points?.length) byRecord.set(record.id, points);
 }
 return byRecord;
}
