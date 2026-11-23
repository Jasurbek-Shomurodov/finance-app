import { shiftDay } from './calendar-days';
import { assets, income, liabilities, totalValue, value, valuedKinds, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { convertAmount } from './market';
import type { FxPoint, PricePoint } from './benchmark-data';
import { dayRates } from './history-rates';

/** The income the Overview's income chart reads: the receipts among the cash flows, then the income schedules. The sample
 * workspace's history names its own `incomeRecords`, which are kept. */
export function historyIncomeRecords(history: { cashflows?: Entry[]; recurringIncome?: Entry[]; incomeRecords?: Entry[] }): Entry[] {
 return history.incomeRecords ?? [...(history.cashflows ?? []).filter(record => income.includes(record.kind)), ...(history.recurringIncome ?? [])];
}
/** `parts` is the day's net worth by kind of record (debts together under `Debt`, negative), so a change can be traced to what moved it.
 * `joined` is what the day counts for the first time: the net worth of records whose history begins on it (debts
 * negative). It was owned before and only entered the books that day, so a period's change leaves it out (`periodChange`). */
export type PortfolioPoint = { date: string; assets: number; debt: number; net: number; partial?: boolean; parts?: Record<string, number>; joined?: number };
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
function zeroOpenings(included: Entry[], firstBalances: ReadonlyMap<string, HistoryEvent>, events: readonly HistoryEvent[]) {
 const balances = new Map<string, number>(), earliest = new Map<string, string>();
 for (const event of events) if (!(earliest.get(event.record_id)! <= event.occurred_on)) earliest.set(event.record_id, event.occurred_on);
 for (const record of included) {
  const first = firstBalances.get(record.id);
  const openedOn = record.opened_on || (valuedKinds.includes(record.kind) ? record.date : undefined);
  if (first?.event_type === 'baseline' && Number(first.balance) === 0 && openedOn === first.occurred_on
   && !(earliest.get(record.id)! < openedOn)) balances.set(record.id, 0);
 }
 return balances;
}
/** A record that says when it was opened (`opened_on`: an account's opening day, a purchase date, the day a debt began)
 * is part of net worth from that day, at its first recorded balance, even when that balance was written later: without
 * this, a debt entered today with last year's start date would leave every earlier day incomplete and step in today.
 * It joins the days other records already have and adds none of its own. A quoted holding is left alone: its first
 * value is a price on its own day, not on an earlier one. Oldest opening first. */
function earlyOpenings(included: Entry[], firstBalances: ReadonlyMap<string, HistoryEvent>, prices: ReadonlyMap<string, unknown>) {
 return included.flatMap(record => {
  const first = firstBalances.get(record.id), openedOn = record.opened_on, balance = first ? Number(first.balance) * Number(first.ownership_percentage) / 100 : NaN;
  if (!first || !openedOn || !/^\d{4}-\d{2}-\d{2}$/.test(openedOn) || !(openedOn < first.occurred_on) || !Number.isFinite(balance) || prices.has(record.id)) return [];
  return [{ id: record.id, openedOn, balance }];
 }).sort((a, b) => a.openedOn.localeCompare(b.openedOn));
}
/** How far each quoted holding's price has moved since its latest snapshot. A stock or coin is saved with the value it
 * had when it was last edited; between two snapshots its quantity is unchanged (a purchase, a sale or an edit writes a
 * snapshot), so its value on a day is that snapshot carried by the price: `close that day / close on the snapshot's day`.
 * Days are asked in ascending order. A holding without closes, or with none by its snapshot's day, keeps its recorded value. */
function priceScale(prices: ReadonlyMap<string, readonly PricePoint[]>) {
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
/** The days a quoted holding's price is known after its first snapshot: each is drawn, so its line follows the market. */
function addPriceDays(byDay: Map<string, DayChanges>, sorted: HistoryEvent[], prices: ReadonlyMap<string, readonly PricePoint[]>, today: string) {
 const first = new Map<string, string>();
 for (const event of sorted) if (!first.has(event.record_id)) first.set(event.record_id, event.occurred_on);
 const priced = new Set<string>();
 for (const [id, points] of prices) {
  const from = first.get(id);
  if (!from) continue;
  for (const point of points) if (point.date > from && point.date <= today) {
   priced.add(point.date);
   if (!byDay.has(point.date)) byDay.set(point.date, { events: [], shifts: [] });
  }
 }
 return priced;
}
/** One day's assets, debts and net worth by kind, from each record's balance; `worth` gives a balance in the display currency. */
function dayTotals(balances: ReadonlyMap<string, number>, recordOf: (id: string) => Entry, worth: (id: string, amount: number, currency: string) => number) {
 let assetTotal = 0, debt = 0;
 const parts: Record<string, number> = {};
 for (const [id, amount] of balances) {
  const record = recordOf(id), value = worth(id, amount, record.currency);
  const asset = assets.includes(record.kind), part = asset ? record.kind : 'Debt';
  parts[part] = (parts[part] ?? 0) + (asset ? value : -value);
  if (asset) assetTotal += value;
  else debt += value;
 }
 return { assetTotal, debt, parts };
}
/** The days the exchange rate is known after the first recorded balance: each is drawn when a record is kept in another
 * currency than the one shown, so its value follows the rate between its own changes instead of stepping at the next one. */
function addRateDays(byDay: Map<string, DayChanges>, fx: readonly FxPoint[], from: string | undefined, today: string) {
 const rated = new Set<string>();
 if (!from) return rated;
 for (const point of fx) if (point.date > from && point.date <= today) {
  rated.add(point.date);
  if (!byDay.has(point.date)) byDay.set(point.date, { events: [], shifts: [] });
 }
 return rated;
}
/** A closed record (`closed_on`) keeps its value up to the day before it closed and counts nothing from that day,
 * whatever its later snapshots say. The closing day is drawn (`drawn`), so the line steps on it and not on the next day
 * something else changes. Answers whether a record is closed by a day. */
function closings(included: readonly Entry[], byDay: Map<string, DayChanges>, drawn: Set<string>, from: string | undefined, today: string) {
 const closed = new Map<string, string>();
 for (const record of included) {
  const day = record.closed_on;
  if (!day || day > today) continue;
  closed.set(record.id, day);
  if (!from || day <= from) continue;
  drawn.add(day);
  if (!byDay.has(day)) byDay.set(day, { events: [], shifts: [] });
 }
 return (id: string, date: string) => closed.get(id)! <= date;
}
/** How a history is read: the currency it is shown in, today's rates (which also decide the currencies that can be
 * shown at all), and the day it ends. `fx` is the rate of each past day (`historyFx`); without it every day converts at
 * `rates`. `moves` puts late-entered changes on their own day, `prices` carries quoted holdings between snapshots. */
export type HistoryView = { currency: string; rates: number | Record<string, number> | undefined; today: string; includePartial?: boolean; moves?: readonly Move[]; prices?: ReadonlyMap<string, readonly PricePoint[]>; fx?: readonly FxPoint[] };
const inOrder = (a: HistoryEvent, b: HistoryEvent) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
/** Whether a day with no new balance still changes what is drawn: a price or rate of its own, or a late change to a known record. */
function movesDay(date: string, shifts: readonly (readonly [string, number])[], balances: ReadonlyMap<string, number>, priced: ReadonlySet<string>, rated: ReadonlySet<string>) {
 return priced.has(date) || (rated.has(date) && balances.size > 0) || shifts.some(([id]) => balances.has(id));
}
/** Sets each event's owned balance; true when any of them was a usable figure. */
function applyBalances(events: readonly HistoryEvent[], balances: Map<string, number>, anchor: (id: string) => void) {
 let observed = false;
 for (const event of events) {
  const balance = Number(event.balance) * Number(event.ownership_percentage) / 100;
  if (!Number.isFinite(balance)) continue;
  balances.set(event.record_id, balance);
  anchor(event.record_id);
  observed = true;
 }
 return observed;
}
/** Which records each day counts for the first time, and what they were worth then. A record known from the start (an
 * explicit zero opening) never joins. What joins on a day that draws no point is carried to the next one drawn. */
function joinTracker(known: Iterable<string>) {
 const counted = new Set(known);
 let arrived: string[] = [], pending = 0;
 return {
  note(id: string) { if (!counted.has(id)) { counted.add(id); arrived.push(id); } },
  settle(worthOf: (id: string) => number) { for (const id of arrived) pending += worthOf(id); arrived = []; },
  take() { const joined = pending; pending = 0; return joined; },
 };
}
// Require known balances; an explicit zero opening contributes nothing before it opens.
// `moves` puts late-entered changes on their own day: from that day until the snapshot that includes them, the record's
// balance carries the change, so a transaction typed a week late does not look like money that appeared a week late.
// Each day converts at its own day's rates, so a past day is not restated at today's exchange rate.
export function portfolioHistory(records: Entry[], events: HistoryEvent[], view: HistoryView) {
 const { currency, rates, today, includePartial = false, moves = [], prices = new Map<string, readonly PricePoint[]>(), fx = [] } = view;
 const eligible = records.filter(record => assets.includes(record.kind) || liabilities.includes(record.kind));
 const included = eligible.filter(record => convertAmount(1, record.currency, currency, rates) !== null);
 const byId = new Map(included.map(record => [record.id, record]));
 const days = new Map<string, PortfolioPoint>();
 const recorded = events.filter(event => byId.has(event.record_id) && event.balance !== null && event.occurred_on <= today).sort(inOrder);
 const firstBalances = new Map<string, HistoryEvent>();
 for (const event of recorded) if (!firstBalances.has(event.record_id)) firstBalances.set(event.record_id, event);
 const sorted = recorded, openings = earlyOpenings(included, firstBalances, prices);
 // Balances are kept in each record's own currency; `shifted` is what late-entered changes add until their snapshot.
 const balances = zeroOpenings(included, firstBalances, events), shifted = new Map<string, number>();
 const joins = joinTracker(balances.keys());
 const byDay = changesByDay(sorted, moves, byId, today);
 // Quoted holdings follow their price between snapshots (`priceScale`).
 const priced = addPriceDays(byDay, sorted, prices, today), scale = priceScale(prices);
 const from = sorted[0]?.occurred_on;
 const rated = included.some(record => record.currency !== currency) ? addRateDays(byDay, fx, from, today) : new Set<string>();
 const ratesOn = dayRates(fx, rates), closedBy = closings(included, byDay, priced, from, today);
 let nextOpening = 0;
 for (const date of [...byDay.keys()].sort()) {
  const changes = byDay.get(date)!;
  // A record opened by this day counts from it, at its first recorded balance.
  while (nextOpening < openings.length && openings[nextOpening].openedOn <= date) {
   const opening = openings[nextOpening++];
   if (!balances.has(opening.id)) { balances.set(opening.id, opening.balance); joins.note(opening.id); }
  }
  const observed = applyBalances(changes.events, balances, id => { scale.anchor(id, date); joins.note(id); });
  for (const [id, amount] of changes.shifts) shifted.set(id, (shifted.get(id) ?? 0) + amount);
  const table = ratesOn(date);
  const worth = (id: string, amount: number, from: string) => closedBy(id, date) ? 0 : convertAmount(amount * scale.factor(id, date) + (shifted.get(id) ?? 0), from, currency, table) ?? 0;
  joins.settle(id => { const record = byId.get(id)!; return (assets.includes(record.kind) ? 1 : -1) * worth(id, balances.get(id)!, record.currency); });
  // A day that only moves a change within a record not yet known adds nothing to draw.
  if (!observed && !movesDay(date, changes.shifts, balances, priced, rated)) continue;
  if (!includePartial && balances.size !== included.length) continue;
  // The first day drawn is where the history starts: what it counts joined nothing.
  const joined = joins.take(), first = !days.size;
  days.set(date, dayPoint(date, dayTotals(balances, id => byId.get(id)!, worth), balances.size !== included.length, first ? 0 : joined));
 }
 return { points: [...days.values()], missing: included.length - balances.size, excluded: eligible.length - included.length,
  /** The records with no balance on record at all: only today's live figure counts them. */
  unknown: included.filter(record => !balances.has(record.id)).map(record => record.id) };
}
function dayPoint(date: string, { assetTotal, debt, parts }: ReturnType<typeof dayTotals>, partial: boolean, joined: number): PortfolioPoint {
 return { date, assets: assetTotal, debt, net: assetTotal - debt, ...(partial ? { partial: true } : {}), parts, ...(joined ? { joined } : {}) };
}

/** A period's change in net worth: where it ends less where it starts, less what was first counted in between
 * (`joined`). A holding added today, or one whose history begins inside the period, was owned before its first record,
 * so its arrival is neither a gain nor a loss and does not hide the change of everything else; it counts from its first
 * recorded value. `joined` is what was left out, for the note beside the figure. With fewer than two days there is no
 * change to show. */
export function periodChange(points: readonly Pick<PortfolioPoint, 'net' | 'joined'>[]): { change: number | null; joined: number } {
 if (points.length < 2) return { change: null, joined: 0 };
 let joined = 0;
 for (let index = 1; index < points.length; index++) joined += points[index].joined ?? 0;
 return { change: points.at(-1)!.net - points[0].net - joined, joined };
}

/** What today's live point counts for the first time: what the recorded history joined today, and every record with no
 * history at all at its live value (`entries` are in the display currency). */
export function joinedToday(recorded: { points: readonly PortfolioPoint[]; unknown: readonly string[] }, today: string, entries: readonly Entry[]) {
 const last = recorded.points.at(-1), unknown = new Set(recorded.unknown);
 let joined = last?.date === today ? last.joined ?? 0 : 0;
 for (const entry of entries) if (unknown.has(entry.id)) joined += (liabilities.includes(entry.kind) ? -1 : 1) * value(entry);
 return joined;
}

/** The day the chart ends on. The history read names the day it was read on; the browser's own day is the same one
 * unless its clock is off or midnight passed in between, and then the later day wins so that no recorded day is cut
 * off and today's live figure is never drawn before a recorded one. */
export function chartDay(browserDay: string, readDay?: string | null) {
 return readDay && /^\d{4}-\d{2}-\d{2}$/.test(readDay) && readDay > browserDay ? readDay : browserDay;
}

/** Today's net worth by kind, from the live records (already in the display currency): the same `parts` the history
 * keeps for each day, so today's point can say what moved since the last recorded day. */
export function currentParts(entries: readonly Entry[]): Record<string, number> {
 const parts: Record<string, number> = {};
 for (const kind of new Set(entries.map(entry => entry.kind))) {
  if (assets.includes(kind)) parts[kind] = totalValue(entries, [kind]);
 }
 const debt = totalValue(entries, liabilities);
 if (debt || entries.some(entry => liabilities.includes(entry.kind))) parts.Debt = -debt;
 return parts;
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

