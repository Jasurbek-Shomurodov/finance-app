import { shiftDay } from './calendar-days';
import { value, type Entry } from './finance';
import { benchmarkInvestment, type BenchmarkMovement } from './investment-benchmarks';
import { byHistoryDate, type HistoryEvent } from './investment-history';
import { convertAmount, marketEntry, marketRates, type MarketData } from './market';

/** Profit and loss of the investments (everything Investments holds but cash): what each holding earned beyond the
 * money put into it, split into price change, income and costs. Pure rules; the screen is components/investment-pnl. */
export type PnlPeriod = 'year' | 'months' | 'all';
export const pnlPeriods: readonly PnlPeriod[] = ['year', 'months', 'all'];
/** The first day a period counts; null counts every recorded day. */
export const pnlPeriodStart = (period: PnlPeriod, today: string): string | null =>
 period === 'year' ? today.slice(0, 4) + '-01-01' : period === 'months' ? shiftDay(today, -365) : null;

export type PnlFigures = {
 /** Worth at the start of the period plus the money added since: what the return is measured against. */
 invested: number;
 /** Sale proceeds and withdrawals taken out in the period. */
 withdrawn: number;
 /** Worth today. */
 value: number;
 /** Value gained or lost beyond the money moved in and out, sold or still held. */
 price: number;
 /** The part of `price` already locked in by sales, where a sale recorded its gain. */
 realized: number;
 income: number;
 costs: number;
 /** price + income − costs. */
 total: number;
};
export type HoldingPnl = PnlFigures & { id: string; name: string; kind: string; /** Total as a percentage of `invested`; null when nothing was invested. */ returnPercent: number | null };
export type PnlPoint = { date: string; total: number };
export type PnlInput = { records: readonly Entry[]; events: readonly HistoryEvent[]; movements?: readonly BenchmarkMovement[]; market: MarketData | null; currency: string; today: string };
export type PortfolioPnl = { rows: HoldingPnl[]; totals: PnlFigures & { returnPercent: number | null }; points: PnlPoint[]; /** Holdings left out because no exchange rate converts them. */ missing: string[] };

const zero = (): PnlFigures => ({ invested: 0, withdrawn: 0, value: 0, price: 0, realized: 0, income: 0, costs: 0, total: 0 });
const percentOf = (total: number, invested: number) => invested > 0 ? total / invested * 100 : null;
const share = (event: HistoryEvent) => Number(event.balance) * Number(event.ownership_percentage) / 100;
const interestKey = (id: string, day: string, amount: number) => `${id}|${day}|${Number(amount)}`;

type Step = { date: string; total: number };
/** One holding in its own currency. `current` is its worth today; the steps are its running total after each day. */
function holdingFigures(record: Entry, events: readonly HistoryEvent[], { capitalized, realized, start, current }: { capitalized: Map<string, number>; realized: number; start: string | null; current: number }) {
 const rows = events.filter(event => event.record_id === record.id).sort(byHistoryDate);
 const firstPurchase = rows.find(event => event.event_type === 'contribution')?.occurred_on ?? '9999';
 const figures = zero(), steps: Step[] = [];
 let held = 0, opening = 0, valued = false, added = 0, interest = 0;
 const running = () => held - opening - added + figures.withdrawn - interest + figures.income - figures.costs;
 for (const event of rows) {
  const before = start !== null && event.occurred_on < start;
  if (event.balance !== null) {
   held = share(event);
   // A holding first recorded with a value and no purchase: that value is the money in it, not a gain.
   if (!valued && held > 0) { valued = true; if (firstPurchase > event.occurred_on && !before) added += held; }
  }
  if (before) { opening = held; continue; }
  const amount = Number(event.amount) || 0;
  if (event.event_type === 'contribution') added += amount;
  else if (event.event_type === 'withdrawal') figures.withdrawn += amount;
  else if (event.event_type === 'expense') figures.costs += amount;
  else if (event.event_type === 'income') {
   figures.income += amount;
   // Interest added to the balance is income, not a rise in price.
   const key = interestKey(record.id, event.occurred_on, amount), left = capitalized.get(key) ?? 0;
   if (left > 0) { capitalized.set(key, left - 1); interest += amount; }
  }
  if (valued) steps.push({ date: event.occurred_on, total: running() });
 }
 figures.invested = opening + added;
 figures.value = current;
 figures.price = current - opening - added + figures.withdrawn - interest;
 figures.realized = realized;
 figures.total = figures.price + figures.income - figures.costs;
 return { figures, steps };
}

/** Every investment's profit and loss since `start`, in the display currency at today's rates, and the running total
 * day by day. A holding no rate converts is named in `missing` and left out of every figure. */
export function portfolioPnl(input: PnlInput, start: string | null): PortfolioPnl {
 const rates = marketRates(input.market) ?? {};
 const events = input.events.filter(event => event.occurred_on <= input.today);
 const movements = (input.movements ?? []).filter(row => row.occurred_on <= input.today && (start === null || row.occurred_on >= start));
 const capitalized = new Map<string, number>(), gains = new Map<string, number>();
 for (const row of movements) {
  if (row.kind === 'interest') { const key = interestKey(row.target_id, row.occurred_on, row.target_value); capitalized.set(key, (capitalized.get(key) ?? 0) + 1); }
  else if (row.realized_gain !== null && row.realized_gain !== undefined) gains.set(row.source_id, (gains.get(row.source_id) ?? 0) + Number(row.realized_gain));
 }
 const rows: HoldingPnl[] = [], missing: string[] = [], series: Step[][] = [];
 for (const record of input.records.filter(benchmarkInvestment)) {
  const converted = marketEntry(record, input.currency, input.market);
  const rate = convertAmount(1, record.currency, input.currency, rates);
  if (!converted || rate === null || !Number.isFinite(rate)) { missing.push(record.name); continue; }
  // Today's worth uses the live quote; convert it back so every step of this holding is in one currency.
  const { figures, steps } = holdingFigures(record, events, { capitalized, realized: gains.get(record.id) ?? 0, start, current: value(converted) / rate });
  const shown = Object.fromEntries(Object.entries(figures).map(([key, amount]) => [key, key === 'value' ? value(converted) : amount * rate])) as PnlFigures;
  rows.push({ id: record.id, name: record.name, kind: record.kind, ...shown, returnPercent: percentOf(shown.total, shown.invested) });
  series.push([...steps.map(step => ({ date: step.date, total: step.total * rate })), { date: input.today, total: shown.total }]);
 }
 const totals = rows.reduce((sum, row) => { for (const key of Object.keys(sum) as (keyof PnlFigures)[]) sum[key] += row[key]; return sum; }, zero());
 rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
 return { rows, totals: { ...totals, returnPercent: percentOf(totals.total, totals.invested) }, points: mergeSteps(series), missing };
}

/** Several holdings' running totals as one line: on each day, the sum of every holding's latest total. */
function mergeSteps(series: readonly Step[][]): PnlPoint[] {
 const latest = series.map(() => 0);
 const all = series.flatMap((steps, index) => steps.map(step => ({ ...step, index }))).sort((a, b) => a.date.localeCompare(b.date));
 const points: PnlPoint[] = [];
 for (const step of all) {
  latest[step.index] = step.total;
  const total = latest.reduce((sum, amount) => sum + amount, 0);
  if (points.at(-1)?.date === step.date) points.at(-1)!.total = total; else points.push({ date: step.date, total });
 }
 return points;
}
