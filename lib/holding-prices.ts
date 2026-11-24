// Past prices for the net worth history. A stock, coin, vested share or gold holding is saved with the value it had when
// it was last edited, so without these its line stays flat between edits and jumps on the day live prices take over.
// Each quoted holding's balance is carried between its own snapshots by how far its price moved (`priceScale`), in the
// net worth history and in the benchmark comparison alike, so both value a holding the same way on every day.
import { marketHistoryStart, type PricePoint } from './benchmark-data';
import type { Entry } from './finance';
import { instrumentFor } from './market';

/** Daily closes by series (`shares:AAPL`, `crypto:BTC`, `metal:XAU`), as lib/price-history-cache.ts keeps them. */
export type HoldingPrices = Record<string, PricePoint[]>;
type Dated = { record_id: string; occurred_on: string; balance: number | null };
/** Kept market history starts here (the benchmark comparison's own floor). */
const earliest = marketHistoryStart;
type Quoted = Pick<Entry, 'kind' | 'name'> & { metal?: string | null };
/** The metals with a daily history: the stock feed's plan quotes gold alone, so the others keep their recorded value. */
const metalsWithHistory: readonly string[] = ['XAU'];

/** The price series a holding follows, or null for one with no past prices (a valued asset, a metal other than gold,
 * an unknown name). Shares, bought or vested, follow `shares:<ticker>`: closes adjusted for splits only, since a
 * dividend is paid out as income and must not also lift the holding (`stock:<ticker>`, which benchmarks read, counts
 * dividends as reinvested). A coin follows `crypto:<symbol>` and gold `metal:XAU`; a holding's unit and purity scale
 * every day alike, so the spot price's own moves carry it. */
export function priceSeries(record: Quoted): string | null {
 const instrument = instrumentFor(record);
 if (!instrument) return null;
 if (instrument.kind === 'Stock') return `shares:${instrument.symbol}`;
 if (instrument.kind === 'Metal') return metalsWithHistory.includes(instrument.symbol) ? `metal:${instrument.symbol}` : null;
 return `crypto:${instrument.symbol}`;
}

/** Every series the history needs and the first day it is needed from: its holdings' first recorded balance. */
export function neededSeries(records: readonly (Quoted & Pick<Entry, 'id'>)[], events: readonly Dated[], today: string): Map<string, string> {
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
export async function holdingPrices(records: readonly (Quoted & Pick<Entry, 'id'>)[], events: readonly Dated[], today: string, read: (series: string, start: string, end: string) => Promise<PricePoint[]>, waitMs = 2500): Promise<HoldingPrices> {
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
export function pricesByRecord(records: readonly (Quoted & Pick<Entry, 'id'>)[], prices: HoldingPrices | undefined): Map<string, readonly PricePoint[]> {
 const byRecord = new Map<string, readonly PricePoint[]>();
 if (!prices) return byRecord;
 for (const record of records) {
  const series = priceSeries(record), points = series ? prices[series] : undefined;
  if (points?.length) byRecord.set(record.id, points);
 }
 return byRecord;
}

/** How far each quoted holding's price has moved since its latest snapshot. Between two snapshots its quantity is
 * unchanged (a purchase, a sale, a vesting or an edit writes a snapshot), so its value on a day is that snapshot carried
 * by the price: `close that day / close on the snapshot's day`. Days are asked in ascending order. A holding without
 * closes, or with none by its snapshot's day, keeps its recorded value. */
export function priceScale(prices: ReadonlyMap<string, readonly PricePoint[]>) {
 const cursor = new Map<string, number>(), anchors = new Map<string, number | null>();
 const closeOn = (id: string, date: string) => {
  const points = prices.get(id);
  if (!points) return null;
  let index = cursor.get(id) ?? -1;
  while (index + 1 < points.length && points[index + 1].date <= date) index++;
  cursor.set(id, index);
  return index < 0 ? null : points[index].close;
 };
 return {
  /** A snapshot taken on `date`: later days are measured from its close. */
  anchor: (id: string, date: string) => { if (prices.has(id)) anchors.set(id, closeOn(id, date)); },
  factor: (id: string, date: string) => {
   const from = anchors.get(id), now = from ? closeOn(id, date) : null;
   return from && now ? now / from : 1;
  },
 };
}
