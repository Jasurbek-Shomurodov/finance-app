"use client";
import { useCallback, useSyncExternalStore } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTopBarSlot } from './top-bar-slot';

type Heading = { tabs?: readonly number[]; actions?: readonly number[]; /** The title carries an ⓘ hint. */ hint?: boolean };
const sum = (widths: readonly number[], gap: number) => widths.reduce((total, width) => total + width, 0) + gap * Math.max(0, widths.length - 1);
const widths = (elements: Iterable<Element>) => [...elements].map(element => element.getBoundingClientRect().width);

/** Whether the loaded page's actions will be too wide for the bar's one line, so `PageHeader` puts them in the page.
 * While a drawer tap loads, the bar holds no page yet and looks roomy; this adds up what it will hold, as the bar's
 * own measure does (`barWidthNeeded`, components/workspace/top-bar.tsx): the title (the destination's label, the
 * hint beside it), the tabs and the actions by their widths here, and the bar's own controls as they stand. */
function actionsOverflow(bar: HTMLElement, { tabs = [], actions = [], hint = false }: Heading) {
 const style = getComputedStyle(bar);
 const room = bar.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
 const extras = widths([...bar.querySelector('.topbar-location')?.children ?? []].filter(child => !child.matches('.topbar-page-title, .topbar-title')));
 const title = (bar.querySelector('.topbar-title')?.scrollWidth || 100) + (hint ? 33 : 0);
 const own = widths([...bar.querySelector('.topbar-actions')?.children ?? []].filter(child => !child.matches('.topbar-page-actions')));
 return sum(extras, 12) + (extras.length ? 12 : 0) + title + (tabs.length ? 22 + sum(tabs, 8) : 0) + 12 + sum(actions, 8) + 21 + sum(own, 8) > room;
}

/** `actionsOverflow` for the bar holding `title`, read while rendering so the shimmer's first frame already has the row
 * (no row popping in after paint), and read again whenever the bar changes size. */
function useActionsInPage(title: HTMLElement | null | undefined, roomy: boolean, heading: Heading) {
 const bar = roomy && heading.actions?.length ? title?.closest?.<HTMLElement>('.topbar') ?? null : null;
 const subscribe = useCallback((change: () => void) => {
  if (!bar) return () => {};
  const resized = new ResizeObserver(change);
  resized.observe(bar);
  return () => resized.disconnect();
 }, [bar]);
 return useSyncExternalStore(subscribe, () => !!bar && actionsOverflow(bar, heading), () => false);
}

/** A page's view tabs and actions while it loads, where `PageHeader` would open the page with them: the top bar has no
 * room (phones, narrow windows), so they sit in the page and would otherwise pop in above the shimmer. Each width is a
 * tab's label or an action's button, in pixels. With room in the bar (or outside a workspace) it draws nothing, exactly
 * as `PageHeader` puts nothing in the page there, unless the page's actions will not fit beside its title and tabs:
 * then they open the page as they will once it loads. */
export function PageHeadingSkeleton({ tabs = [], actions = [], hint = false }: Heading) {
 const slot = useTopBarSlot();
 const actionsInPage = useActionsInPage(slot?.title, !!slot?.actions, { tabs, actions, hint });
 if (!slot?.title || (slot.actions && !actionsInPage)) return null;
 const tabsInPage = !slot.tabsInBar && tabs.length > 0;
 if (!tabsInPage && !actions.length) return null;
 return <header className="page-heading page-heading-actions">
  {tabsInPage && <div className="segmented page-tabs">{tabs.map((width, index) => <span className="page-tab-skeleton" key={index}><Skeleton className="h-4" style={{ width }}/></span>)}</div>}
  {actions.length > 0 && <div className="entry-actions">{actions.map((width, index) => <Skeleton key={index} className="page-action-skeleton rounded-lg" style={{ width }}/>)}</div>}
 </header>;
}

/** What each screen's `PageHeader` holds: its tabs' labels and its action buttons, by width. One list, so the drawer's
 * shimmer and a screen's own loading state reserve the same row. */
// Widths measured in English at 1280px (23 November 2026). Accounts' ⋯ (owners, businesses) and Reports' business
// filter appear only for accounts that have them, so they are left out, as most accounts have neither.
export const pageHeadings: Record<string, Heading> = {
 '/accounts': { tabs: [72, 107], actions: [155, 133] },
 '/transactions': { tabs: [25, 57, 73], actions: [87, 132, 162], hint: true },
 '/income-expenses': { tabs: [72, 57, 72, 66], actions: [130] },
 '/reports': { tabs: [75, 72, 57, 127], actions: [256, 304], hint: true },
 '/budget': { tabs: [51, 38], actions: [304, 128, 105], hint: true },
 '/upcoming': { tabs: [32, 68, 100, 79], actions: [171, 147], hint: true },
 '/goals': { tabs: [72, 93, 56], actions: [108] },
 '/assets': { tabs: [67, 88, 116, 119], actions: [115] },
 '/loans-debts': { tabs: [72, 141], actions: [159] },
 '/recently-deleted': { tabs: [25, 94, 73, 46, 71], hint: true },
};
