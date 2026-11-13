// Profit and loss of the investments, holding by holding. Pure: it reads the same history as the Overview chart
// (/api/portfolio-history) and adds the payments linked to a property or business, so rent, repairs and fees count.
//
// Each holding is worked out twice: in its own currency, and in the display currency with every amount converted on
// its own day. The first, at today's rate, is what prices earned; the difference between the two is what the exchange
// rate did, shown as its own line. Sales use the average-cost method: a sale removes the share of the cost that the
// proceeds were of the value just before it.
import { expenses, income, unitPricedKinds, value, type Entry } from './finance';
import { benchmarkInvestment, openingFunding } from './investment-benchmarks';
import type { HistoryEvent } from './investment-history';
import { convertAmount, marketEntry, marketRates, type MarketData } from './market';
import { amountIn } from './money';
import { ratesOf } from './transaction-rates';

/** Units of `to` for one unit of `from` on a past day; null when that day's rate is unknown. */
export type DatedRate = (from: string, to: string, date: string) => number | null;
export type PnlInput = { records: Entry[]; events: HistoryEvent[]; cashflows?: Entry[]; market: MarketData | null; currency: string; today: string; rate?: DatedRate };

export type PnlFlowType = 'buy' | 'sell' | 'income' | 'cost';
/** Money that moved for a holding. `local` is in the holding's currency, `shown` in the display currency at the day's rate. */
export type PnlFlow = { id: string; date: string; recordId: string; type: PnlFlowType; local: number; shown: number; name: string; /** A transaction linked to the asset, not a Tracker entry. */ linked: boolean };
/** A sale and the gain it realized, in the holding's currency; `shownGain` is the gain in the display currency. */
export type RealizedSale = { id: string; date: string; recordId: string; name: string; kind: string; currency: string; proceeds: number; cost: number; gain: number; shownGain: number };
/** Every figure is in the display currency. `realized`, `unrealized`, `income` and `costs` are at today's rate;
 * `currencyEffect` is what the rate changes since each payment added or took away, so the five add up to `total`. */
export type HoldingPnl = {
 id: string; name: string; kind: string; currency: string; accountId: string | null;
 value: number; basis: number; invested: number; realized: number; unrealized: number; income: number; costs: number;
 /** The part of `income` minus `costs` that came from linked transactions. */
 linked: number; currencyEffect: number; total: number; returnPercent: number | null;
};
export type PnlTotals = Pick<HoldingPnl, 'value' | 'invested' | 'realized' | 'unrealized' | 'income' | 'costs' | 'linked' | 'currencyEffect' | 'total' | 'returnPercent'>;
/** A value recorded for a holding on a day, in its own currency. */
export type ValueMark = { date: string; recordId: string; currency: string; value: number };
/** `missing` counts holdings and linked payments left out because no rate converts them; the totals are then incomplete. */
export type InvestmentPnl = { holdings: HoldingPnl[]; totals: PnlTotals; flows: PnlFlow[]; sales: RealizedSale[]; marks: ValueMark[]; missing: number };

type State = {
 record: Entry; basisL: number; basisD: number; last: number | null; realizedL: number; realizedD: number;
 incomeL: number; incomeD: number; costsL: number; costsD: number; linkedL: number; investedD: number;
 opening: PnlFlow | null; trades: number;
};
type Ledger = { input: PnlInput; states: Map<string, State>; flows: PnlFlow[]; sales: RealizedSale[]; marks: ValueMark[]; carried: Map<string, { local: number; shown: number }>; missing: number };

const transferNote = 'Security transfer. ';
const isTransfer = (event: HistoryEvent) => !event.account_link && event.notes.startsWith(transferNote);
const transferKey = (event: HistoryEvent) => [event.occurred_on, Number(event.amount), event.notes].join('|');

