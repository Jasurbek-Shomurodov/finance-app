import { add, categoryNode, span } from './cash-flow-drill-base';
import type { DrillContext, DrillFlows, DrillNode, DrillTarget } from './cash-flow-drill-types';
import type { Entry } from './finance';
import { convertAmount } from './market';
import { cashFlowItems } from './spending';
import { ratesOf } from './transaction-rates';

export type SetTarget = Extract<DrillTarget, { side: 'set' }>;
/** Whether a transaction belongs to the set: a business's by its `business_id`, a tag's by the ids it labels. */
const member = (target: SetTarget) => { const ids = new Set(target.ids ?? []); return (record: Entry) => target.of === 'business' ? record.business_id === target.key : ids.has(record.id); };
/** Where a business or tag is looked at in full: a business's profit and loss, a tag's transactions. */
const pageOf = (target: SetTarget): DrillTarget => ({ side: 'link', href: target.of === 'business' ? `/reports?tab=cash_flow&business=${encodeURIComponent(target.key)}&view=pnl` : `/transactions?tag=${encodeURIComponent(target.key)}` });

/** A business's or a tag's transactions in the period, as a Sankey in the display currency: its income by category flows
 * into it, its spending by category out of it, and what is left (or missing) is its net. Each category opens its own
 * Sankey; the business or tag and its net open where it is looked at in full. */
export function setFlows(target: SetTarget, title: string, context: DrillContext): DrillFlows {
 const { data, splits, months, today, currency, rates, t } = context, { from, to } = span(months, today), inSet = member(target);
 const incoming = new Map<string, number>(), outgoing = new Map<string, number>();
 let missing = 0;
 for (const item of cashFlowItems(data.records as Entry[], from, to, { splits, investmentLinks: data.investmentLinks })) {
  if (!item.record || !inSet(item.record)) continue;
  const parts = item.income ? [{ category: item.record.custom_category_id ?? item.record.kind, amount: item.amount }] : item.parts;
  for (const part of parts) {
   const value = item.currency ? convertAmount(part.amount, item.currency, currency, ratesOf(item.dated, rates)) ?? null : null;
   if (value === null) { missing += 1; continue; }
   add(item.income ? incoming : outgoing, part.category, value);
  }
 }
 const sorted = (totals: Map<string, number>, income: boolean) => [...totals].filter(([, value]) => value >= .5).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ node: categoryNode(key, income, context), value }));
 const left = sorted(incoming, true), right = sorted(outgoing, false);
 const net = left.reduce((sum, part) => sum + part.value, 0) - right.reduce((sum, part) => sum + part.value, 0), page = pageOf(target);
 if (net >= .5) right.push({ node: { name: t('Net'), kind: 'savings', open: page }, value: net });
 if (net <= -.5) left.push({ node: { name: t('Net'), kind: 'expense', open: page }, value: -net });
 const hub: DrillNode = { name: title, kind: 'account', open: page };
 return {
  nodes: [...left.map(part => part.node), hub, ...right.map(part => part.node)],
  links: [...left.map((part, index) => ({ source: index, target: left.length, value: part.value })), ...right.map((part, index) => ({ source: left.length, target: left.length + 1 + index, value: part.value }))],
  missing,
 };
}

/** The set's transactions in the period, newest first: the ones its Sankey counts, each once. */
export function setTransactions(target: SetTarget, context: DrillContext): Entry[] {
 const { data, splits, months, today } = context, { from, to } = span(months, today), inSet = member(target);
 const found: Entry[] = [];
 for (const item of cashFlowItems(data.records as Entry[], from, to, { splits, investmentLinks: data.investmentLinks })) if (item.record && inSet(item.record)) found.push(item.record);
 return found.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
