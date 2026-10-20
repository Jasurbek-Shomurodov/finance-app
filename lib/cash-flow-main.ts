import type { DrillContext, DrillFlows, DrillNode, DrillTarget } from './cash-flow-drill-types';
import { cashFlowReport, sankeyFlows, type SankeyData } from './cash-flow-report';
import type { Entry } from './finance';

/** What a node of the main Cash flow Sankey opens: a category, Savings, a merged "Other" (its categories) or the Income
 * total (every income source). */
export function mainTarget(node: SankeyData['nodes'][number] | undefined): DrillTarget | null {
 if (!node) return null;
 if (node.kind === 'savings') return { side: 'savings' };
 if (node.kind === 'total') return node.keys?.length ? { side: 'group', income: true, keys: node.keys, by: 'merchant' } : null;
 if (node.key) return { side: node.kind === 'income' ? 'income' : 'expense', key: node.key };
 return node.keys?.length ? { side: 'group', income: node.kind === 'income', keys: node.keys, by: 'category' } : null;
}

/** The period's income and spending as on the main chart, for the Cash flow node of the Savings Sankey: every node opens
 * what it opens there. */
export function mainFlows(context: DrillContext): DrillFlows {
 const data = { records: context.data.records as Entry[], activity: context.data.activity ?? [], investmentLinks: context.data.investmentLinks ?? [], categories: context.data.categories ?? [] };
 const report = cashFlowReport(data, context.splits, context.months, context.currency, context.today, context.rates);
 const flows = sankeyFlows(report, context.label ?? context.t);
 const kinds: Record<SankeyData['nodes'][number]['kind'], DrillNode['kind']> = { income: 'income', total: 'account', expense: 'expense', savings: 'savings' };
 return { nodes: flows.nodes.map(node => ({ name: node.name, kind: kinds[node.kind], open: mainTarget(node) ?? undefined })), links: flows.links, missing: report.missing };
}
