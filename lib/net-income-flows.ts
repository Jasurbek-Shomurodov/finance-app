import type { BusinessSankey, Drill, LedgerLine, SankeyNode } from './business-report';
import type { DrillScope } from './cash-flow-drill-types';
import type { SavingsEnd } from './cash-flow-drill';

/** A report narrowed to some lines (a business, a person, a whole part-owned business): only they count in a drill-down. */
export function lineScope(own: ReadonlyArray<Pick<LedgerLine, 'id' | 'record'>>, whole: boolean): DrillScope {
 const records = new Set(own.map(line => line.record?.id)), loose = new Set(own.filter(line => !line.record).map(line => line.id));
 return { keep: (record, id) => record ? records.has(record.id) : loose.has(id), whole };
}

export type NetIncomeEnds = { left: SavingsEnd[]; right: SavingsEnd[] };
type Labels = { /** A debt paid down: "Home loan: Principal". */ principal: (name: string) => string; other: string };

/** The largest `limit` ends, the rest as one "Other". */
function top(ends: readonly SavingsEnd[], other: string, limit: number): SavingsEnd[] {
 if (ends.length <= limit) return [...ends];
 return [...ends.slice(0, limit - 1), { node: { name: other, kind: 'untraced' }, value: ends.slice(limit - 1).reduce((sum, end) => sum + end.value, 0) }];
}

/** The Reports flow with everything the money did: income on the left, and on the right, beside spending, where the
 * rest went instead of one "Net income" (accounts it stayed in, crypto, a car or another holding bought, money lent,
 * loan and mortgage principal paid). An account drawn down in the period is a source on the left beside the income, so
 * every flow runs left to right through the one total. An end opens its own Sankey; one that only leads to a page
 * (a narrowed report) opens where the net income went instead. */
export function netIncomeFlows(sankey: BusinessSankey, ends: NetIncomeEnds, labels: Labels, limit = 7): BusinessSankey {
 const total = sankey.nodes.findIndex(node => node.kind === 'total'), kept = sankey.nodes.findIndex(node => node.kind === 'savings' && node.owner === null);
 if (total < 0 || (!ends.left.length && !ends.right.length)) return sankey;
 const whole: Drill | null = kept < 0 ? null : sankey.nodes[kept].drill;
 const asNode = (end: SavingsEnd, paid: boolean): SankeyNode => ({ name: paid && end.node.kind === 'debt' ? labels.principal(end.node.name) : end.node.name, kind: end.node.kind as SankeyNode['kind'], owner: null,
  drill: end.node.open && end.node.open.side !== 'link' ? { open: { target: end.node.open, title: end.node.name } } : whole });
 const left = top(ends.left, labels.other, limit), right = top(ends.right, labels.other, limit);
 // Where the rest went takes Net income's place among the spending; the accounts drawn down go last, under the income.
 const at = kept < 0 ? sankey.nodes.length : kept, after = kept < 0 ? at : kept + 1;
 const nodes = [...sankey.nodes.slice(0, at), ...right.map(end => asNode(end, true)), ...sankey.nodes.slice(after), ...left.map(end => asNode(end, false))];
 const moved = (index: number) => index >= after ? index + right.length - (after - at) : index;
 const firstLeft = at + right.length + sankey.nodes.length - after;
 const links = [...sankey.links.filter(link => kept < 0 || (link.source !== kept && link.target !== kept)).map(link => ({ source: moved(link.source), target: moved(link.target), value: link.value })),
  ...right.map((end, index) => ({ source: moved(total), target: at + index, value: end.value })),
  ...left.map((end, index) => ({ source: firstLeft + index, target: moved(total), value: end.value }))];
 return { nodes, links };
}
