import { periodFlows, type Flow } from './cash-flow-drill';
import { accountNode } from './cash-flow-drill-base';
import type { DrillContext, DrillFlows, DrillNode, DrillTarget } from './cash-flow-drill-types';

type End = Flow['from'];
const keyOf = (end: End) => 'account' in end ? 'a:' + end.account : 'income' in end ? 'i:' + end.income : 'expense' in end ? 'e:' + end.expense : 'u';

/** A holding account (a brokerage, a crypto wallet) in the period: the money that came into its holdings, by where it came
 * from, flowing through the account to each holding; a sale flows back out. Money moved between its own holdings changes
 * each of them but not what came in. Each holding and each source opens its own Sankey. */
export function holdingsFlows(target: Extract<DrillTarget, { side: 'holdings' }>, title: string, context: DrillContext): DrillFlows {
 const { t } = context, inside = new Set(target.keys);
 const { flows, missing, byId } = periodFlows(context);
 const holdings = new Map<string, number>(), sources = new Map<string, { end: End; value: number }>();
 const add = (end: End, value: number) => { const id = keyOf(end), part = sources.get(id) ?? { end, value: 0 }; part.value += value; sources.set(id, part); };
 for (const flow of flows) {
  const into = 'account' in flow.to && inside.has(flow.to.account), out = 'account' in flow.from && inside.has(flow.from.account);
  // A move between its own holdings changes each of them, not what came in.
  if (into && out && 'account' in flow.to && 'account' in flow.from) { holdings.set(flow.to.account, (holdings.get(flow.to.account) ?? 0) + flow.value); holdings.set(flow.from.account, (holdings.get(flow.from.account) ?? 0) - flow.value); continue; }
  if (!into && !out) continue;
  if (into && 'account' in flow.to) { holdings.set(flow.to.account, (holdings.get(flow.to.account) ?? 0) + flow.value); add(flow.from, flow.value); }
  else if ('account' in flow.from) { holdings.set(flow.from.account, (holdings.get(flow.from.account) ?? 0) - flow.value); add(flow.to, -flow.value); }
 }
 const node = (end: End): DrillNode => 'account' in end ? accountNode(end.account, byId, t) : { name: t('Not traced'), kind: 'untraced', open: { side: 'untraced' } };
 const parts = (list: Array<{ node: DrillNode; value: number }>, sign: 1 | -1) => list.filter(part => part.value * sign >= .5).map(part => ({ node: part.node, value: part.value * sign })).sort((a, b) => b.value - a.value);
 const fromSources = [...sources.values()].map(part => ({ node: node(part.end), value: part.value })), toHoldings = [...holdings].map(([key, value]) => ({ node: accountNode(key, byId, t), value }));
 // Money in: its sources on the left, the holdings it bought on the right. A sale: the holding on the left, where it went on the right.
 const left = [...parts(fromSources, 1), ...parts(toHoldings, -1)], right = [...parts(toHoldings, 1), ...parts(fromSources, -1)];
 const hub: DrillNode = { name: title, kind: 'holding', open: { side: 'link', href: '/accounts' } };
 return {
  nodes: [...left.map(part => part.node), hub, ...right.map(part => part.node)],
  links: [...left.map((part, index) => ({ source: index, target: left.length, value: part.value })), ...right.map((part, index) => ({ source: left.length, target: left.length + 1 + index, value: part.value }))],
  missing,
 };
}
