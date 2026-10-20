import { monthsBetween } from './budget';
import { shiftMonth } from './calendar-days';
import { accountChanges, accountNode } from './cash-flow-drill';
import { pageOf } from './cash-flow-drill-base';
import type { DrillContext, DrillFlows, DrillNode } from './cash-flow-drill-types';
import { unitPricedKinds, value, type Entry } from './finance';
import { convertAmount } from './market';

type Part = { node: DrillNode; value: number };
const draw = (left: Part[], hub: DrillNode, right: Part[], missing: number): DrillFlows => {
 const shownLeft = left.filter(item => item.value >= .5), shownRight = right.filter(item => item.value >= .5);
 return {
  nodes: [...shownLeft.map(item => item.node), hub, ...shownRight.map(item => item.node)],
  links: [...shownLeft.map((item, index) => ({ source: index, target: shownLeft.length, value: item.value })), ...shownRight.map((item, index) => ({ source: shownLeft.length, target: shownLeft.length + 1 + index, value: item.value }))],
  missing,
 };
};

/** What an account or holding moved after the period, through today: today's balance less it is the balance at the
 * period's end. Nothing for a period that runs to the current month. */
function movedSince(key: string, context: DrillContext) {
 const last = context.months.at(-1) ?? context.today.slice(0, 7), now = context.today.slice(0, 7);
 if (last >= now) return { change: 0, missing: 0 };
 const { changes, missing } = accountChanges({ ...context, months: monthsBetween(shiftMonth(last, 1), now) });
 return { change: changes.get(key) ?? 0, missing };
}

/** A cash account or deposit at the period's end: its opening balance and what the period added flow in; what the period
 * used and its balance flow out. For a period that runs to this month the balance is split into the goals it holds and
 * what is available, as on Goals. */
function accountBalance(account: Entry, now: number, change: number, ended: number, context: DrillContext): DrillFlows {
 const { t, currency, rates } = context, current = ended === now;
 const back: DrillNode = { name: t('This period'), kind: change >= 0 ? 'income' : 'expense', open: { side: 'account', key: account.id } };
 const accounts: DrillNode['open'] = { side: 'link', href: '/accounts' };
 let unknown = 0;
 const goals = current ? (context.data.goals ?? []).filter(goal => goal.account_id === account.id && !goal.archived && Number(goal.allocated) > 0).flatMap(goal => {
  const held = convertAmount(Number(goal.allocated), goal.currency ?? account.currency, currency, rates);
  if (held === null || held === undefined) { unknown += 1; return []; }
  return [{ node: { name: goal.name, kind: 'savings', open: { side: 'goal', key: goal.id } } as DrillNode, value: held }];
 }) : [];
 const held = goals.reduce((sum, goal) => sum + goal.value, 0);
 const left: Part[] = [{ node: { name: t('Opening balance'), kind: 'account', open: accounts }, value: ended - change }, { node: back, value: change }];
 const rest: DrillNode = { name: t(!current ? 'Balance' : goals.length ? 'Available' : 'Current balance'), kind: 'account', open: accounts };
 return draw(left, { ...accountNode(account.id, new Map([[account.id, account]]), t), open: pageOf('account') }, [{ node: back, value: -change }, ...goals, { node: rest, value: ended - held }], unknown);
}

/** A holding at the period's end: what it cost before the period and what the period invested, plus any gain, flow in;
 * its value and any loss flow out. Its value is today's quote; an earlier period counts what moved since at cost. */
function holdingBalance(holding: Entry, now: number, change: number, ended: number, context: DrillContext): DrillFlows {
 const { t, currency, rates } = context;
 const cost = unitPricedKinds.includes(holding.kind) ? Number(holding.cost) * Number(holding.quantity) : Number(holding.cost);
 const paid = convertAmount(cost, holding.currency, currency, rates) ?? 0;
 // Without a purchase cost the value before the period stands in for it, and no gain can be told.
 const before = paid > 0 ? paid - (now - ended) - change : ended - change, gain = paid > 0 ? ended - (before + change) : 0;
 const page: DrillNode['open'] = { side: 'link', href: '/assets' };
 const left: Part[] = [{ node: { name: t(paid > 0 ? 'Purchase cost' : 'Opening balance'), kind: 'holding', open: page }, value: before }, { node: { name: t('This period'), kind: 'income', open: { side: 'account', key: holding.id } }, value: change }, { node: { name: t('Gain/loss'), kind: 'income', open: page }, value: gain }];
 const right: Part[] = [{ node: { name: t('This period'), kind: 'expense', open: { side: 'account', key: holding.id } }, value: -change }, { node: { name: t('Current value'), kind: 'holding', open: page }, value: ended }, { node: { name: t('Gain/loss'), kind: 'expense', open: page }, value: -gain }];
 return draw(left, { ...accountNode(holding.id, new Map([[holding.id, holding]]), t), open: pageOf('holding') }, right, 0);
}

/** Where one account or holding stood at the period's end, in the display currency: today's balance less what moved
 * since, less the period's change for where it started. */
export function balanceFlows(key: string, context: DrillContext): DrillFlows {
 const byId = new Map((context.data.records as Entry[]).map(record => [record.id, record]));
 const record = byId.get(key);
 const now = record ? convertAmount(value(record), record.currency, context.currency, context.rates) : null;
 const { changes, missing } = accountChanges(context), since = movedSince(key, context);
 if (!record || now === null || now === undefined || missing || since.missing) return { nodes: [], links: [], missing: missing + since.missing || (record ? 1 : 0) };
 const change = changes.get(key) ?? 0, ended = now - since.change;
 return accountNode(key, byId, context.t).kind === 'holding' ? holdingBalance(record, now, change, ended, context) : accountBalance(record, now, change, ended, context);
}
