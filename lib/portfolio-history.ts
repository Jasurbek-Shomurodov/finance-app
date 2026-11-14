import { shiftDay } from './calendar-days';
import { assets, income, liabilities, valuedKinds, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { convertAmount } from './market';

/** The income the Overview's income chart reads: the receipts among the cash flows, then the income schedules. The sample
 * workspace's history names its own `incomeRecords`, which are kept. */
export function historyIncomeRecords(history: { cashflows?: Entry[]; recurringIncome?: Entry[]; incomeRecords?: Entry[] }): Entry[] {
 return history.incomeRecords ?? [...(history.cashflows ?? []).filter(record => income.includes(record.kind)), ...(history.recurringIncome ?? [])];
}
export type PortfolioPoint = { date: string; assets: number; debt: number; net: number; partial?: boolean };
/** A balance change shown on the day it happened rather than the day its snapshot was written (`balanceMoves`). */
type Move = { record_id: string; date: string; entered: string; amount: number };
type DayChanges = { events: HistoryEvent[]; shifts: Array<[string, number]> };
/** Each day's balance snapshots and moved changes: a late-entered change is added on its own day and taken back on the
 * day its snapshot includes it. */
function changesByDay(sorted: HistoryEvent[], moves: readonly Move[], known: ReadonlyMap<string, Entry>, today: string) {
 const byDay = new Map<string, DayChanges>();
 const day = (date: string) => { let entry = byDay.get(date); if (!entry) byDay.set(date, entry = { events: [], shifts: [] }); return entry; };
 for (const event of sorted) day(event.occurred_on).events.push(event);
 for (const move of moves) {
  if (!known.has(move.record_id) || !Number.isFinite(move.amount) || !(move.date < move.entered) || move.entered > today) continue;
  day(move.date).shifts.push([move.record_id, move.amount]);
  day(move.entered).shifts.push([move.record_id, -move.amount]);
 }
 return byDay;
}
// A newly opened empty holding must not erase the history of existing holdings.
// Only an explicit, dated zero baseline establishes this; positive observations
// and records with unknown opening dates still require full historical coverage.
function zeroOpenings(included: Entry[], sorted: HistoryEvent[], events: HistoryEvent[]) {
 const balances = new Map<string, number>(), firstBalances = new Map<string, HistoryEvent>();
 for (const event of sorted) if (!firstBalances.has(event.record_id)) firstBalances.set(event.record_id, event);
 for (const record of included) {
  const first = firstBalances.get(record.id);
  const openedOn = record.opened_on || (valuedKinds.includes(record.kind) ? record.date : undefined);
  if (first?.event_type === 'baseline' && Number(first.balance) === 0 && openedOn === first.occurred_on
   && !events.some(event => event.record_id === record.id && event.occurred_on < openedOn)) balances.set(record.id, 0);
 }
 return balances;
}
// Require known balances; an explicit zero opening contributes nothing before it opens.
// `moves` puts late-entered changes on their own day: from that day until the snapshot that includes them, the record's
// balance carries the change, so a transaction typed a week late does not look like money that appeared a week late.
export function portfolioHistory(records: Entry[], events: HistoryEvent[], currency: string, rates: number | Record<string, number> | undefined, today: string, includePartial = false, moves: readonly Move[] = []) {
 const eligible = records.filter(record => assets.includes(record.kind) || liabilities.includes(record.kind));
 const included = eligible.filter(record => convertAmount(1, record.currency, currency, rates) !== null);
 const byId = new Map(included.map(record => [record.id, record]));
 const days = new Map<string, PortfolioPoint>();
 const sorted = events.filter(event => byId.has(event.record_id) && event.balance !== null && event.occurred_on <= today)
  .sort((a,b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
 // Balances are kept in each record's own currency; `shifted` is what late-entered changes add until their snapshot.
 const balances = zeroOpenings(included, sorted, events), shifted = new Map<string, number>();
 const byDay = changesByDay(sorted, moves, byId, today);
 for (const date of [...byDay.keys()].sort()) {
  const changes = byDay.get(date)!;
  let observed = false;
  for (const event of changes.events) {
   const balance = Number(event.balance) * Number(event.ownership_percentage) / 100;
   if (!Number.isFinite(balance)) continue;
   balances.set(event.record_id, balance);
   observed = true;
  }
  for (const [id, amount] of changes.shifts) shifted.set(id, (shifted.get(id) ?? 0) + amount);
  // A day that only moves a change within a record not yet known adds nothing to draw.
  if (!observed && !changes.shifts.some(([id]) => balances.has(id))) continue;
  if (!includePartial && balances.size !== included.length) continue;
  let assetTotal = 0, debt = 0;
  for (const [id, amount] of balances) {
   const record = byId.get(id)!;
   const value = convertAmount(amount + (shifted.get(id) ?? 0), record.currency, currency, rates) ?? 0;
   if (assets.includes(record.kind)) assetTotal += value;
   else debt += value;
  }
  days.set(date, { date, assets: assetTotal, debt, net: assetTotal - debt, ...(balances.size !== included.length ? {partial:true} : {}) });
 }
 return { points: [...days.values()], missing: included.length - balances.size, excluded: eligible.length - included.length };
}

// The first day a history period shows: the period's own start, or the owner's
// tracking start when that is later. '0000-01-01' shows every recorded day.
export function trackingWindowStart(days: number | null, today: string, origin?: string | null) {
 const period = days === null ? '0000-01-01' : shiftDay(today, -days);
 return origin && origin > period ? origin : period;
}
export function portfolioWindow(points: PortfolioPoint[], days: number | null, today: string, origin?: string | null) {
 const start = trackingWindowStart(days, today, origin);
 if (start === '0000-01-01' || !points.length) return points;
 const previous = points.filter(point => point.date < start).at(-1);
 return [...(previous ? [{ ...previous, date: start }] : []), ...points.filter(point => point.date >= start)];
}