function rateNow(input: PnlInput, currency: string) {
 return convertAmount(1, currency, input.currency, marketRates(input.market));
}
/** The day's rate into the display currency, or today's when that day has none. */
function rateOn(input: PnlInput, currency: string, date: string) {
 if (currency === input.currency) return 1;
 const dated = input.rate?.(currency, input.currency, date);
 return dated && Number.isFinite(dated) && dated > 0 ? dated : rateNow(input, currency);
}

function addFlow(ledger: Ledger, state: State, flow: Omit<PnlFlow, 'recordId' | 'shown' | 'linked'> & { shown?: number; linked?: boolean }) {
 const shown = flow.shown ?? flow.local * (rateOn(ledger.input, state.record.currency, flow.date) ?? 0);
 const entry: PnlFlow = { ...flow, recordId: state.record.id, shown, linked: flow.linked ?? false };
 ledger.flows.push(entry);
 if (entry.type === 'buy') { state.basisL += entry.local; state.basisD += shown; state.investedD += shown; }
 if (entry.type === 'income') { state.incomeL += entry.local; state.incomeD += shown; }
 if (entry.type === 'cost') { state.costsL += entry.local; state.costsD += shown; }
 if (entry.linked) state.linkedL += entry.type === 'income' ? entry.local : -entry.local;
 return entry;
}

/** The share of the holding a withdrawal took: its proceeds against the value just before it. */
function soldShare(state: State, proceeds: number, after: number | null) {
 const before = after !== null ? after + proceeds : state.last;
 if (before !== null && before > 0) return Math.min(1, proceeds / before);
 return state.basisL > 0 ? Math.min(1, proceeds / state.basisL) : 1;
}

function withdraw(ledger: Ledger, state: State, event: HistoryEvent, after: number | null) {
 const proceeds = Number(event.amount), share = soldShare(state, proceeds, after);
 const cost = { local: state.basisL * share, shown: state.basisD * share };
 state.basisL -= cost.local; state.basisD -= cost.shown;
 // The same security moved to another of the owner's holdings keeps its cost: nothing was sold.
 if (isTransfer(event)) { ledger.carried.set(transferKey(event), cost); return; }
 const flow = addFlow(ledger, state, { id: event.id, date: event.occurred_on, type: 'sell', local: proceeds, name: state.record.name });
 state.trades++;
 state.realizedL += proceeds - cost.local; state.realizedD += flow.shown - cost.shown;
 ledger.sales.push({ id: event.id, date: event.occurred_on, recordId: state.record.id, name: state.record.name, kind: state.record.kind, currency: state.record.currency, proceeds, cost: cost.local, gain: proceeds - cost.local, shownGain: flow.shown - cost.shown });
}

function contribute(ledger: Ledger, state: State, event: HistoryEvent) {
 const moved = isTransfer(event) ? ledger.carried.get(transferKey(event)) : undefined;
 if (moved) { ledger.carried.delete(transferKey(event)); state.basisL += moved.local; state.basisD += moved.shown; return; }
 addFlow(ledger, state, { id: event.id, date: event.occurred_on, type: 'buy', local: Number(event.amount), name: state.record.name });
 state.trades++;
}

function applyEvent(ledger: Ledger, state: State, event: HistoryEvent, opening: { amount: number } | undefined) {
 const after = event.balance === null ? null : Number(event.balance) * Number(event.ownership_percentage) / 100;
 const entry = { id: event.id, date: event.occurred_on, name: state.record.name };
 // A value recorded before any purchase is capital that was already invested: it opens the cost, as on Overview.
 if (opening) state.opening = addFlow(ledger, state, { ...entry, id: 'opening:' + event.id, type: 'buy', local: opening.amount });
 if (event.event_type === 'contribution') contribute(ledger, state, event);
 if (event.event_type === 'withdrawal') withdraw(ledger, state, event, after);
 if (event.event_type === 'income') addFlow(ledger, state, { ...entry, type: 'income', local: Number(event.amount) });
 if (event.event_type === 'expense') addFlow(ledger, state, { ...entry, type: 'cost', local: Number(event.amount) });
 if (after !== null) state.last = after;
 // Bought but not valued yet: the money put in stands for the value until the first one is recorded.
 ledger.marks.push({ date: event.occurred_on, recordId: state.record.id, currency: state.record.currency, value: state.last ?? state.basisL });
}

