import type { PlanningData } from './planning';
import type { TransactionSplit } from './transaction-tools';

/** What a tap in the Cash flow drill-down opens: one income or spending category, the period's savings, or one account. */
export type DrillTarget = { side: 'income' | 'expense'; key: string } | { side: 'account'; key: string } | { side: 'savings' }
 /** One transfer or loan repayment, by its account operation's id (`lib/cash-flow-operations.ts`). */
 | { side: 'operation'; key: string }
 /** One payer (`income`) or merchant, by the name its transactions carry. */
 | { side: 'merchant'; key: string; income: boolean }
 /** The payments that paid down one debt's principal, by the debt's id (`lib/cash-flow-principal.ts`). */
 | { side: 'principal'; key: string }
 /** The interest one mortgage's payments paid in the period, by the mortgage's id (`lib/cash-flow-principal.ts`). */
 | { side: 'interest'; key: string }
 /** One mortgage payment by its id: the paying account, then its principal and interest (`lib/cash-flow-principal.ts`). */
 | { side: 'payment'; key: string }
 /** One transaction by its id: it opens the shared transaction details rather than a Sankey. */
 | { side: 'record'; key: string };
/** A node of a drill-down Sankey; `open` is what a tap on it opens next. */
export type DrillNode = { name: string; kind: 'income' | 'expense' | 'savings' | 'account' | 'holding' | 'debt' | 'untraced'; open?: DrillTarget };
export type DrillFlows = { nodes: DrillNode[]; links: Array<{ source: number; target: number; value: number }>; missing: number };
type Rates = number | Record<string, number> | undefined;
/** `label` names a category key (an added category's id or a built-in kind); `locale` writes the dates of payments. */
export type DrillContext = { data: Pick<PlanningData, 'records' | 'activity' | 'investmentLinks' | 'movements'>; splits: TransactionSplit[]; months: string[]; currency: string; today: string; rates: Rates; t: (key: string) => string; label?: (key: string) => string; locale?: string };
