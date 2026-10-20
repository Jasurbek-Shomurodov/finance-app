import { accountNode, span } from './cash-flow-drill';
import type { DrillContext, DrillFlows, DrillNode, DrillTarget } from './cash-flow-drill-types';
import type { Entry } from './finance';
import type { GoalEvent } from './goal-funding';
import { convertAmount } from './market';

type Part = { node: DrillNode; value: number };

/** A goal's additions and withdrawals by the account they came from or went to (which opens it); one without an account
 * by its name or kind, opening Goals, where the goal's history is. */
function bySource(events: GoalEvent[], byId: Map<string, Entry>, t: (key: string) => string, value: (amount: number) => number) {
 const sides = { in: new Map<string, Part>(), out: new Map<string, Part>() };
 for (const event of events) {
  const delta = Number(event.delta), side = delta >= 0 ? sides.in : sides.out, key = event.source_id ?? event.source_name ?? event.event_type;
  const node: DrillNode = event.source_id && byId.has(event.source_id) ? accountNode(event.source_id, byId, t) : { name: event.source_name?.trim() || t(event.event_type), kind: delta >= 0 ? 'income' : 'expense', open: { side: 'link', href: '/goals' } };
  const part = side.get(key) ?? { node, value: 0 };
  part.value += value(delta);
  side.set(key, part);
 }
 return sides;
}

/** One savings goal in the period, in the display currency. Its balance at the period's start and what was added (by the
 * account it came from) flow into it; what was taken out (by the account it went to) and what it held at the period's
 * end flow out. Its balances are worked back from what it holds today through its history (`goal_events`). */
export function goalFlows(id: string, context: DrillContext): DrillFlows {
 const { t, currency, rates } = context, { from, to } = span(context.months, context.today);
 const goal = (context.data.goals ?? []).find(item => item.id === id);
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 const unit = goal ? goal.currency ?? byId.get(goal.account_id ?? '')?.currency ?? currency : currency;
 const convert = (amount: number) => convertAmount(amount, unit, currency, rates);
 if (!goal || convert(1) === null || convert(1) === undefined) return { nodes: [], links: [], missing: goal ? 1 : 0 };
 const events = (context.goalEvents ?? []).filter(event => event.goal_id === id && event.event_type !== 'opening');
 const after = events.filter(event => event.occurred_on > to).reduce((sum, event) => sum + Number(event.delta), 0);
 const within = events.filter(event => event.occurred_on >= from && event.occurred_on <= to);
 const ended = Number(goal.allocated) - after, started = ended - within.reduce((sum, event) => sum + Number(event.delta), 0);
 const sides = bySource(within, byId, t, amount => Math.abs(convert(amount)!));
 const page: DrillNode['open'] = { side: 'link', href: '/goals' };
 const left = [{ node: { name: t('Opening balance'), kind: 'savings', open: page } as DrillNode, value: convert(started)! }, ...sides.in.values()].filter(part => part.value >= .5);
 const right = [...sides.out.values(), { node: { name: t('Saved'), kind: 'savings', open: page } as DrillNode, value: convert(ended)! }].filter(part => part.value >= .5);
 const hub: DrillNode = { name: goal.name, kind: 'savings', open: page };
 return {
  nodes: [...left.map(part => part.node), hub, ...right.map(part => part.node)],
  links: [...left.map((part, index) => ({ source: index, target: left.length, value: part.value })), ...right.map((part, index) => ({ source: left.length, target: left.length + 1 + index, value: part.value }))],
  missing: 0,
 };
}

/** A goal's additions and withdrawals in the period, newest first, each as it was entered in the goal's currency, with
 * what a tap opens: the account it came from or went to, else Goals. */
export function goalEventsIn(id: string, context: DrillContext) {
 const { from, to } = span(context.months, context.today);
 const goal = (context.data.goals ?? []).find(item => item.id === id);
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 const currency = goal?.currency ?? byId.get(goal?.account_id ?? '')?.currency ?? context.currency;
 return (context.goalEvents ?? []).filter(event => event.goal_id === id && event.event_type !== 'opening' && event.occurred_on >= from && event.occurred_on <= to)
  .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || a.id.localeCompare(b.id))
  .map(event => {
   const account = event.source_id ? byId.get(event.source_id) : undefined;
   const open: DrillTarget = account ? { side: 'account', key: account.id } : { side: 'link', href: '/goals' };
   return { event, currency, source: account?.name.trim() || event.source_name?.trim() || '', open };
  });
}
