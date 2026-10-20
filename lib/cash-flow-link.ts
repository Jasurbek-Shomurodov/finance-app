import type { DrillTarget } from './cash-flow-drill-types';

/** A link that opens Cash flow with a goal's Sankey in its drill-down, for one month (`YYYY-MM`): Goals › History links
 * each row there. */
export const goalSankeyHref = (goal: string, month: string) => `/income-expenses?open=goal&key=${encodeURIComponent(goal)}&month=${month}`;

/** The drill-down a Cash flow link asks to open, and the month it is for; null for any other query. */
export function drillLink(search: string): { target: DrillTarget; month: string } | null {
 const params = new URLSearchParams(search), key = params.get('key'), month = params.get('month') ?? '';
 return params.get('open') === 'goal' && key && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? { target: { side: 'goal', key }, month } : null;
}
