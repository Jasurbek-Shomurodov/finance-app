import { monthEnd } from './calendar-days';
import { liabilities, type Entry } from './finance';
import { convertAmount } from './market';
import type { PlanningData } from './planning';
import { otherShareKey, topShares, type Share } from './cash-flow-report';
import { cashFlowItems, transferAmount, type CashFlowItem } from './spending';
import type { TransactionSplit } from './transaction-tools';

/** What a tap on the Cash flow Sankey opens: one income or spending category, the period's savings, or one account. */
export type DrillTarget = { side: 'income' | 'expense'; key: string } | { side: 'account'; key: string } | { side: 'savings' }
 /** One payer (`income`) or merchant, by the name its transactions carry. */
 | { side: 'merchant'; key: string; income: boolean };
/** A node of a drill-down Sankey; `open` is the Sankey a tap on it opens next. */
export type DrillNode = { name: string; kind: 'income' | 'expense' | 'savings' | 'account' | 'debt' | 'untraced'; open?: DrillTarget };
export type DrillFlows = { nodes: DrillNode[]; links: Array<{ source: number; target: number; value: number }>; missing: number };
type Rates = number | Record<string, number> | undefined;
/** `label` names a category key (an added category's id or a built-in kind). */
export type DrillContext = { data: Pick<PlanningData, 'records' | 'activity' | 'investmentLinks'>; splits: TransactionSplit[]; months: string[]; currency: string; today: string; rates: Rates; t: (key: string) => string; label?: (key: string) => string };

const add = (totals: Map<string, number>, key: string, amount: number) => totals.set(key, (totals.get(key) ?? 0) + amount);
const shares = (totals: Map<string, number>): Share[] => [...totals].filter(([, amount]) => amount > 0).map(([key, amount]) => ({ key, amount, share: 0 })).sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key));
/** The period's first day and its last day so far. */
function span(months: string[], today: string) {
 const last = months.at(-1) ?? today.slice(0, 7), end = monthEnd(last);
 return { from: (months[0] ?? last) + '-01', to: today < end ? today : end };
}

type Item = CashFlowItem<Entry>;
/** The payer or merchant a transaction is grouped under: its name, else its category; a Tracker expense has neither. */
const merchantOf = (item: Item, t: (key: string) => string) => item.record ? item.record.name.trim() || t(item.record.kind) : t('Other expense');
/** The account a transaction was recorded against, or the account of the operation that made it; '' for none. */
const accountOf = (item: Item, activityAccount: Map<string, string>) => (item.record ? item.record.account_id ?? activityAccount.get(item.record.id) : item.link?.account_id) ?? '';
/** A category node; a tap on it opens that category's Sankey. */
const categoryNode = (key: string, income: boolean, context: DrillContext): DrillNode => ({ name: (context.label ?? context.t)(key), kind: income ? 'income' : 'expense', open: { side: income ? 'income' : 'expense', key } });

/** One category's payers (income) or merchants (spending), from the same transactions Cash flow counts, so the flows add
 * up to the category's total there. The nine largest are named; the rest share "Other". */
function categoryFlows(target: { side: 'income' | 'expense'; key: string }, title: string, context: DrillContext): DrillFlows {
 const { data, splits, months, currency, today, rates, t } = context, { from, to } = span(months, today);
 const totals = new Map<string, number>();
 let missing = 0;
 for (const item of cashFlowItems(data.records as Entry[], from, to, { splits, investmentLinks: data.investmentLinks })) {
  if (item.income !== (target.side === 'income')) continue;
  const amount = item.income ? (item.record && (item.record.custom_category_id ?? item.record.kind) === target.key ? item.amount : 0) : item.parts.filter(part => part.category === target.key).reduce((sum, part) => sum + part.amount, 0);
  if (!amount) continue;
  const value = item.currency ? convertAmount(amount, item.currency, currency, rates) : null;
  if (value === null || value === undefined) { missing += 1; continue; }
  add(totals, merchantOf(item, t), value);
 }
 const income = target.side === 'income', side: DrillNode['kind'] = target.side;
 // Each named payer or merchant opens its own Sankey; the merged "Other" does not.
 const named = topShares(shares(totals), 9).map(item => item.key === otherShareKey ? { name: t('Other'), value: item.amount, open: undefined } : { name: item.key, value: item.amount, open: { side: 'merchant' as const, key: item.key, income } });
 if (target.side === 'income') {
  const nodes: DrillNode[] = [...named.map(item => ({ name: item.name, kind: side, open: item.open })), { name: title, kind: side }];
  return { nodes, links: named.map((item, index) => ({ source: index, target: named.length, value: item.value })), missing };
 }
 const nodes: DrillNode[] = [{ name: title, kind: side }, ...named.map(item => ({ name: item.name, kind: side, open: item.open }))];
 return { nodes, links: named.map((item, index) => ({ source: 0, target: index + 1, value: item.value })), missing };
}

