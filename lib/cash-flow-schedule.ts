import { accountNode, accountOf, categoryNode } from './cash-flow-drill-base';
import type { DrillContext, DrillFlows, DrillNode, DrillTarget } from './cash-flow-drill-types';
import { income, type Entry } from './finance';
import { convertAmount } from './market';
import type { RecurringItem } from './recurring';
import type { DueItem } from './planning';
import { cashFlowItems } from './spending';
import { ratesOf } from './transaction-rates';

export type ScheduleTarget = Extract<DrillTarget, { side: 'schedule' }>;

/** The payments of one schedule's due date, by id (`occurrence_record_id`, `occurrence_due_on`), newest first: the one
 * link a payment has to its schedule. */
export function schedulePayments(target: ScheduleTarget, context: DrillContext): Entry[] {
 return (context.data.records as Entry[]).filter(record => record.occurrence_record_id === target.key && record.occurrence_due_on === target.date)
  .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

type Part = { node: DrillNode; value: number };
/** One scheduled bill or income on its due date, in the display currency. A bill: the accounts that paid it and what is
 * still due ("Remaining") flow through it to its category. An income: its category flows through it to the accounts it
 * reached and what is still due. The schedule and what is still due open its details (`details`), where it is recorded. */
export function scheduleFlows(target: ScheduleTarget, context: DrillContext): DrillFlows {
 const { t, currency, rates } = context;
 const records = context.data.records as Entry[], byId = new Map(records.map(record => [record.id, record])), schedule = byId.get(target.key);
 const due = convertAmount(target.due.amount, target.due.currency, currency, rates);
 if (!schedule || due === null || due === undefined) return { nodes: [], links: [], missing: schedule ? 1 : 0 };
 const ids = new Set(schedulePayments(target, context).map(record => record.id));
 const activityAccount = new Map((context.data.activity ?? []).map(row => [row.id, row.account_id]));
 const accounts = new Map<string, number>();
 let missing = 0, paid = 0;
 // Payments come through the cash-flow walk, so a payment counts as it does everywhere (a mortgage's interest, a split).
 for (const item of cashFlowItems(records, '0000-01-01', '9999-12-31', { splits: context.splits })) {
  if (!item.record || !ids.has(item.record.id)) continue;
  const value = item.currency ? convertAmount(item.amount, item.currency, currency, ratesOf(item.record, rates)) ?? null : null;
  if (value === null) { missing += 1; continue; }
  const account = accountOf(item, activityAccount);
  accounts.set(account, (accounts.get(account) ?? 0) + value);
  paid += value;
 }
 const details: DrillTarget = { side: 'details' };
 const remaining = target.open ? Math.max(0, due - paid) : 0;
 const income = target.direction === 'income';
 const sides: Part[] = [...[...accounts].sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ node: accountNode(key, byId, t), value })), { node: { name: t('Remaining'), kind: income ? 'income' : 'expense', open: details } as DrillNode, value: remaining }].filter(part => part.value >= .5);
 const category: Part = { node: categoryNode(schedule.custom_category_id ?? schedule.kind, income, context), value: sides.reduce((sum, part) => sum + part.value, 0) };
 const hub: DrillNode = { name: schedule.name.trim() || t(schedule.kind), kind: income ? 'income' : 'expense', open: details };
 const [left, right] = income ? [[category], sides] : [sides, [category]];
 const shownLeft = left.filter(part => part.value >= .5), shownRight = right.filter(part => part.value >= .5);
 return {
  nodes: [...shownLeft.map(part => part.node), hub, ...shownRight.map(part => part.node)],
  links: [...shownLeft.map((part, index) => ({ source: index, target: shownLeft.length, value: part.value })), ...shownRight.map((part, index) => ({ source: shownLeft.length, target: shownLeft.length + 1 + index, value: part.value }))],
  missing,
 };
}

/** What a Recurring row opens: a schedule's due date as its own Sankey, or a loan's monthly payment as the loan's. */
export function recurringTarget(item: Pick<RecurringItem, 'record' | 'date' | 'amount' | 'direction' | 'status' | 'installment'>): DrillTarget {
 return item.installment ? { side: 'account', key: item.record.id }
  : { side: 'schedule', key: item.record.id, date: item.date, due: { amount: Number(item.amount), currency: item.record.currency }, direction: item.direction, open: item.status === 'due' || item.status === 'overdue' };
}

/** What an upcoming payment opens: a scheduled one its due date's Sankey, a loan repayment or deposit maturity its
 * account's. */
export function dueTarget(item: Pick<DueItem, 'record' | 'date' | 'amount' | 'type'>): DrillTarget {
 return item.type === 'scheduled' ? { side: 'schedule', key: item.record.id, date: item.date, due: { amount: Number(item.amount), currency: item.record.currency }, direction: income.includes(item.record.kind) ? 'income' : 'expense', open: true }
  : { side: 'account', key: item.record.id };
}
