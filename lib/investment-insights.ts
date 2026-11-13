// Smaller readings built on the investment history: what a property yields, the prices a coin was bought at, a plan
// for buying more on a schedule, the payouts to expect, and price alerts. Pure.
import { addMonths, daysBetween, shiftDay } from './calendar-days';
import type { Entry } from './finance';
import type { BenchmarkMovement } from './investment-benchmarks';
import type { HistoryEvent } from './investment-history';
import type { HoldingPnl, PnlFlow } from './investment-pnl';
import { instrumentFor } from './market';

/** A property's last twelve months against its value today, in percent. Gross yield is the rent alone; the cap rate
 * is the rent after running costs (repairs, fees, taxes), before any mortgage. */
export type PropertyYield = { id: string; name: string; value: number; rent: number; costs: number; grossYield: number | null; capRate: number | null };
export function propertyYields(holdings: readonly HoldingPnl[], flows: readonly PnlFlow[], today: string): PropertyYield[] {
 const from = shiftDay(today, -365);
 return holdings.filter(holding => holding.kind === 'Property').map(holding => {
  const year = flows.filter(flow => flow.recordId === holding.id && flow.date > from && flow.date <= today);
  const sum = (type: PnlFlow['type']) => year.filter(flow => flow.type === type).reduce((total, flow) => total + flow.shown, 0);
  const rent = sum('income'), costs = sum('cost'), percent = (amount: number) => holding.value > 0 ? amount / holding.value * 100 : null;
  return { id: holding.id, name: holding.name, value: holding.value, rent, costs, grossYield: percent(rent), capRate: percent(rent - costs) };
 });
}

/** One purchase of a coin: the units bought and the price paid for each, in the holding's currency. */
export type Lot = { id: string; date: string; units: number; price: number; cost: number };
export type CostLadder = { lots: Lot[]; units: number; average: number; /** The lowest and highest price paid. */ low: number; high: number };

/** Whether a holding is Bitcoin, by the coin its name is priced by. */
export const isBitcoin = (record: Pick<Entry, 'kind' | 'name'>) => record.kind === 'Crypto' && instrumentFor(record)?.symbol === 'BTC';

/** The prices a holding was bought at, cheapest first: one step for each purchase made through the app, and one for
 * the units held before them, priced so the ladder's average is the holding's saved average cost. Null when the
 * holding has no units or no cost to read. */
export function costLadder(record: Pick<Entry, 'id' | 'quantity' | 'cost' | 'date' | 'opened_on'>, movements: readonly BenchmarkMovement[] = []): CostLadder | null {
 const units = Number(record.quantity), average = Number(record.cost);
 if (!(units > 0) || !(average > 0)) return null;
 const bought = movements.filter(row => row.kind === 'buy' && row.target_id === record.id && Number(row.received) > 0)
  .map(row => { const cost = Math.max(0, Number(row.target_value) - Number(row.fee)); return { id: row.id, date: row.occurred_on, units: Number(row.received), price: cost / Number(row.received), cost }; });
 const sold = movements.filter(row => row.kind === 'sell' && row.source_id === record.id).reduce((sum, row) => sum + Number(row.sent), 0);
 // After a sale the purchases no longer say which units are left; the saved average speaks for all of them.
 const known = sold > 0 ? [] : bought;
 const earlier = units - known.reduce((sum, lot) => sum + lot.units, 0);
 const earlierCost = units * average - known.reduce((sum, lot) => sum + lot.cost, 0);
 const lots = earlier > 1e-9 && earlierCost > 0
  ? [{ id: 'earlier', date: record.opened_on || record.date, units: earlier, price: earlierCost / earlier, cost: earlierCost }, ...known]
  : earlier > 1e-9 ? [{ id: 'earlier', date: record.opened_on || record.date, units, price: average, cost: units * average }] : known;
 const prices = lots.map(lot => lot.price);
 return { lots: lots.sort((a, b) => a.price - b.price), units, average, low: Math.min(...prices), high: Math.max(...prices) };
}

