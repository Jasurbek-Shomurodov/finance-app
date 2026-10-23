import { type Entry } from './finance';
import { convertAmount } from './market';
import type { PlanningData } from './planning';
import type { DrillContext, DrillFlows, DrillNode, DrillTarget } from './cash-flow-drill-types';
import { accountNode, accountOf, add, categoryNode, merchantOf, pageOf, span, transactionsOf, type Item } from './cash-flow-drill-base';
import { categoryGroup, groupFlows, groupTransactions } from './cash-flow-group';
import { cashFlowItems, spendingAmount, transferAmount } from './spending';
import { ratesOf, type DatedRecord, type DayTable } from './transaction-rates';

export type { DrillContext, DrillFlows, DrillNode, DrillTarget } from './cash-flow-drill-types';
export { accountNode, categoryNode, span } from './cash-flow-drill-base';

/** One end of a flow: an account, holding or debt by id ('' for transactions recorded against no account), or a category. */
/** `ref` names the transfer an untraced amount (a fee, an exchange difference) belongs to. */
type End = { account: string } | { income: string; payer?: string } | { expense: string } | { untraced: true; ref?: string };
export type Flow = { from: End; to: End; value: number };
type Mover = (from: End, to: End, amount: number, currency: string | null | undefined, record?: DatedRecord | null) => boolean;
type Activity = NonNullable<PlanningData['activity']>[number];
/** One account operation: a transfer between accounts, a loan repayment, or a mortgage payment's principal (its interest
 * is spending, counted with the transactions). Reconciliations are corrections, not flows, and stay out. A transfer's
 * fee and an exchange difference are the gap between what left and what arrived. */
function moveActivity(row: Activity, byId: Map<string, Entry>, recorder: Recorder) {
 const { move } = recorder;
 if (!row.target_id) return;
 const source = { account: row.account_id }, target = { account: row.target_id }, unit = byId.get(row.account_id)?.currency;
 if (row.action === 'transfer') transfer({ from: row.account_id, to: row.target_id, ref: row.id }, { amount: Number(row.amount), currency: byId.get(row.account_id)?.currency }, { amount: Number(row.received || row.amount), currency: byId.get(row.target_id)?.currency ?? byId.get(row.account_id)?.currency }, recorder);
 else if (row.action === 'repayment') move(source, target, Number(row.amount), unit);
 else if (row.action === 'mortgage') { const payment = byId.get(row.id); if (payment) move(source, target, transferAmount(payment), payment.currency, payment); }
}

type Convert = (amount: number, currency: string | null | undefined, record?: DatedRecord | null) => number | null;
/** How flows are recorded: `move` adds one, `convert` turns an amount into the display `currency`. */
type Recorder = { move: Mover; convert: Convert; currency: string };
/** Money moved between two accounts: what left the source in its currency, what reached the target in its own. What
 * left beyond what arrived (a fee, an exchange difference) goes nowhere traceable, so it shows as "Not traced" instead
 * of making the target look richer or the source poorer. */
function transfer(ends: { from: string; to: string; ref: string }, sent: { amount: number; currency?: string | null }, received: { amount: number; currency?: string | null }, { move, convert, currency }: Recorder) {
 const source = { account: ends.from }, target = { account: ends.to }, untraced: End = { untraced: true, ref: ends.ref };
 const out = convert(sent.amount, sent.currency), arrived = convert(received.amount, received.currency);
 if (out === null || arrived === null) { move(source, target, sent.amount, null); return; }
 move(source, target, Math.min(out, arrived), currency);
 if (out - arrived >= .005) move(source, untraced, out - arrived, currency);
 else if (arrived - out >= .005) move(untraced, target, arrived - out, currency);
}

/** A transfer, buy or sale recorded on Accounts (`asset_movements`): its values are money in each side's currency, also
 * for a holding, whose `sent` and `received` are quantities. Capitalized interest moves nothing between accounts. */
