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
 /** Income or spending in some categories (`keys`), by category or by payer or merchant, less the members in `skip`
  * (`lib/cash-flow-group.ts`). */
 | { side: 'group'; income: boolean; keys: string[]; by: 'category' | 'merchant'; skip?: string[] }
 /** Where one account or holding stands at the period's end: its opening balance (or purchase cost) and the period's
  * change, then its goals and what is available, or its value and gain (`lib/cash-flow-balance.ts`). */
 | { side: 'balance'; key: string }
 /** The period's income and spending, as on the main chart (`lib/cash-flow-main.ts`). */
 | { side: 'cashflow' }
 /** The fees and exchange differences of transfers, of one account (`key`) or all (`lib/cash-flow-untraced.ts`). */
 | { side: 'untraced'; key?: string }
 /** A page of the app: the dialog closes and the page opens. */
 | { side: 'link'; href: string }
 /** One transaction by its id: it opens the shared transaction details rather than a Sankey. */
 | { side: 'record'; key: string };
/** A node of a drill-down Sankey; `open` is what a tap on it opens next. */
export type DrillNode = { name: string; kind: 'income' | 'expense' | 'savings' | 'account' | 'holding' | 'debt' | 'untraced'; open?: DrillTarget };
export type DrillFlows = { nodes: DrillNode[]; links: Array<{ source: number; target: number; value: number }>; missing: number };
type Rates = number | Record<string, number> | undefined;
/** `label` names a category key (an added category's id or a built-in kind); `locale` writes the dates of payments. */
/** `throughToday` is false when the data stops before today, so an account's balance at the period's end cannot be told. */
export type DrillContext = { throughToday?: boolean; data: Pick<PlanningData, 'records' | 'activity' | 'investmentLinks' | 'movements'> & Partial<Pick<PlanningData, 'goals' | 'categories'>>; splits: TransactionSplit[]; months: string[]; currency: string; today: string; rates: Rates; t: (key: string) => string; label?: (key: string) => string; locale?: string };
