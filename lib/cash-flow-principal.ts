import { accountNode, categoryNode, span } from './cash-flow-drill';
import type { DrillContext, DrillFlows, DrillNode } from './cash-flow-drill-types';
import { accountOperations } from './cash-flow-operations';
import type { Entry } from './finance';
import { formatDate } from './format';
import { convertAmount } from './market';
import { spendingAmount, transferAmount } from './spending';

/** One payment towards a debt's principal: a loan repayment (an account operation) or a mortgage payment's principal
 * (its transaction, `record`), in its own currency, with the account that paid it. */
export type PrincipalPayment = { id: string; date: string; account: string; principal: { amount: number; currency: string }; record: Entry | null };

/** The mortgage payments to `debt` in the period, with their transactions and the accounts that paid them. */
function mortgagePayments(debt: string, context: DrillContext) {
 const { from, to } = span(context.months, context.today);
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 return (context.data.activity ?? []).flatMap(row => {
  const record = byId.get(row.id);
  return row.action === 'mortgage' && row.target_id === debt && row.occurred_on >= from && row.occurred_on <= to && record ? [{ id: row.id, date: row.occurred_on, account: row.account_id, record }] : [];
 }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** The mortgage payments' transactions, newest first: what an interest Sankey lists. */
export const mortgageTransactions = (debt: string, context: DrillContext) => mortgagePayments(debt, context).map(payment => payment.record);

/** The payments that paid down `debt` in the period, newest first. */
export function principalPayments(debt: string, context: DrillContext): PrincipalPayment[] {
 const repayments = accountOperations(debt, context).filter(row => row.kind === 'repayment' && row.target_id === debt)
  .map(row => ({ id: row.id, date: row.date, account: row.source_id, principal: row.received, record: null }));
 const mortgage = mortgagePayments(debt, context).map(payment => ({ ...payment, principal: { amount: transferAmount(payment.record), currency: payment.record.currency } }));
 return [...repayments, ...mortgage].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** Each payment, by its day and the account that paid it, flowing into the debt's principal. A mortgage payment opens its
 * own Sankey (`paymentFlows`); a repayment opens as a transfer. A payment without a rate is missing, never drawn. */
export function principalFlows(debt: string, context: DrillContext): DrillFlows {
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 const paid: Array<{ node: DrillNode; value: number }> = [];
 let missing = 0;
 for (const payment of principalPayments(debt, context)) {
  const value = convertAmount(payment.principal.amount, payment.principal.currency, context.currency, context.rates);
  if (value === null || value === undefined) { missing += 1; continue; }
  if (value <= 0) continue;
  const from = accountNode(payment.account, byId, context.t);
  paid.push({ value, node: { name: `${formatDate(payment.date, context.locale ?? 'en-US')} · ${from.name}`, kind: from.kind, open: payment.record ? { side: 'payment', key: payment.id } : { side: 'operation', key: payment.id } } });
 }
 const nodes: DrillNode[] = [...paid.map(item => item.node), { name: context.t('Principal'), kind: 'savings' }];
 return { nodes, links: paid.map((item, index) => ({ source: index, target: paid.length, value: item.value })), missing };
}

/** One mortgage payment, by its id: what it took from the paying account, split into its principal (which opens the
 * mortgage) and its interest (which opens the spending category it counts in), in the display currency. */
export function paymentFlows(id: string, context: DrillContext): DrillFlows {
 const row = (context.data.activity ?? []).find(item => item.id === id && item.action === 'mortgage');
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 const payment = byId.get(id);
 if (!row?.target_id || !payment) return { nodes: [], links: [], missing: 0 };
 const convert = (amount: number) => convertAmount(amount, payment.currency, context.currency, context.rates);
 const principal = convert(transferAmount(payment)), interest = convert(spendingAmount(payment));
 if (principal === null || principal === undefined || interest === null || interest === undefined) return { nodes: [], links: [], missing: 1 };
 const debt = byId.get(row.target_id);
 const principalNode: DrillNode = { name: context.t('Principal'), kind: 'savings', open: debt ? { side: 'account', key: row.target_id } : undefined };
 // The interest opens the mortgage's interest for the period.
 const interestNode: DrillNode = { name: context.t('Interest'), kind: 'expense', open: { side: 'interest', key: row.target_id } };
 const parts: Array<{ node: DrillNode; value: number }> = [
  { node: principalNode, value: principal },
  { node: interestNode, value: interest },
 ].filter(part => part.value > 0);
 const nodes: DrillNode[] = [accountNode(row.account_id, byId, context.t), { name: payment.name.trim() || context.t('Mortgage payment'), kind: 'debt' }, ...parts.map(part => part.node)];
 return { nodes, links: [{ source: 0, target: 1, value: principal + interest }, ...parts.map((part, index) => ({ source: 1, target: 2 + index, value: part.value }))], missing: 0 };
}

/** One mortgage's interest in the period: each payment's interest, by its day and the account that paid it, flowing into
 * one total. A payment opens its own Sankey; the total opens the spending category the interest counts in, when the
 * payments share one. A payment without a rate is missing, never drawn. */
export function interestFlows(debt: string, context: DrillContext): DrillFlows {
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 const paid: Array<{ node: DrillNode; value: number }> = [], categories = new Set<string>();
 let missing = 0;
 for (const payment of mortgagePayments(debt, context)) {
  const value = convertAmount(spendingAmount(payment.record), payment.record.currency, context.currency, context.rates);
  if (value === null || value === undefined) { missing += 1; continue; }
  if (value <= 0) continue;
  categories.add(payment.record.custom_category_id ?? payment.record.kind);
  const from = accountNode(payment.account, byId, context.t);
  paid.push({ value, node: { name: `${formatDate(payment.date, context.locale ?? 'en-US')} · ${from.name}`, kind: from.kind, open: { side: 'payment', key: payment.id } } });
 }
 const [category] = categories;
 const total: DrillNode = { name: context.t('Interest'), kind: 'expense', open: categories.size === 1 ? categoryNode(category, false, context).open : undefined };
 return { nodes: [...paid.map(item => item.node), total], links: paid.map((item, index) => ({ source: index, target: paid.length, value: item.value })), missing };
}