function moveMovement(row: NonNullable<PlanningData['movements']>[number], byId: Map<string, Entry>, recorder: Recorder) {
 if (row.kind === 'interest') return;
 transfer({ from: row.source_id, to: row.target_id, ref: row.id }, { amount: Number(row.source_value), currency: byId.get(row.source_id)?.currency }, { amount: Number(row.target_value), currency: byId.get(row.target_id)?.currency }, recorder);
}

/** Cash moved from an account into a holding (a buy) or back out of it (a sale). Tracker expenses are spending. */
function moveInvestment(link: NonNullable<PlanningData['investmentLinks']>[number], from: string, to: string, byId: Map<string, Entry>, move: Mover) {
 const event = link.investment_history;
 if (!event?.record_id || event.event_type === 'expense' || event.occurred_on < from || event.occurred_on > to) return;
 const amount = Number(link.amount), unit = link.account_currency ?? byId.get(link.account_id)?.currency;
 const cash = { account: link.account_id }, holding = { account: event.record_id };
 if (amount < 0) move(cash, holding, -amount, unit); else move(holding, cash, amount, unit);
}

/** Every flow of the period in `currency`: income into the account it was recorded against, spending out of it by
 * category, account operations, and cash moved into or out of investments. A flow without a rate is counted as missing. */
export function periodFlows(context: DrillContext) {
 const { data, splits, months, currency, today, rates } = context, { from, to } = span(months, today);
 const records = data.records as Entry[], byId = new Map(records.map(record => [record.id, record]));
 const flows: Flow[] = [];
 let missing = 0;
 const convert: Convert = (amount, unit, record) => unit ? convertAmount(amount, unit, currency, ratesOf(record, rates)) ?? null : null;
 const move: Mover = (source, target, amount, unit, record) => {
  if (!amount) return true;
  const value = convert(amount, unit, record);
  if (value === null) { missing += 1; return false; }
  flows.push({ from: source, to: target, value });
  return true;
 };
 const activityAccount = new Map((data.activity ?? []).map(row => [row.id, row.account_id]));
 for (const item of cashFlowItems(records, from, to, { splits, investmentLinks: data.investmentLinks })) {
  const account = { account: accountOf(item, activityAccount) };
  if (item.income) move({ income: item.record?.custom_category_id ?? item.record?.kind ?? 'Other income', payer: merchantOf(item, context.t) }, account, item.amount, item.currency, item.dated);
  else for (const part of item.parts) move(account, { expense: part.category }, part.amount, item.currency, item.dated);
 }
 // A transfer, repayment or purchase converts at the rates of its own day, as a transaction does.
 const onDay = (row: { day_rates?: DayTable | null }): Recorder => {
  const day = row.day_rates === undefined ? null : { currency: '', day_rates: row.day_rates };
  return { currency, move: (source, target, amount, unit, record) => move(source, target, amount, unit, record ?? day), convert: (amount, unit, record) => convert(amount, unit, record ?? day) };
 };
 for (const row of data.activity ?? []) if (row.occurred_on >= from && row.occurred_on <= to) moveActivity(row, byId, onDay(row));
 for (const link of data.investmentLinks ?? []) moveInvestment(link, from, to, byId, onDay(link).move);
 for (const row of data.movements ?? []) if (row.occurred_on >= from && row.occurred_on <= to) moveMovement(row, byId, onDay(row));
 return { flows, missing, byId };
}

/** How each account, holding and debt changed in the period, in `currency` ('' for transactions with no account). */
export function accountChanges(context: DrillContext) {
 const { flows, missing } = periodFlows(context), changes = new Map<string, number>();
 for (const flow of flows) {
  if ('account' in flow.from) add(changes, flow.from.account, -flow.value);
  if ('account' in flow.to) add(changes, flow.to.account, flow.value);
 }
 return { changes, missing };
}

/** Where the period's savings went: the accounts and holdings that grew and the debts paid down, fed by the savings and by
 * any account that shrank. What the records cannot explain (transfer fees, exchange differences, a flow in a currency
 * without a rate) is shown as "Not traced", never spread over the accounts. */
