"use client";
import { Skeleton } from '@/components/ui/skeleton';
import { useTopBarSlot } from './top-bar-slot';

/** A page's view tabs and actions while it loads, where `PageHeader` would open the page with them: the top bar has no
 * room (phones, narrow windows), so they sit in the page and would otherwise pop in above the shimmer. Each width is a
 * tab's label or an action's button, in pixels. With room in the bar (or outside a workspace) it draws nothing, exactly
 * as `PageHeader` puts nothing in the page there. */
export function PageHeadingSkeleton({ tabs = [], actions = [] }: { tabs?: readonly number[]; actions?: readonly number[] }) {
 const slot = useTopBarSlot();
 if (!slot?.title || slot.actions) return null;
 const tabsInPage = !slot.tabsInBar && tabs.length > 0;
 if (!tabsInPage && !actions.length) return null;
 return <header className="page-heading page-heading-actions">
  {tabsInPage && <div className="segmented page-tabs">{tabs.map((width, index) => <span className="page-tab-skeleton" key={index}><Skeleton className="h-4" style={{ width }}/></span>)}</div>}
  {actions.length > 0 && <div className="entry-actions">{actions.map((width, index) => <Skeleton key={index} className="page-action-skeleton rounded-lg" style={{ width }}/>)}</div>}
 </header>;
}

/** What each screen's `PageHeader` holds: its tabs' labels and its action buttons, by width. One list, so the drawer's
 * shimmer and a screen's own loading state reserve the same row. */
export const pageHeadings: Record<string, { tabs?: readonly number[]; actions?: readonly number[] }> = {
 '/accounts': { tabs: [64, 104], actions: [42, 150, 132] },
 '/transactions': { tabs: [24, 52, 64], actions: [84, 128, 150] },
 '/income-expenses': { tabs: [64, 52, 64, 64], actions: [132] },
 '/reports': { tabs: [72, 64, 52, 32], actions: [176, 256, 288] },
 '/budget': { tabs: [48, 36], actions: [240, 124, 104] },
 '/upcoming': { tabs: [28, 64, 96, 76], actions: [164, 150] },
 '/goals': { tabs: [64, 92, 52], actions: [112] },
 '/assets': { tabs: [64, 88, 116], actions: [112] },
 '/loans-debts': { tabs: [64, 132], actions: [164] },
 '/recently-deleted': { tabs: [24, 96, 76, 48, 72] },
};
