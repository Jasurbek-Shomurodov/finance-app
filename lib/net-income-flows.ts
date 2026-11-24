import type { BusinessSankey, Drill, LedgerLine, SankeyNode } from './business-report';
import type { DrillScope } from './cash-flow-drill-types';
import type { SavingsEnd } from './cash-flow-drill';

/** A report narrowed to some lines (a business, a person, a whole part-owned business): only they count in a drill-down. */
export function lineScope(own: ReadonlyArray<Pick<LedgerLine, 'id' | 'record'>>, whole: boolean): DrillScope {
 const records = new Set(own.map(line => line.record?.id)), loose = new Set(own.filter(line => !line.record).map(line => line.id));
 return { keep: (record, id) => record ? records.has(record.id) : loose.has(id), whole };
}

export type NetIncomeEnds = { left: SavingsEnd[]; right: SavingsEnd[] };
type Labels = { /** A debt paid down: "Home loan: Principal". */ principal: (name: string) => string; other: string; /** The node that stands in for Net income when spending was above income. */ accounts: string };

/** The largest `limit` ends, the rest as one "Other". */
function top(ends: readonly SavingsEnd[], other: string, limit: number): SavingsEnd[] {
 if (ends.length <= limit) return [...ends];
 return [...ends.slice(0, limit - 1), { node: { name: other, kind: 'untraced' }, value: ends.slice(limit - 1).reduce((sum, end) => sum + end.value, 0) }];
}

/** The Reports flow with Net income opened up: after the household's Net income comes where that money went (accounts
 * that grew, crypto, a car or another holding bought, loan and mortgage principal paid), and any account drawn down in
 * the period feeds it from the left. When spending was above income there is no Net income: the accounts drawn down
 * then cover the shortfall through one node and still show what they bought or paid off. An end opens its own Sankey;
 * one that only leads to a page (a narrowed report) opens where the net income went instead. */
export function netIncomeFlows(sankey: BusinessSankey, net: number, ends: NetIncomeEnds, labels: Labels, limit = 7): BusinessSankey {
 const total = sankey.nodes.findIndex(node => node.kind === 'total'), kept = sankey.nodes.findIndex(node => node.kind === 'savings' && node.owner === null);
 if (total < 0 || (kept < 0 && net >= .5) || (!ends.left.length && !ends.right.length)) return sankey;
 const whole: Drill | null = kept < 0 ? null : sankey.nodes[kept].drill;
 const asNode = (end: SavingsEnd, paid: boolean): SankeyNode => ({ name: paid && end.node.kind === 'debt' ? labels.principal(end.node.name) : end.node.name, kind: end.node.kind as SankeyNode['kind'], owner: null,
  drill: end.node.open && end.node.open.side !== 'link' ? { open: { target: end.node.open, title: end.node.name } } : whole });
 const left = top(ends.left, labels.other, limit), right = top(ends.right, labels.other, limit);
 // Where it went sits right under Net income, so its flows fan out without crossing the spending below.
 const head = kept < 0 ? sankey.nodes : sankey.nodes.slice(0, kept + 1), tail = kept < 0 ? [] : sankey.nodes.slice(kept + 1);
 const hubNode: SankeyNode[] = kept < 0 ? [{ name: labels.accounts, kind: 'account', drill: null, owner: null }] : [];
 const nodes = [...head, ...hubNode, ...right.map(end => asNode(end, true)), ...tail, ...left.map(end => asNode(end, false))];
 const hub = kept < 0 ? head.length : kept, firstRight = hub + 1, firstLeft = firstRight + right.length + tail.length;
 const moved = (index: number) => kept >= 0 && index > kept ? index + right.length : index;
 const links = [...sankey.links.map(link => ({ source: moved(link.source), target: moved(link.target), value: link.value })),
  ...right.map((end, index) => ({ source: hub, target: firstRight + index, value: end.value })),
  ...left.map((end, index) => ({ source: firstLeft + index, target: hub, value: end.value })),
  // Spending above income: the accounts covered it.
  ...(kept < 0 && net <= -.5 ? [{ source: hub, target: moved(total), value: -net }] : [])];
 return { nodes, links };
}
