// Returns over time from the investment profit and loss: the day-by-day value, each month's result, the fall from
// the last peak, and the two standard return rates. Pure; every amount is in the display currency.
import { daysBetween, shiftMonth } from './calendar-days';
import type { InvestmentPnl, PnlFlow } from './investment-pnl';

/** One day something changed. `pnl` is what the investments earned that day: the change in value without the money
 * put in or taken out, plus income, minus costs. `index` is the growth of one unit invested at the start;
 * `drawdown` is how far it stands below its highest point so far, as a negative share (−0.12 is 12% below). */
export type ReturnDay = { date: string; value: number; pnl: number; index: number; drawdown: number };
export type MonthResult = { month: string; pnl: number };
export type InvestmentReturns = {
 days: ReturnDay[];
 /** Time-weighted return since the first day, in percent: what the holdings did, whatever was added or withdrawn. */
 timeWeighted: number | null;
 /** Money-weighted return (XIRR), in percent a year: what the person's own money earned, given when it went in. */
 moneyWeighted: number | null;
 /** The deepest fall from a peak, in percent (0 or negative). */
 maxDrawdown: number | null;
};

type DayMoney = { flow: number; income: number; costs: number };
const signs: Record<PnlFlow['type'], number> = { buy: -1, sell: 1, income: 1, cost: -1 };

function moneyByDay(flows: readonly PnlFlow[]) {
 const days = new Map<string, DayMoney>();
 for (const flow of flows) {
  const day = days.get(flow.date) ?? { flow: 0, income: 0, costs: 0 };
  if (flow.type === 'buy') day.flow += flow.shown;
  if (flow.type === 'sell') day.flow -= flow.shown;
  if (flow.type === 'income') day.income += flow.shown;
  if (flow.type === 'cost') day.costs += flow.shown;
  days.set(flow.date, day);
 }
 return days;
}

/** The rate at which the dated amounts are worth nothing today (XIRR), in percent a year. Null when they never change
 * sign, span less than 30 days, or no rate between −99.99% and 10,000% balances them. */
export function moneyWeightedReturn(amounts: readonly { date: string; amount: number }[]): number | null {
 const dated = amounts.filter(item => item.amount !== 0).sort((a, b) => a.date.localeCompare(b.date));
 if (dated.length < 2 || !dated.some(item => item.amount < 0) || !dated.some(item => item.amount > 0)) return null;
 const start = dated[0].date;
 if (daysBetween(start, dated.at(-1)!.date) < 30) return null;
 const worth = (rate: number) => dated.reduce((sum, item) => sum + item.amount / (1 + rate) ** (daysBetween(start, item.date) / 365), 0);
 let low = -0.9999, high = 100;
 if (worth(low) * worth(high) > 0) return null;
 for (let step = 0; step < 200; step++) {
  const middle = (low + high) / 2;
  if (worth(low) * worth(middle) <= 0) high = middle; else low = middle;
 }
 return (low + high) / 2 * 100;
}

/** `rate` is units of the display currency for one unit of a holding's currency on a day. */
export function investmentReturns(pnl: Pick<InvestmentPnl, 'flows' | 'marks' | 'totals'>, today: string, rate: (currency: string, date: string) => number | null): InvestmentReturns {
 const money = moneyByDay(pnl.flows), values = new Map<string, { currency: string; value: number }>();
 const dates = [...new Set([...pnl.marks.map(mark => mark.date), ...money.keys()])].filter(date => date <= today).sort();
 const days: ReturnDay[] = [];
 let cursor = 0, previous = 0, index = 1, peak = 1;
 for (const date of dates) {
  while (cursor < pnl.marks.length && pnl.marks[cursor].date <= date) { const mark = pnl.marks[cursor++]; values.set(mark.recordId, mark); }
  // Today's total is the live one, so the last day agrees with the headline to the cent.
  const value = date === today ? pnl.totals.value : [...values.values()].reduce((sum, item) => sum + item.value * (rate(item.currency, date) ?? 0), 0);
  const moved = money.get(date) ?? { flow: 0, income: 0, costs: 0 };
  const earned = value - previous - moved.flow + moved.income - moved.costs;
  // Money added that day was at work that day; money withdrawn was not.
  const base = previous + Math.max(0, moved.flow);
  if (base > 0) index *= 1 + earned / base;
  peak = Math.max(peak, index);
  days.push({ date, value, pnl: earned, index, drawdown: index / peak - 1 });
  previous = value;
 }
 const amounts = pnl.flows.map(flow => ({ date: flow.date, amount: signs[flow.type] * flow.shown }));
 return {
  days,
  timeWeighted: days.length ? (index - 1) * 100 : null,
  moneyWeighted: moneyWeightedReturn([...amounts, { date: today, amount: pnl.totals.value }]),
  maxDrawdown: days.length ? Math.min(...days.map(day => day.drawdown)) * 100 : null,
 };
}

/** The last `count` months through `today`'s, each with what the investments earned in it; a quiet month is 0. */
export function monthlyResults(days: readonly ReturnDay[], today: string, count = 12): MonthResult[] {
 const totals = new Map<string, number>();
 for (const day of days) totals.set(day.date.slice(0, 7), (totals.get(day.date.slice(0, 7)) ?? 0) + day.pnl);
 return Array.from({ length: count }, (_, offset) => shiftMonth(today.slice(0, 7), offset - count + 1)).map(month => ({ month, pnl: totals.get(month) ?? 0 }));
}