export type DcaPlan = { amount: number; buys: number; price: number; /** The expected price change between two buys, in percent. */ change: number };
export type DcaResult = { units: number; invested: number; average: number; value: number; /** The price at the last buy. */ lastPrice: number };
/** Buying the same amount `buys` times: the units, the cost and the average price after the last one, starting from
 * what is held now. Null when the plan has no positive amount, count or price. */
export function dcaPlan(held: { units: number; average: number }, plan: DcaPlan): DcaResult | null {
 if (!(plan.amount > 0) || !(plan.price > 0) || !Number.isInteger(plan.buys) || plan.buys < 1 || plan.buys > 600 || !(plan.change > -100)) return null;
 let units = Math.max(0, held.units), invested = units * Math.max(0, held.average), price = plan.price;
 for (let buy = 0; buy < plan.buys; buy++) {
  if (buy) price *= 1 + plan.change / 100;
  units += plan.amount / price; invested += plan.amount;
 }
 return { units, invested, average: invested / units, value: units * price, lastPrice: price };
}

/** A payout expected from a holding: a dividend, a coupon or interest, in the holding's currency. */
export type ExpectedPayout = { key: string; recordId: string; name: string; kind: Entry['kind']; date: string; amount: number; currency: string };
/** Kinds whose payouts are projected from their own history. Deposits, rent and business income have their own
 * forecasts (interest schedules, rent schedules, estimates), so they are left to those. */
export const payoutKinds: readonly string[] = ['Stock', 'Equity compensation', 'Bond', 'Treasury bill', 'Crypto', 'Retirement account', 'Precious metals'];
const cadences = [1, 3, 6, 12];

/** Months between payouts, read from the gaps between the last ones: monthly, quarterly, twice a year or yearly. */
function payoutCadence(dates: readonly string[]) {
 const gaps = dates.slice(1).map((date, index) => daysBetween(dates[index], date)).sort((a, b) => a - b);
 const typical = gaps[Math.floor(gaps.length / 2)] / 30.44;
 return cadences.reduce((best, months) => Math.abs(months - typical) < Math.abs(best - typical) ? months : best);
}

/** The payouts to expect through `until`, from each holding's own record: a holding that paid at least twice in the
 * last two years is expected to pay its latest amount again at the same rhythm. A holding that has stopped paying
 * (more than a rhythm and a half since the last one) is expected to pay nothing. */
export function expectedPayouts(records: readonly Entry[], events: readonly HistoryEvent[], today: string, until: string): ExpectedPayout[] {
 const since = shiftDay(today, -730), payouts: ExpectedPayout[] = [];
 for (const record of records.filter(record => payoutKinds.includes(record.kind))) {
  const paid = events.filter(event => event.record_id === record.id && event.event_type === 'income' && event.occurred_on > since && event.occurred_on <= today && Number(event.amount) > 0)
   .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  if (paid.length < 2) continue;
  const months = payoutCadence(paid.map(event => event.occurred_on)), last = paid.at(-1)!;
  if (daysBetween(last.occurred_on, today) > months * 30.44 * 1.5) continue;
  for (let step = 1, date = addMonths(last.occurred_on, months); date <= until; date = addMonths(last.occurred_on, months * ++step)) {
   if (date > today) payouts.push({ key: `payout:${record.id}:${date}`, recordId: record.id, name: record.name, kind: record.kind, date, amount: Number(last.amount), currency: record.currency });
  }
 }
 return payouts.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** A price to be told about: the holding's unit price, in the holding's currency, rising to `price` or falling to it.
 * `reached_on` is the day it was first seen there; an alert is announced once. */
export type PriceAlert = { id: string; record_id: string; direction: 'above' | 'below'; price: number; reached_on?: string | null };
export const priceAlertReached = (alert: Pick<PriceAlert, 'direction' | 'price'>, price: number | null) => price !== null && Number.isFinite(price) && (alert.direction === 'above' ? price >= alert.price : price <= alert.price);
/** The alerts whose price is there now and that have not been announced yet. */
export function newlyReached(alerts: readonly PriceAlert[], priceOf: (recordId: string) => number | null): PriceAlert[] {
 return alerts.filter(alert => !alert.reached_on && priceAlertReached(alert, priceOf(alert.record_id)));
}
