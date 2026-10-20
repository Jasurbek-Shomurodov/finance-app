import { monthEnd } from './calendar-days';
import { liabilities, type Entry } from './finance';
import { convertAmount } from './market';
import type { PlanningData } from './planning';
import { otherShareKey, topShares, type Share } from './cash-flow-report';
import { cashFlowItems, transferAmount } from './spending';
import type { TransactionSplit } from './transaction-tools';

/** What a tap on the Cash flow Sankey opens: one income or spending category, or the period's savings. */
export type DrillTarget = { side: 'income' | 'expense'; key: string } | { side: 'savings' };
export type DrillNode = { name: string; kind: 'income' | 'expense' | 'savings' | 'account' | 'debt' | 'untraced' };
export type DrillFlows = { nodes: DrillNode[]; links: Array<{ source: number; target: number; value: number }>; missing: number };
type Rates = number | Record<string, number> | undefined;
export type DrillContext = { data: Pick<PlanningData, 'records' | 'activity' | 'investmentLinks'>; splits: TransactionSplit[]; months: string[]; currency: string; today: string; rates: Rates; t: (key: string) => string };

const add = (totals: Map<string, number>, key: string, amount: number) => totals.set(key, (totals.get(key) ?? 0) + amount);
const shares = (totals: Map<string, number>): Share[] => [...totals].filter(([, amount]) => amount > 0).map(([key, amount]) => ({ key, amount, share: 0 })).sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key));
/** The period's first day and its last day so far. */
function span(months: string[], today: string) {
 const last = months.at(-1) ?? today.slice(0, 7), end = monthEnd(last);
 return { from: (months[0] ?? last) + '-01', to: today < end ? today : end };
}

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
  add(totals, item.record ? item.record.name.trim() || t(item.record.kind) : t('Other expense'), value);
 }
 const named = topShares(shares(totals), 9).map(item => ({ name: item.key === otherShareKey ? t('Other') : item.key, value: item.amount }));
 const side: DrillNode['kind'] = target.side;
 if (target.side === 'income') {
  const nodes: DrillNode[] = [...named.map(item => ({ name: item.name, kind: side })), { name: title, kind: side }];
  return { nodes, links: named.map((item, index) => ({ source: index, target: named.length, value: item.value })), missing };
 }
 const nodes: DrillNode[] = [{ name: title, kind: side }, ...named.map(item => ({ name: item.name, kind: side }))];
 return { nodes, links: named.map((item, index) => ({ source: 0, target: index + 1, value: item.value })), missing };
}

type Mover = (key: string, amount: number, currency: string | null | undefined) => boolean;
type Activity = NonNullable<PlanningData['activity']>[number];
/** One account operation: a transfer between accounts, a loan repayment, or a mortgage payment's principal (its interest
 * is spending, counted with the transactions). Reconciliations are corrections, not flows, and stay out. */
function moveActivity(row: Activity, byId: Map<string, Entry>, move: Mover) {
 if (!row.target_id) return;
 const source = byId.get(row.account_id)?.currency;
 if (row.action === 'transfer') { if (move(row.account_id, -Number(row.amount), source)) move(row.target_id, Number(row.received), byId.get(row.target_id)?.currency); }
 else if (row.action === 'repayment') { if (move(row.account_id, -Number(row.amount), source)) move(row.target_id, Number(row.amount), source); }
 else if (row.action === 'mortgage') {
  const payment = byId.get(row.id), principal = payment ? transferAmount(payment) : 0;
  if (move(row.account_id, -principal, payment?.currency)) move(row.target_id, principal, payment?.currency);
 }
}

/** Cash moved from an account into a holding (a buy) or back out of it (a sale). Tracker expenses are spending. */
function moveInvestment(link: NonNullable<PlanningData['investmentLinks']>[number], from: string, to: string, byId: Map<string, Entry>, move: Mover) {
 const event = link.investment_history;
 if (!event?.record_id || event.event_type === 'expense' || event.occurred_on < from || event.occurred_on > to) return;
 const unit = link.account_currency ?? byId.get(link.account_id)?.currency;
 if (move(link.account_id, Number(link.amount), unit)) move(event.record_id, -Number(link.amount), unit);
}

/** How each account, holding and debt changed in the period, in `currency`: income in and spending out by the account it
 * was recorded against ('' when none), account operations, and cash moved into or out of investments. */
export function accountChanges(context: DrillContext) {
 const { data, splits, months, currency, today, rates } = context, { from, to } = span(months, today);
 const records = data.records as Entry[], byId = new Map(records.map(record => [record.id, record]));
 const changes = new Map<string, number>();
 let missing = 0;
 const move: Mover = (key, amount, unit) => {
  if (!amount) return true;
  const value = unit ? convertAmount(amount, unit, currency, rates) : null;
  if (value === null || value === undefined) { missing += 1; return false; }
  add(changes, key, value);
  return true;
 };
 const activityAccount = new Map((data.activity ?? []).map(row => [row.id, row.account_id]));
 for (const item of cashFlowItems(records, from, to, { splits, investmentLinks: data.investmentLinks })) {
  const account = item.record ? item.record.account_id ?? activityAccount.get(item.record.id) : item.link?.account_id;
  move(account ?? '', item.income ? item.amount : -item.amount, item.currency);
 }
 for (const row of data.activity ?? []) if (row.occurred_on >= from && row.occurred_on <= to) moveActivity(row, byId, move);
 for (const link of data.investmentLinks ?? []) moveInvestment(link, from, to, byId, move);
 return { changes, missing };
}

/** Where the period's savings went: the accounts and holdings that grew and the debts paid down, fed by the savings and by
 * any account that shrank. What the records cannot explain (transfer fees, exchange differences, a flow in a currency
 * without a rate) is shown as "Not traced", never spread over the accounts. */
function savingsFlows(savings: number, context: DrillContext): DrillFlows {
 const { data, t } = context, byId = new Map((data.records as Entry[]).map(record => [record.id, record]));
 const { changes, missing } = accountChanges(context);
 const node = (key: string): DrillNode => {
  const record = byId.get(key);
  return !key ? { name: t('No account'), kind: 'untraced' } : { name: record?.name.trim() || t(record?.kind ?? 'Other'), kind: record && liabilities.includes(record.kind) ? 'debt' : 'account' };
 };
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

/** The second Sankey behind a tap on the first: a category by payer or merchant, or where the savings went. */
export function drillFlows(target: DrillTarget, title: string, savings: number, context: DrillContext): DrillFlows {
 return target.side === 'savings' ? savingsFlows(savings, context) : categoryFlows(target, title, context);
}