function savingsFlows(savings: number, context: DrillContext): DrillFlows {
 const { data, t } = context, byId = new Map((data.records as Entry[]).map(record => [record.id, record]));
 const { changes, missing } = accountChanges(context);
 const node = (key: string) => accountNode(key, byId, t);
 const sinks = [...changes].filter(([, value]) => value >= .5).sort((a, b) => b[1] - a[1]);
 const sources = [...changes].filter(([, value]) => value <= -.5).sort((a, b) => a[1] - b[1]);
 const into = sinks.reduce((sum, [, value]) => sum + value, 0), out = savings + sources.reduce((sum, [, value]) => sum - value, 0);
 const gap = out - into;
 const left: Array<{ node: DrillNode; value: number }> = [...sources.map(([key, value]) => ({ node: node(key), value: -value }))];
 const right: Array<{ node: DrillNode; value: number }> = sinks.map(([key, value]) => ({ node: node(key), value }));
 // Not traced opens the fees and exchange differences behind it; Cash flow opens the period's income and spending.
 const notTraced: DrillNode = { name: t('Not traced'), kind: 'untraced', open: { side: 'untraced' } };
 if (gap >= .5) right.push({ node: notTraced, value: gap });
 if (gap <= -.5) left.push({ node: notTraced, value: -gap });
 // Savings sit in the middle: the period's cash flow and any account drawn down feed it; it flows out to where the money is now.
 const middle: DrillNode = { name: t('Savings'), kind: 'savings', open: { side: 'cashflow' } };
 const feeds = left.length ? [{ node: { name: t('Cash flow'), kind: 'income', open: { side: 'cashflow' } } as DrillNode, value: savings }, ...left] : [];
 const nodes = [...feeds.map(item => item.node), middle, ...right.map(item => item.node)];
 const hub = feeds.length;
 const links = [...feeds.map((item, index) => ({ source: index, target: hub, value: item.value })), ...right.map((item, index) => ({ source: hub, target: hub + 1 + index, value: item.value }))];
 return { nodes, links: links.filter(link => link.value > 0), missing };
}

/** One account's period: what came in (income by source, transfers from other accounts, sales of holdings) on the
 * left, what went out (spending by category, transfers, debt payments, purchases) on the right. The difference is the
 * change in its balance, shown as "Balance" on whichever side balances the account. Every other node opens its own Sankey. */
/** The interest of each mortgage payment to `debt` in the period, by the account that paid it and the spending category
 * it counts in. The period's flows leave it with the paying account, where it is spending; a debt's own Sankey shows the
 * whole payment passing through the debt, so its interest flows on to its category there. */
function mortgageInterest(debt: string, context: DrillContext, byId: Map<string, Entry>) {
 const { data, months, today, currency, rates } = context, { from, to } = span(months, today);
 const paid: Array<{ account: string; category: string; value: number }> = [];
 let missing = 0;
 for (const row of data.activity ?? []) {
  const payment = byId.get(row.id);
  if (row.action !== 'mortgage' || row.target_id !== debt || row.occurred_on < from || row.occurred_on > to || !payment) continue;
  const value = convertAmount(spendingAmount(payment), payment.currency, currency, ratesOf(payment, rates));
  if (value === null || value === undefined) { missing += 1; continue; }
  if (value > 0) paid.push({ account: row.account_id, category: payment.custom_category_id ?? payment.kind, value });
 }
 return { paid, missing };
}

