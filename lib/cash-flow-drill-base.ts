import { monthEnd } from './calendar-days';
import type { DrillContext, DrillNode } from './cash-flow-drill-types';
import type { Share } from './cash-flow-report';
import { assets, liabilities, type Entry } from './finance';
import type { CashFlowItem } from './spending';

/** Helpers every Cash flow drill-down view shares (`cash-flow-drill`, `cash-flow-group`, `cash-flow-principal`…). */
export const add = (totals: Map<string, number>, key: string, amount: number) => totals.set(key, (totals.get(key) ?? 0) + amount);
export const shares = (totals: Map<string, number>): Share[] => [...totals].filter(([, amount]) => amount > 0).map(([key, amount]) => ({ key, amount, share: 0 })).sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key));
/** The period's first day and its last day so far. */
export function span(months: string[], today: string) {
 const last = months.at(-1) ?? today.slice(0, 7), end = monthEnd(last);
 return { from: (months[0] ?? last) + '-01', to: today < end ? today : end };
}

export type Item = CashFlowItem<Entry>;
/** The payer or merchant a transaction is grouped under: its name, else its category; a Tracker expense has neither. */
export const merchantOf = (item: Item, t: (key: string) => string) => item.record ? item.record.name.trim() || t(item.record.kind) : t('Other expense');
/** The account a transaction was recorded against, or the account of the operation that made it; '' for none. */
export const accountOf = (item: Item, activityAccount: Map<string, string>) => (item.record ? item.record.account_id ?? activityAccount.get(item.record.id) : item.link?.account_id) ?? '';
/** A category node; a tap on it opens that category's Sankey. */
export const categoryNode = (key: string, income: boolean, context: DrillContext): DrillNode => ({ name: (context.label ?? context.t)(key), kind: income ? 'income' : 'expense', open: { side: income ? 'income' : 'expense', key } });

/** Where money is kept to spend: cash and deposits. Any other asset is a holding (stocks, crypto, bonds, property…). */
const balanceKinds = new Set(['Cash', 'Deposit']);
const nodeKind = (record: Entry | undefined): DrillNode['kind'] => !record ? 'account' : liabilities.includes(record.kind) ? 'debt' : assets.includes(record.kind) && !balanceKinds.has(record.kind) ? 'holding' : 'account';
/** The node for an account, holding or debt; a tap on it opens that account's own Sankey. */
export function accountNode(key: string, byId: Map<string, Entry>, t: (key: string) => string): DrillNode {
 // Transactions recorded against no account open together, as if they were one.
 if (!key) return { name: t('No account'), kind: 'untraced', open: { side: 'account', key } };
 const record = byId.get(key);
 return { name: record?.name.trim() || t(record?.kind ?? 'Other'), kind: nodeKind(record), open: { side: 'account', key } };
}
