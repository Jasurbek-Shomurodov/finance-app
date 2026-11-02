import { budgetReadRange } from './budget';
import { periodOf, readableRange, trendWindow } from './business-report';
import { readRange } from './cash-flow-link';
import { periodDays } from './transaction-list';

/** A screen's early read: `session` reads belong to the signed-in person and `revision` is the one that screen asks with. */
export type SectionRead = { url: string; session?: boolean; revision?: number };
const budgetRead = (from: string, to: string) => `/api/planning?scope=budget&month=${to}&from=${from}`;

/** What each screen reads for itself when it opens as it opens by default, so its reads can start as soon as the owner is
 * known (`useSectionWarmup`) rather than after settings arrive and the screen mounts. Each URL comes from the range helper
 * the screen itself uses, so its card finds the reply. A screen opened on another period, or a Budget with rollover funds
 * reaching further back, asks for its own range as before. Recurring has no entry: it opens on the workspace's own
 * planning read, and its Subscriptions view reads only once chosen. */
export function sectionReads(section: string, today: string): SectionRead[] {
 const month = today.slice(0, 7);
 switch (section) {
  case 'Overview': return [{ url: '/api/planning?scope=review&month=' + month }, { url: '/api/portfolio-history' }, { url: '/api/comparison-profile', session: true, revision: 0 }];
  case 'Budget': { const { from, to } = budgetReadRange(month, 'month', []); return [{ url: budgetRead(from, to) }]; }
  case 'Transactions': { const { from, to } = periodDays('three_months', today); return [{ url: budgetRead(from.slice(0, 7), to.slice(0, 7)) }]; }
  case 'Income & expenses': { const { first, readTo } = readRange(month, today); return [{ url: budgetRead(first, readTo) }, { url: '/api/goal-tools' }]; }
  case 'Reports': { const { from, to } = readableRange(trendWindow(periodOf('month', today, today), 'month')); return [{ url: budgetRead(from.slice(0, 7), to.slice(0, 7)) }]; }
  case 'Recently deleted': return [{ url: '/api/deleted-items?page=1', session: true, revision: 0 }];
  default: return [];
 }
}