function accountFlows(key: string, title: string, context: DrillContext): DrillFlows {
 const { t } = context;
 const { flows, missing, byId } = periodFlows(context);
 const self = accountNode(key, byId, t);
 const ends = new Map<string, { node: DrillNode; inflow: number; outflow: number }>();
 const tally = (end: End, side: 'inflow' | 'outflow', value: number) => {
  // Income shows by its source (a payer), which opens the payer's own Sankey; spending shows by category.
  const id = 'account' in end ? 'a:' + end.account : 'income' in end ? (end.payer ? 'p:' + end.payer : 'i:' + end.income) : 'expense' in end ? 'e:' + end.expense : 'u';
  // An account's untraced amounts open the transfers they belong to.
  const node: DrillNode = 'account' in end ? accountNode(end.account, byId, t) : 'income' in end ? (end.payer ? { name: end.payer, kind: 'income', open: { side: 'merchant', key: end.payer, income: true } } : categoryNode(end.income, true, context)) : 'expense' in end ? categoryNode(end.expense, false, context) : { name: t('Not traced'), kind: 'untraced', open: { side: 'untraced', key } };
  const entry = ends.get(id) ?? { node, inflow: 0, outflow: 0 };
  entry[side] += value;
  ends.set(id, entry);
 };
 for (const flow of flows) {
  if ('account' in flow.to && flow.to.account === key) tally(flow.from, 'inflow', flow.value);
  if ('account' in flow.from && flow.from.account === key) tally(flow.to, 'outflow', flow.value);
 }
 const interest = self.kind === 'debt' ? mortgageInterest(key, context, byId) : { paid: [], missing: 0 };
 for (const item of interest.paid) { tally({ account: item.account }, 'inflow', item.value); tally({ expense: item.category }, 'outflow', item.value); }
 // A counterpart both sending and receiving (two transfers back and forth) shows on the side of its net.
 const nets = [...ends.values()].map(entry => ({ node: entry.node, value: entry.inflow - entry.outflow })).filter(entry => Math.abs(entry.value) >= .5);
 const left = nets.filter(entry => entry.value > 0).sort((a, b) => b.value - a.value), right = nets.filter(entry => entry.value < 0).map(entry => ({ ...entry, value: -entry.value })).sort((a, b) => b.value - a.value);
 const change = left.reduce((sum, entry) => sum + entry.value, 0) - right.reduce((sum, entry) => sum + entry.value, 0);
 // What stays in a holding is money invested; what reaches a debt pays its principal; in an account it is the balance.
 const kept = t(self.kind === 'holding' ? 'Money invested' : self.kind === 'debt' ? 'Principal' : 'Balance');
 // A debt's principal opens the payments that paid it down; an account's balance where it stands today, when the period
 // runs to this month (an earlier one would need what moved since).
 // Without an account, or when the data stops before today, there is no balance to work back: it opens the page instead.
 const open: DrillTarget = self.kind === 'debt' ? { side: 'principal', key } : key && context.throughToday !== false ? { side: 'balance', key } : pageOf(self.kind);
 if (change >= .5) right.push({ node: { name: kept, kind: 'savings', open }, value: change });
 if (change <= -.5) left.push({ node: { name: kept, kind: 'savings', open }, value: -change });
 const nodes: DrillNode[] = [...left.map(entry => entry.node), { ...self, name: title, open: pageOf(self.kind) }, ...right.map(entry => entry.node)];
 const hub = left.length;
 return { nodes, links: [...left.map((entry, index) => ({ source: index, target: hub, value: entry.value })), ...right.map((entry, index) => ({ source: hub, target: hub + 1 + index, value: entry.value }))], missing: missing + interest.missing };
}

/** One payer or merchant: a merchant is paid from accounts (left) and spent on categories (right); a payer's income
 * comes under categories (left) and lands in accounts (right). Its accounts and categories open their own Sankeys. */
