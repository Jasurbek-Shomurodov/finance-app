import { ArrowLeftRight, CalendarClock, ChartBarBig, ChartColumn, ChartPie, ChartNoAxesCombined, HandCoins, LayoutDashboard, Settings, Sparkles, Target, Trash2, Wallet } from 'lucide-react';

/** Every workspace destination, in drawer order. `name` identifies the section; `label` is the short drawer word.
 * `group` places it: WORKSPACE in the main list, Manage at the drawer foot above the account, and Account behind the
 * account button itself. In the main list `heading` names the run of rows it starts under (Dashboard and Assistant
 * stand on their own at the top): money as it moves, plans for it, and what is owned and owed. */
export const sections = [
 { name: 'Overview', label: 'Dashboard', icon: LayoutDashboard, path: '/', group: 'WORKSPACE' },
 { name: 'Assistant', label: 'Assistant', icon: Sparkles, path: '/assistant', group: 'WORKSPACE' },
 { name: 'Accounts', label: 'Accounts', icon: Wallet, path: '/accounts', group: 'WORKSPACE', heading: 'Money' },
 { name: 'Transactions', label: 'Transactions', icon: ArrowLeftRight, path: '/transactions', group: 'WORKSPACE', heading: 'Money' },
 { name: 'Income & expenses', label: 'Cash flow', icon: ChartColumn, path: '/income-expenses', group: 'WORKSPACE', heading: 'Money' },
 { name: 'Reports', label: 'Reports', icon: ChartBarBig, path: '/reports', group: 'WORKSPACE', heading: 'Money' },
 { name: 'Budget', label: 'Budget', icon: ChartPie, path: '/budget', group: 'WORKSPACE', heading: 'Planning' },
 { name: 'Upcoming payments', label: 'Recurring', icon: CalendarClock, path: '/upcoming', group: 'WORKSPACE', heading: 'Planning' },
 { name: 'Savings goals', label: 'Goals', icon: Target, path: '/goals', group: 'WORKSPACE', heading: 'Planning' },
 { name: 'Assets & investments', label: 'Investments', icon: ChartNoAxesCombined, path: '/assets', group: 'WORKSPACE', heading: 'Net worth' },
 { name: 'Loans & debts', label: 'Loans & debts', icon: HandCoins, path: '/loans-debts', group: 'WORKSPACE', heading: 'Net worth' },
 { name: 'Recently deleted', label: 'Recently deleted', icon: Trash2, path: '/recently-deleted', group: 'Manage' },
 { name: 'Settings', label: 'Settings', icon: Settings, path: '/settings', group: 'Account' },
] as const;

type Section = (typeof sections)[number];
/** The main list in its drawer groups, in order: rows without a heading first, then one group per heading. */
export function drawerGroups() {
 const groups: { heading?: string; items: Section[] }[] = [];
 for (const section of sections.filter(row => row.group === 'WORKSPACE')) {
  const heading = 'heading' in section ? section.heading : undefined;
  const last = groups.at(-1);
  if (last && last.heading === heading) last.items.push(section); else groups.push({ heading, items: [section] });
 }
 return groups;
}

type SectionName = (typeof sections)[number]['name'];
/** The drawer word for a section, which the top bar repeats. */
export const sectionLabel = (name: string) => sections.find(section => section.name === name)?.label ?? name;

/** A drawer tap that has not reached its route yet: from the path it was tapped on, to its destination. */
export type PendingNavigation = { from: string; to: string };

/** The destination still loading, or null once the route changed (arrived, or the user went elsewhere). */
export function pendingDestination(pending: PendingNavigation | null, pathname: string) {
 return pending && pending.from === pathname && pending.to !== pathname ? pending.to : null;
}

/** The section a path belongs to. Unknown paths fall back to Overview. */
export function sectionFor(pathname: string): SectionName {
 return sections.find(section => section.path === pathname)?.name ?? 'Overview';
}