/** The holding a one-time payment belongs to: the property it names, the asset it is income from, or its business. */
function linkedHolding(row: Entry, states: Map<string, State>) {
 if (row.frequency !== 'Once' || !row.date || row.history_event_id || row.mortgage_payment_id || row.movement_id || row.operation_id) return null;
 const earned = income.includes(row.kind);
 if (!earned && !expenses.includes(row.kind)) return null;
 const state = states.get(row.property_id ?? (earned ? row.income_source_id : null) ?? row.business_id ?? '');
 return state && ['Business', 'Property'].includes(state.record.kind) ? state : null;
}

function applyLinked(ledger: Ledger, row: Entry) {
 const state = linkedHolding(row, ledger.states);
 if (!state || row.date > ledger.input.today) return;
 const entered = { amount: Number(row.amount), currency: row.currency }, rates = ratesOf(row, marketRates(ledger.input.market));
 const local = amountIn(entered, state.record.currency, rates), shown = amountIn(entered, ledger.input.currency, rates);
 if (local === null || shown === null) { ledger.missing++; return; }
 addFlow(ledger, state, { id: row.id, date: row.date, type: income.includes(row.kind) ? 'income' : 'cost', local, shown, name: row.name, linked: true });
}

/** A stock or coin entered with its purchase price and never bought through the app: its cost is that price, not the
 * value on the day it was added, so the gain the holding's card shows is the gain here. */
function applyEnteredCost(state: State) {
 const { record, opening } = state, cost = Number(record.cost) * Number(record.quantity);
 if (!opening || state.trades || !unitPricedKinds.includes(record.kind) || !(cost > 0) || !(state.basisL > 0)) return;
 const ratio = cost / state.basisL;
 state.investedD += opening.shown * (ratio - 1);
 state.basisD *= ratio; state.basisL = cost;
 opening.shown *= ratio; opening.local *= ratio;
}

function finish(ledger: Ledger, state: State): HoldingPnl | null {
 const { record } = state, { input } = ledger;
 const local = marketEntry(record, record.currency, input.market), shown = marketEntry(record, input.currency, input.market), rate = rateNow(input, record.currency);
 if (!local || !shown || rate === null) { ledger.missing++; return null; }
 const worth = value(local), worthShown = value(shown);
 // No history at all: nothing is known about what it cost, so it opens at today's value (or its entered cost) with no gain.
 if (!state.opening && !state.trades && state.basisL === 0 && worth > 0) {
  state.opening = addFlow(ledger, state, { id: 'opening:' + record.id, date: input.today, type: 'buy', local: worth, shown: worthShown, name: record.name });
 }
 applyEnteredCost(state);
 ledger.marks.push({ date: input.today, recordId: record.id, currency: record.currency, value: worth });
 const totalLocal = state.realizedL + worth - state.basisL + state.incomeL - state.costsL;
 const total = state.realizedD + worthShown - state.basisD + state.incomeD - state.costsD;
 return {
  id: record.id, name: record.name, kind: record.kind, currency: record.currency, accountId: record.holding_account_id ?? null,
  value: worthShown, basis: state.basisD, invested: state.investedD, realized: state.realizedL * rate, unrealized: (worth - state.basisL) * rate,
  income: state.incomeL * rate, costs: state.costsL * rate, linked: state.linkedL * rate, currencyEffect: total - totalLocal * rate, total,
  returnPercent: state.investedD > 0 ? total / state.investedD * 100 : null,
 };
}