/** One end of a flow: an account, holding or debt by id ('' for transactions recorded against no account), or a category. */
type End = { account: string } | { income: string } | { expense: string } | { untraced: true };
type Flow = { from: End; to: End; value: number };
type Mover = (from: End, to: End, amount: number, currency: string | null | undefined) => boolean;
const untraced: End = { untraced: true };
type Activity = NonNullable<PlanningData['activity']>[number];
/** One account operation: a transfer between accounts, a loan repayment, or a mortgage payment's principal (its interest
 * is spending, counted with the transactions). Reconciliations are corrections, not flows, and stay out. A transfer's
 * fee and an exchange difference are the gap between what left and what arrived. */
function moveActivity(row: Activity, byId: Map<string, Entry>, move: Mover, convert: Convert, currency: string) {
 if (!row.target_id) return;
 const source = { account: row.account_id }, target = { account: row.target_id }, unit = byId.get(row.account_id)?.currency;
 if (row.action === 'transfer') transfer(row, byId, move, convert, currency);
 else if (row.action === 'repayment') move(source, target, Number(row.amount), unit);
 else if (row.action === 'mortgage') { const payment = byId.get(row.id); if (payment) move(source, target, transferAmount(payment), payment.currency); }
}

type Convert = (amount: number, currency: string | null | undefined) => number | null;
/** A transfer arrives as `received`, in the target's currency. What left beyond that (a fee, an exchange difference)
 * goes nowhere traceable, so it shows as "Not traced" instead of making the target look richer or the source poorer. */
