import { monthsBetween } from './budget';
import { trendMonths } from './cash-flow-report';
import type { Drill } from './business-report';
import type { DrillTarget } from './cash-flow-drill-types';
import type { Entry } from './finance';
import type { PlanningData } from './planning';

/** What another page can open in the Cash flow drill-down by link: a goal, an account, a payer or merchant, a transfer
 * or a mortgage payment. */
export type LinkedTarget = Extract<DrillTarget, { side: 'goal' | 'account' | 'merchant' | 'operation' | 'payment' }>;
const linkable = new Set<string>(['goal', 'account', 'merchant', 'operation', 'payment']);

/** A link that opens Cash flow with a Sankey in its drill-down, for one month (`YYYY-MM`): Goals › History and Accounts ›
 * Recent activity link each row there. */
export const drillHref = (target: LinkedTarget, month: string) => `/income-expenses?open=${target.side}&key=${encodeURIComponent(target.key)}&month=${month}${target.side === 'merchant' && target.income ? '&income=1' : ''}`;
export const goalSankeyHref = (goal: string, month: string) => drillHref({ side: 'goal', key: goal }, month);

/** The drill-down a Cash flow link asks to open, and the month it is for; null for any other query. */
export function drillLink(search: string): { target: LinkedTarget; month: string } | null {
 const params = new URLSearchParams(search), side = params.get('open') ?? '', key = params.get('key'), month = params.get('month') ?? '';
 if (!linkable.has(side) || !key || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
 const target = (side === 'merchant' ? { side, key, income: params.get('income') === '1' } : { side, key }) as LinkedTarget;
 return { target, month };
}

const operationTitles: Record<string, string> = { transfer: 'Transfer', repayment: 'Repayment', buy: 'Buy holding', sell: 'Sell / convert holding' };
/** The dialog title of a linked drill-down, from the workspace once it is read: the goal's, account's or merchant's name,
 * the payment's, or what the transfer was. */
export function linkedTitle(target: DrillTarget, data: Pick<PlanningData, 'records' | 'goals' | 'activity' | 'movements'>, t: (key: string) => string) {
 const record = (id: string) => (data.records as Entry[]).find(item => item.id === id);
 if (target.side === 'goal') return data.goals.find(goal => goal.id === target.key)?.name ?? t('Goal');
 if (target.side === 'account') return record(target.key)?.name.trim() || t('Account');
 if (target.side === 'merchant') return target.key;
 if (target.side === 'payment') return record(target.key)?.name.trim() || t('Mortgage payment');
 if (target.side === 'operation') return t(operationTitles[data.activity.find(row => row.id === target.key)?.action ?? data.movements?.find(row => row.id === target.key)?.kind ?? 'transfer'] ?? 'Transfer');
 return '';
}

/** The months Cash flow reads: the chosen month's year of bars, through this month when that fits in two years (so a
 * past balance can be worked back from today's), and back to a linked month when it fits too. */
export function readRange(month: string, today: string, linked?: string | null) {
 const now = today.slice(0, 7), trend = trendMonths(month, 'year')[0];
 const readTo = month < now && monthsBetween(trend, now).length <= 24 ? now : month;
 const first = linked && linked < trend && monthsBetween(linked, readTo).length <= 24 ? linked : trend;
 return { first, readTo, throughToday: readTo >= now };
}

/** The Sankey a Reports row opens beside narrowing the transactions: a category, several categories together, or a
 * payer or merchant. A business alone has no drill-down view; it only narrows. */
export function reportDrillTarget(drill: Drill): DrillTarget | null {
 if (!drill.direction) return null;
 const income = drill.direction === 'income';
 if (drill.merchant !== undefined) return { side: 'merchant', key: drill.merchant, income };
 if (drill.category !== undefined) return { side: income ? 'income' : 'expense', key: drill.category };
 return drill.categories?.length ? { side: 'group', income, keys: [...drill.categories], by: 'category' } : null;
}
