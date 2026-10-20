import { accountChanges, accountNode } from './cash-flow-drill';
import type { DrillContext, DrillFlows, DrillNode } from './cash-flow-drill-types';
import { value, type Entry } from './finance';
import { convertAmount } from './market';

/** Where one cash account or deposit stands today, in the display currency. Its opening balance and what the period
 * added flow into it; what the period used and today's balance flow out, today's balance split into the goals it holds
 * and what is still available. The opening balance is today's less the period's change, so this needs a period that runs
 * to the current month: an earlier one would also need what moved since. */
export function balanceFlows(key: string, context: DrillContext): DrillFlows {
 const { t, currency, rates } = context;
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 const account = byId.get(key);
 const today = account ? convertAmount(value(account), account.currency, currency, rates) : null;
 const { changes, missing } = accountChanges(context);
 if (!account || today === null || today === undefined || missing) return { nodes: [], links: [], missing: missing || (account ? 1 : 0) };
 const change = changes.get(key) ?? 0, opening = today - change;
 // Goals hold part of the balance; each in its own currency, the rest is available.
 let unknown = 0;
 const goals = (context.data.goals ?? []).filter(goal => goal.account_id === key && !goal.archived && Number(goal.allocated) > 0).flatMap(goal => {
  const held = convertAmount(Number(goal.allocated), goal.currency ?? account.currency, currency, rates);
  if (held === null || held === undefined) { unknown += 1; return []; }
  return [{ node: { name: goal.name, kind: 'savings' } as DrillNode, value: held }];
 });
 const held = goals.reduce((sum, goal) => sum + goal.value, 0);
 const left = [{ node: { name: t('Opening balance'), kind: 'account' } as DrillNode, value: opening }, { node: { name: t('This period'), kind: 'income' } as DrillNode, value: change }];
 const right = [{ node: { name: t('This period'), kind: 'expense' } as DrillNode, value: -change }, ...goals, { node: { name: t(goals.length ? 'Available' : 'Current balance'), kind: 'account' } as DrillNode, value: today - held }];
 const shownLeft = left.filter(item => item.value >= .5), shownRight = right.filter(item => item.value >= .5);
 const hub = { ...accountNode(key, byId, t), open: undefined };
 return {
  nodes: [...shownLeft.map(item => item.node), hub, ...shownRight.map(item => item.node)],
  links: [...shownLeft.map((item, index) => ({ source: index, target: shownLeft.length, value: item.value })), ...shownRight.map((item, index) => ({ source: shownLeft.length, target: shownLeft.length + 1 + index, value: item.value }))],
  missing: unknown,
 };
}
