import { accountChanges, periodFlows, type Flow } from './cash-flow-drill';
import type { DrillContext, DrillFlows, DrillNode } from './cash-flow-drill-types';
import { operationDetails, type Operation } from './cash-flow-operations';
import { formatDate } from './format';

const titles: Record<Operation['kind'], string> = { transfer: 'Transfer', repayment: 'Repayment', buy: 'Buy holding', sell: 'Sell / convert holding' };
const touches = (flow: Flow, key: string | undefined) => key === undefined || ('account' in flow.from && flow.from.account === key) || ('account' in flow.to && flow.to.account === key);

/** The transfers behind "Not traced", of one account or all, newest first: what left beyond what arrived (a fee, an
 * exchange difference), or arrived beyond what left. */
export function untracedTransfers(key: string | undefined, context: DrillContext) {
 const amounts = new Map<string, number>();
 for (const flow of periodFlows(context).flows) {
  const ref = 'untraced' in flow.to ? flow.to.ref : 'untraced' in flow.from ? flow.from.ref : undefined;
  if (ref && touches(flow, key)) amounts.set(ref, (amounts.get(ref) ?? 0) + flow.value);
 }
 return [...amounts].flatMap(([id, value]) => { const details = operationDetails(id, context); return details ? [{ operation: details.row, value }] : []; })
  .sort((a, b) => b.operation.date.localeCompare(a.operation.date) || a.operation.id.localeCompare(b.operation.id));
}

/** "Not traced" as a Sankey: each transfer's fee or exchange difference, by its day and kind, flowing into it; each opens
 * its transfer. In Savings (no `key`), what no transfer explains (a transaction without a rate, say) is the rest, "Other". */
export function untracedFlows(key: string | undefined, savings: number, context: DrillContext): DrillFlows {
 const { t } = context;
 const total = key === undefined ? Math.abs(savings - [...accountChanges(context).changes.values()].reduce((sum, value) => sum + value, 0)) : null;
 const parts = untracedTransfers(key, context).map(({ operation, value }) => ({ value, node: { name: `${formatDate(operation.date, context.locale ?? 'en-US')} · ${t(titles[operation.kind])}`, kind: 'untraced', open: { side: 'operation', key: operation.id } } as DrillNode }));
 const explained = parts.reduce((sum, part) => sum + part.value, 0);
 if (total !== null && total - explained >= .5) parts.push({ value: total - explained, node: { name: t('Other'), kind: 'untraced', open: { side: 'link', href: '/transactions' } } });
 return { nodes: [...parts.map(part => part.node), { name: t('Not traced'), kind: 'untraced', open: { side: 'link', href: '/accounts' } }], links: parts.map((part, index) => ({ source: index, target: parts.length, value: part.value })), missing: 0 };
}
