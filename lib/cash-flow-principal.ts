import { accountNode, span } from './cash-flow-drill';
import type { DrillContext, DrillFlows, DrillNode } from './cash-flow-drill-types';
import { accountOperations } from './cash-flow-operations';
import type { Entry } from './finance';
import { formatDate } from './format';
import { convertAmount } from './market';
import { transferAmount } from './spending';

/** One payment towards a debt's principal: a loan repayment (an account operation) or a mortgage payment's principal
 * (its transaction, `record`), in its own currency, with the account that paid it. */
export type PrincipalPayment = { id: string; date: string; account: string; principal: { amount: number; currency: string }; record: Entry | null };

/** The payments that paid down `debt` in the period, newest first. */
export function principalPayments(debt: string, context: DrillContext): PrincipalPayment[] {
 const { from, to } = span(context.months, context.today);
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 const repayments = accountOperations(debt, context).filter(row => row.kind === 'repayment' && row.target_id === debt)
  .map(row => ({ id: row.id, date: row.date, account: row.source_id, principal: row.received, record: null }));
 const mortgage = (context.data.activity ?? []).flatMap((row): PrincipalPayment[] => {
  const record = byId.get(row.id);
  return row.action === 'mortgage' && row.target_id === debt && row.occurred_on >= from && row.occurred_on <= to && record ? [{ id: row.id, date: row.occurred_on, account: row.account_id, principal: { amount: transferAmount(record), currency: record.currency }, record }] : [];
 });
 return [...repayments, ...mortgage].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** Each payment, by its day and the account that paid it, flowing into the debt's principal. A mortgage payment opens its
 * transaction's details; a repayment opens as a transfer. A payment without a rate is missing, never drawn. */
export function principalFlows(debt: string, context: DrillContext): DrillFlows {
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 const paid: Array<{ node: DrillNode; value: number }> = [];
 let missing = 0;
 for (const payment of principalPayments(debt, context)) {
  const value = convertAmount(payment.principal.amount, payment.principal.currency, context.currency, context.rates);
  if (value === null || value === undefined) { missing += 1; continue; }
  if (value <= 0) continue;
  const from = accountNode(payment.account, byId, context.t);
  paid.push({ value, node: { name: `${formatDate(payment.date, context.locale ?? 'en-US')} · ${from.name}`, kind: from.kind, open: payment.record ? { side: 'record', key: payment.id } : { side: 'operation', key: payment.id } } });
 }
 const nodes: DrillNode[] = [...paid.map(item => item.node), { name: context.t('Principal'), kind: 'savings' }];
 return { nodes, links: paid.map((item, index) => ({ source: index, target: paid.length, value: item.value })), missing };
}
