import { liabilities, type Entry } from '@/lib/finance';
import { portfolioHoldings } from '@/lib/portfolio-performance';
import type { Goal } from '@/lib/planning';

/** What a drawer destination's shimmer can know before its records arrive, so it draws only the blocks the page will
 * (docs/agents/interface.md, Shimmer follows the screen). A value left out is unknown, and each shimmer then draws its
 * usual shape: Loans its side column, Goals its list, Accounts no ⋯. */
export type ShimmerHints = { debts?: boolean; goals?: boolean; accountsMenu?: boolean; investments?: InvestmentsHint };
/** Investments' Holdings: how many account cards, allocation rows and other asset cards it opens with, each capped at
 * what fills the first screen. An account count of 0 is the "No accounts yet." line. */
export type InvestmentsHint = { accounts: number; kinds: number; assets: number };

type Workspace = { loading: boolean; records: readonly Entry[]; goals: readonly Goal[]; shared: boolean; businesses: number; holdingAccounts?: readonly { id: string; kind: string }[] };

const accountKinds = ['Cash', 'Deposit'];
/** What Holdings will draw, as `AssetDashboard` groups it: a holding inside an investment account is that account's. */
export function investmentsHint(records: readonly Entry[], holdingAccounts: readonly { id: string; kind: string }[]): InvestmentsHint {
 // Only investment holdings: an everyday cash account lives on Accounts, not here.
 const held = portfolioHoldings(records);
 const grouped = (record: Entry) => holdingAccounts.some(account => account.id === record.holding_account_id && (record.kind === account.kind || record.kind === 'Cash'));
 const loose = held.filter(record => !grouped(record));
 return {
  accounts: Math.min(3, holdingAccounts.length + loose.filter(record => accountKinds.includes(record.kind)).length),
  kinds: Math.min(6, new Set(held.map(record => record.kind)).size),
  assets: Math.min(6, loose.filter(record => !accountKinds.includes(record.kind)).length),
 };
}

export function shimmerHints({ loading, records, goals, shared, businesses, holdingAccounts = [] }: Workspace): ShimmerHints {
 // Accounts opens with ⋯ when it has owners (a shared workspace) or businesses to edit; both are known before records.
 const accountsMenu = shared || businesses > 0;
 if (loading) return { accountsMenu };
 return {
  // Loans draws its side column only while a debt is owed.
  debts: records.some(record => liabilities.includes(record.kind) && record.amount > 0),
  // Goals opens on active goals; archived ones sit behind a switch, so they leave the page empty.
  goals: goals.some(goal => !goal.archived),
  accountsMenu,
  investments: investmentsHint(records, holdingAccounts),
 };
}