function merchantFlows(target: { key: string; income: boolean }, title: string, context: DrillContext): DrillFlows {
 const { data, splits, months, currency, today, rates, t } = context, { from, to } = span(months, today);
 const records = data.records as Entry[], byId = new Map(records.map(record => [record.id, record]));
 const activityAccount = new Map((data.activity ?? []).map(row => [row.id, row.account_id]));
 const accounts = new Map<string, number>(), categories = new Map<string, number>();
 let missing = 0;
 for (const item of cashFlowItems(records, from, to, { splits, investmentLinks: data.investmentLinks })) {
  if (item.income !== target.income || merchantOf(item, t) !== target.key) continue;
  const parts = item.income ? [{ category: item.record?.custom_category_id ?? item.record?.kind ?? 'Other income', amount: item.amount }] : item.parts;
  for (const part of parts) {
   const value = item.currency ? convertAmount(part.amount, item.currency, currency, ratesOf(item.dated, rates)) ?? null : null;
   if (value === null) { missing += 1; continue; }
   add(accounts, accountOf(item, activityAccount), value);
   add(categories, part.category, value);
  }
 }
 const accountSide = [...accounts].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ node: accountNode(key, byId, t), value }));
 const categorySide = [...categories].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ node: categoryNode(key, target.income, context), value }));
 const [left, right] = target.income ? [categorySide, accountSide] : [accountSide, categorySide];
 const hub = left.length, nodes = [...left.map(entry => entry.node), { name: title, kind: target.income ? 'income' : 'expense', open: transactionsOf({ direction: target.income ? 'income' : 'expense', query: target.key }, context) } as DrillNode, ...right.map(entry => entry.node)];
 return { nodes, links: [...left.map((entry, index) => ({ source: index, target: hub, value: entry.value })), ...right.map((entry, index) => ({ source: hub, target: hub + 1 + index, value: entry.value }))], missing };
}

/** Views other modules draw (`cash-flow-operations`, `cash-flow-principal`, `cash-flow-balance`) or that open details:
 * they list their own transactions. */
const elsewhere = new Set<DrillTarget['side']>(['operation', 'principal', 'interest', 'payment', 'balance', 'cashflow', 'untraced', 'goal', 'schedule', 'holdings', 'set', 'details', 'link', 'record']);

/** The transactions behind a category, payer, merchant or account Sankey, newest first: each as it was entered, in its own amount
 * and currency. A transaction split over several categories is listed once. Tracker expenses have no record, and
 * transfers and repayments are account operations rather than transactions, so they are left out. Savings lists every
 * income and spending transaction of the period, the ones its figure is made of. */
export function drillTransactions(target: DrillTarget, context: DrillContext): Entry[] {
 if (target.side === 'income' || target.side === 'expense' || target.side === 'group') return groupTransactions(target.side === 'group' ? target : categoryGroup(target), context);
 const { data, splits, months, today, t } = context, { from, to } = span(months, today);
 const activityAccount = new Map((data.activity ?? []).map(row => [row.id, row.account_id]));
 // A mortgage payment is listed under the account that paid it and under its mortgage.
 const paidDebt = new Map((data.activity ?? []).filter(row => row.action === 'mortgage' && row.target_id).map(row => [row.id, row.target_id!]));
 const matches = (item: Item) => {
  if (target.side === 'savings') return true;
  if (elsewhere.has(target.side)) return false;
  if (target.side === 'merchant') return item.income === target.income && merchantOf(item, t) === target.key;
  return target.side === 'account' && (accountOf(item, activityAccount) === target.key || (!!item.record && paidDebt.get(item.record.id) === target.key));
 };
 const found: Entry[] = [];
 for (const item of cashFlowItems(data.records as Entry[], from, to, { splits, investmentLinks: data.investmentLinks })) if (item.record && matches(item)) found.push(item.record);
 return found.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** The second Sankey behind a tap on the first: a category by payer or merchant, where the savings went, one account, or
 * one payer or merchant. */
export function drillFlows(target: DrillTarget, title: string, savings: number, context: DrillContext): DrillFlows {
 if (target.side === 'savings') return savingsFlows(savings, context);
 if (target.side === 'account') return accountFlows(target.key, title, context);
 if (target.side === 'merchant') return merchantFlows(target, title, context);
 if (target.side === 'group') return groupFlows(target, title, context);
 if (target.side === 'income' || target.side === 'expense') return groupFlows(categoryGroup(target), title, context);
 // A transfer, a debt's principal, a balance and a transaction are drawn by their own modules or open their details.
 return { nodes: [], links: [], missing: 0 };
}
