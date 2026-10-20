import { add, categoryNode, merchantOf, shares, span, type Item } from './cash-flow-drill-base';
import type { DrillContext, DrillFlows, DrillNode, DrillTarget } from './cash-flow-drill-types';
import { otherShareKey, topShares } from './cash-flow-report';
import type { Entry } from './finance';
import { convertAmount } from './market';
import { cashFlowItems } from './spending';

/** Income or spending in some categories, shown by category or by payer or merchant. One category by merchant is a
 * category's Sankey; several by category is the main chart's merged "Other"; all income by payer is its Income total. */
export type Group = Extract<DrillTarget, { side: 'group' }>;
/** A category tapped on the main chart, as a group of one shown by its payers or merchants. */
export const categoryGroup = (target: { side: 'income' | 'expense'; key: string }): Group => ({ side: 'group', income: target.side === 'income', keys: [target.key], by: 'merchant' });

/** The parts of a transaction in the group: its categories in `keys`, under the member they are shown by, minus `skip`. */
function members(item: Item, group: Group, context: DrillContext) {
 if (item.income !== group.income) return [];
 const parts = item.income ? [{ category: item.record?.custom_category_id ?? item.record?.kind ?? 'Other income', amount: item.amount }] : item.parts;
 return parts.filter(part => group.keys.includes(part.category)).map(part => ({ member: group.by === 'category' ? part.category : merchantOf(item, context.t), amount: part.amount })).filter(part => !group.skip?.includes(part.member));
}

/** The group's Sankey, from the same transactions Cash flow counts, so its flows add up to the total there: income flows
 * from its members into the group, spending from the group to its members. The nine largest are named, each opening its
 * own Sankey (a category, or a payer or merchant); the rest share "Other", which opens them in turn. */
export function groupFlows(group: Group, title: string, context: DrillContext): DrillFlows {
 const { data, splits, months, currency, today, rates, t } = context, { from, to } = span(months, today);
 const totals = new Map<string, number>();
 let missing = 0;
 for (const item of cashFlowItems(data.records as Entry[], from, to, { splits, investmentLinks: data.investmentLinks })) {
  for (const part of members(item, group, context)) {
   const value = item.currency ? convertAmount(part.amount, item.currency, currency, rates) ?? null : null;
   if (value === null) { missing += 1; continue; }
   add(totals, part.member, value);
  }
 }
 const top = topShares(shares(totals), 9), shown = top.filter(item => item.key !== otherShareKey).map(item => item.key);
 const kind: DrillNode['kind'] = group.income ? 'income' : 'expense';
 const named = top.map(({ key, amount }): { node: DrillNode; value: number } => ({ value: amount, node: key === otherShareKey ? { name: t('Other'), kind, open: { ...group, skip: [...group.skip ?? [], ...shown] } }
  : group.by === 'category' ? categoryNode(key, group.income, context) : { name: key, kind, open: { side: 'merchant', key, income: group.income } } }));
 const hub: DrillNode = { name: title, kind };
 if (group.income) return { nodes: [...named.map(item => item.node), hub], links: named.map((item, index) => ({ source: index, target: named.length, value: item.value })), missing };
 return { nodes: [hub, ...named.map(item => item.node)], links: named.map((item, index) => ({ source: 0, target: index + 1, value: item.value })), missing };
}

/** The group's transactions in the period, newest first, each listed once however many of its parts are in the group. */
export function groupTransactions(group: Group, context: DrillContext): Entry[] {
 const { data, splits, months, today } = context, { from, to } = span(months, today);
 const found: Entry[] = [];
 for (const item of cashFlowItems(data.records as Entry[], from, to, { splits, investmentLinks: data.investmentLinks })) if (item.record && members(item, group, context).length) found.push(item.record);
 return found.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