const summed = ['value', 'invested', 'realized', 'unrealized', 'income', 'costs', 'linked', 'currencyEffect', 'total'] as const;
/** Several holdings as one line: a class, an account or the whole portfolio. */
export function sumPnl(holdings: readonly HoldingPnl[]): PnlTotals {
 const totals = Object.fromEntries(summed.map(key => [key, holdings.reduce((sum, holding) => sum + holding[key], 0)])) as Omit<PnlTotals, 'returnPercent'>;
 return { ...totals, returnPercent: totals.invested > 0 ? totals.total / totals.invested * 100 : null };
}

const newState = (record: Entry): State => ({ record, basisL: 0, basisD: 0, last: null, realizedL: 0, realizedD: 0, incomeL: 0, incomeD: 0, costsL: 0, costsD: 0, linkedL: 0, investedD: 0, opening: null, trades: 0 });
// A transfer leaves one holding before it arrives in the other, whichever was saved first.
const eventOrder = (a: HistoryEvent, b: HistoryEvent) => a.occurred_on.localeCompare(b.occurred_on) || Number(b.event_type === 'withdrawal' && isTransfer(b)) - Number(a.event_type === 'withdrawal' && isTransfer(a)) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

export function investmentPnl(input: PnlInput): InvestmentPnl {
 // Money lent is a loan, followed in Loans & debts: it is not a holding here, as on the Holdings tab.
 const held = input.records.filter(record => benchmarkInvestment(record) && record.kind !== 'Money lent');
 const ledger: Ledger = { input, states: new Map(), flows: [], sales: [], marks: [], carried: new Map(), missing: 0 };
 for (const record of held) {
  if (rateNow(input, record.currency) === null) ledger.missing++;
  else ledger.states.set(record.id, newState(record));
 }
 const openings = openingFunding(held, input.events, input.today);
 for (const event of input.events.filter(event => event.occurred_on <= input.today).sort(eventOrder)) {
  const state = ledger.states.get(event.record_id);
  if (state) applyEvent(ledger, state, event, openings.get(event.id));
 }
 for (const row of input.cashflows ?? []) applyLinked(ledger, row);
 const holdings = [...ledger.states.values()].flatMap(state => finish(ledger, state) ?? []);
 const day = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);
 return { holdings: holdings.sort((a, b) => b.value - a.value), totals: sumPnl(holdings), flows: ledger.flows.sort(day), sales: ledger.sales.sort(day), marks: ledger.marks.sort(day), missing: ledger.missing };
}

/** The running profit or loss on a day, for the chart of it over time. */
export type PnlPoint = { date: string; total: number };
export type PnlGroup = PnlTotals & { key: string; count: number };
/** Holdings added up by a key (their kind, their account), largest value first. */
export function groupPnl(holdings: readonly HoldingPnl[], keyOf: (holding: HoldingPnl) => string): PnlGroup[] {
 const groups = new Map<string, HoldingPnl[]>();
 for (const holding of holdings) groups.set(keyOf(holding), [...(groups.get(keyOf(holding)) ?? []), holding]);
 return [...groups].map(([key, items]) => ({ key, count: items.length, ...sumPnl(items) })).sort((a, b) => b.value - a.value);
}

/** The calendar years that have a sale, newest first. */
export const realizedYears = (sales: readonly RealizedSale[]) => [...new Set(sales.map(sale => sale.date.slice(0, 4)))].sort().reverse();
export const realizedExportColumns = ['date', 'name', 'kind', 'currency', 'proceeds', 'cost', 'gain'] as const;
/** A year's sales as rows of a data file: ISO dates and plain numbers in each holding's own currency. */
export function realizedExportRows(sales: readonly RealizedSale[], year: string) {
 const round = (amount: number) => Math.round(amount * 100) / 100;
 return sales.filter(sale => sale.date.startsWith(year)).map(sale => ({ date: sale.date, name: sale.name, kind: sale.kind, currency: sale.currency, proceeds: round(sale.proceeds), cost: round(sale.cost), gain: round(sale.gain) }));
}