function transfer(row: Activity, byId: Map<string, Entry>, move: Mover, convert: Convert, currency: string) {
 const source = { account: row.account_id }, target = { account: row.target_id! };
 const unit = byId.get(row.account_id)?.currency, arrival = byId.get(row.target_id!)?.currency ?? unit;
 const sent = convert(Number(row.amount), unit), received = convert(Number(row.received || row.amount), arrival);
 if (sent === null || received === null) { move(source, target, Number(row.amount), null); return; }
 move(source, target, Math.min(sent, received), currency);
 if (sent - received >= .005) move(source, untraced, sent - received, currency);
 else if (received - sent >= .005) move(untraced, target, received - sent, currency);
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
 const convert: Convert = (amount, unit) => unit ? convertAmount(amount, unit, currency, rates) ?? null : null;
 const move: Mover = (source, target, amount, unit) => {
  if (!amount) return true;
  const value = convert(amount, unit);
  if (value === null) { missing += 1; return false; }
  flows.push({ from: source, to: target, value });
  return true;
 };
 const activityAccount = new Map((data.activity ?? []).map(row => [row.id, row.account_id]));
 for (const item of cashFlowItems(records, from, to, { splits, investmentLinks: data.investmentLinks })) {
  const account = { account: accountOf(item, activityAccount) };
  if (item.income) move({ income: item.record?.custom_category_id ?? item.record?.kind ?? 'Other income' }, account, item.amount, item.currency);
  else for (const part of item.parts) move(account, { expense: part.category }, part.amount, item.currency);
 }
  for (const row of data.activity ?? []) if (row.occurred_on >= from && row.occurred_on <= to) moveActivity(row, byId, move, convert, currency);
 for (const link of data.investmentLinks ?? []) moveInvestment(link, from, to, byId, move);
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

/** The node for an account, holding or debt; a tap on it opens that account's own Sankey. */
function accountNode(key: string, byId: Map<string, Entry>, t: (key: string) => string): DrillNode {
 if (!key) return { name: t('No account'), kind: 'untraced' };
 const record = byId.get(key);
 return { name: record?.name.trim() || t(record?.kind ?? 'Other'), kind: record && liabilities.includes(record.kind) ? 'debt' : 'account', open: { side: 'account', key } };
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
 if (gap >= .5) right.push({ node: { name: t('Not traced'), kind: 'untraced' }, value: gap });
 if (gap <= -.5) left.push({ node: { name: t('Not traced'), kind: 'untraced' }, value: -gap });
 // Savings sit in the middle: the period's cash flow and any account drawn down feed it; it flows out to where the money is now.
 const middle: DrillNode = { name: t('Savings'), kind: 'savings' };
 const feeds = left.length ? [{ node: { name: t('Cash flow'), kind: 'income' } as DrillNode, value: savings }, ...left] : [];
 const nodes = [...feeds.map(item => item.node), middle, ...right.map(item => item.node)];
 const hub = feeds.length;
 const links = [...feeds.map((item, index) => ({ source: index, target: hub, value: item.value })), ...right.map((item, index) => ({ source: hub, target: hub + 1 + index, value: item.value }))];
 return { nodes, links: links.filter(link => link.value > 0), missing };
}

/** One account's period: what came in (income by category, transfers from other accounts, sales of holdings) on the
 * left, what went out (spending by category, transfers, debt payments, purchases) on the right. The difference is the
 * change in its balance, shown as "Balance" on whichever side balances the account. Every other node opens its own Sankey. */
function accountFlows(key: string, title: string, context: DrillContext): DrillFlows {
 const { t } = context;
 const { flows, missing, byId } = periodFlows(context);
 const self = accountNode(key, byId, t);
 const ends = new Map<string, { node: DrillNode; inflow: number; outflow: number }>();
 const tally = (end: End, side: 'inflow' | 'outflow', value: number) => {
  const id = 'account' in end ? 'a:' + end.account : 'income' in end ? 'i:' + end.income : 'expense' in end ? 'e:' + end.expense : 'u';
  const node: DrillNode = 'account' in end ? accountNode(end.account, byId, t) : 'income' in end ? categoryNode(end.income, true, context) : 'expense' in end ? categoryNode(end.expense, false, context) : { name: t('Not traced'), kind: 'untraced' };
  const entry = ends.get(id) ?? { node, inflow: 0, outflow: 0 };
  entry[side] += value;
  ends.set(id, entry);
 };
 for (const flow of flows) {
  if ('account' in flow.to && flow.to.account === key) tally(flow.from, 'inflow', flow.value);
  if ('account' in flow.from && flow.from.account === key) tally(flow.to, 'outflow', flow.value);
 }
 // A counterpart both sending and receiving (two transfers back and forth) shows on the side of its net.
 const nets = [...ends.values()].map(entry => ({ node: entry.node, value: entry.inflow - entry.outflow })).filter(entry => Math.abs(entry.value) >= .5);
 const left = nets.filter(entry => entry.value > 0).sort((a, b) => b.value - a.value), right = nets.filter(entry => entry.value < 0).map(entry => ({ ...entry, value: -entry.value })).sort((a, b) => b.value - a.value);
 const change = left.reduce((sum, entry) => sum + entry.value, 0) - right.reduce((sum, entry) => sum + entry.value, 0);
 if (change >= .5) right.push({ node: { name: t('Balance'), kind: 'savings' }, value: change });
 if (change <= -.5) left.push({ node: { name: t('Balance'), kind: 'savings' }, value: -change });
 const nodes: DrillNode[] = [...left.map(entry => entry.node), { ...self, name: title, open: undefined }, ...right.map(entry => entry.node)];
 const hub = left.length;
 return { nodes, links: [...left.map((entry, index) => ({ source: index, target: hub, value: entry.value })), ...right.map((entry, index) => ({ source: hub, target: hub + 1 + index, value: entry.value }))], missing };
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
   const value = item.currency ? convertAmount(part.amount, item.currency, currency, rates) ?? null : null;
   if (value === null) { missing += 1; continue; }
   add(accounts, accountOf(item, activityAccount), value);
   add(categories, part.category, value);
  }
 }
 const accountSide = [...accounts].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ node: accountNode(key, byId, t), value }));
 const categorySide = [...categories].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ node: categoryNode(key, target.income, context), value }));
 const [left, right] = target.income ? [categorySide, accountSide] : [accountSide, categorySide];
 const hub = left.length, nodes = [...left.map(entry => entry.node), { name: title, kind: target.income ? 'income' : 'expense' } as DrillNode, ...right.map(entry => entry.node)];
 return { nodes, links: [...left.map((entry, index) => ({ source: index, target: hub, value: entry.value })), ...right.map((entry, index) => ({ source: hub, target: hub + 1 + index, value: entry.value }))], missing };
}

/** A payer's or merchant's transactions in the period, newest first: each as it was entered, in its own amount and
 * currency. A transaction split over several categories is listed once. Tracker expenses have no record and are left out. */
export function merchantTransactions(target: { key: string; income: boolean }, context: DrillContext): Entry[] {
 const { data, splits, months, today, t } = context, { from, to } = span(months, today);
 const found: Entry[] = [];
 for (const item of cashFlowItems(data.records as Entry[], from, to, { splits, investmentLinks: data.investmentLinks })) if (item.record && item.income === target.income && merchantOf(item, t) === target.key) found.push(item.record);
 return found.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** The second Sankey behind a tap on the first: a category by payer or merchant, where the savings went, one account, or
 * one payer or merchant. */
export function drillFlows(target: DrillTarget, title: string, savings: number, context: DrillContext): DrillFlows {
 if (target.side === 'savings') return savingsFlows(savings, context);
 if (target.side === 'account') return accountFlows(target.key, title, context);
 if (target.side === 'merchant') return merchantFlows(target, title, context);
 return categoryFlows(target, title, context);
}
