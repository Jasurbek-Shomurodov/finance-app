import { accountNode, span, type DrillContext, type DrillFlows } from './cash-flow-drill';
import type { Entry } from './finance';
import { convertAmount } from './market';
import type { PlanningData } from './planning';

/** Money moved between two accounts, as a person opens it from an account's Sankey: a transfer, buy or sale recorded on
 * Accounts (`asset_movements`), or an older transfer or loan repayment (`account_activity`). `sent` and `received` are
 * money in each side's own currency, also for a holding (whose movement quantities stay on Accounts). */
export type Operation = { id: string; kind: 'transfer' | 'repayment' | 'buy' | 'sell'; source_id: string; target_id: string; date: string; sent: { amount: number; currency: string }; received: { amount: number; currency: string }; fee: number; notes: string };
type Activity = NonNullable<PlanningData['activity']>[number];
type Movement = NonNullable<PlanningData['movements']>[number];

/** Every operation of the workspace in this form. A mortgage payment is listed as its own transaction, a reconciliation is
 * a correction rather than money moving, and capitalized interest stays in one account; none of them is listed. */
function operations(context: DrillContext): Operation[] {
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 const currencyOf = (id: string) => byId.get(id)?.currency ?? context.currency;
 const activity = (context.data.activity ?? []).flatMap((row: Activity): Operation[] => row.target_id && (row.action === 'transfer' || row.action === 'repayment') ? [{
  id: row.id, kind: row.action, source_id: row.account_id, target_id: row.target_id, date: row.occurred_on, fee: Number(row.fee) || 0, notes: row.notes ?? '',
  sent: { amount: Number(row.amount), currency: currencyOf(row.account_id) },
  // A repayment reaches its loan as sent; a transfer arrives as `received`, in the target's currency.
  received: row.action === 'transfer' ? { amount: Number(row.received || row.amount), currency: currencyOf(row.target_id) } : { amount: Number(row.amount), currency: currencyOf(row.account_id) },
 }] : []);
 const movements = (context.data.movements ?? []).flatMap((row: Movement): Operation[] => row.kind === 'interest' ? [] : [{
  id: row.id, kind: row.kind, source_id: row.source_id, target_id: row.target_id, date: row.occurred_on, fee: Number(row.fee) || 0, notes: row.notes ?? '',
  sent: { amount: Number(row.source_value), currency: currencyOf(row.source_id) }, received: { amount: Number(row.target_value), currency: currencyOf(row.target_id) },
 }]);
 return [...activity, ...movements];
}

/** The operations into or out of an account in the period, newest first. */
export function accountOperations(key: string, context: DrillContext): Operation[] {
 const { from, to } = span(context.months, context.today);
 return operations(context).filter(row => row.date >= from && row.date <= to && (row.source_id === key || row.target_id === key))
  .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** One operation by its id, with its two accounts. */
export function operationDetails(id: string, context: DrillContext) {
 const row = operations(context).find(item => item.id === id);
 if (!row) return null;
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 return { row, source: byId.get(row.source_id), target: byId.get(row.target_id) };
}

/** The operation as a two-node Sankey, source to target, in the display currency; both ends open their accounts. */
export function operationFlows(id: string, context: DrillContext): DrillFlows {
 const details = operationDetails(id, context);
 if (!details) return { nodes: [], links: [], missing: 0 };
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 const value = convertAmount(details.row.sent.amount, details.row.sent.currency, context.currency, context.rates);
 const nodes = [accountNode(details.row.source_id, byId, context.t), accountNode(details.row.target_id, byId, context.t)];
 return value === null || value === undefined ? { nodes, links: [], missing: 1 } : { nodes, links: [{ source: 0, target: 1, value }], missing: 0 };
}
