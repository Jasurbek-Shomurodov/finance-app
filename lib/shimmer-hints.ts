import { liabilities, type Entry } from '@/lib/finance';
import type { Goal } from '@/lib/planning';

/** What a drawer destination's shimmer can know before its records arrive, so it draws only the blocks the page will
 * (docs/agents/interface.md, Shimmer follows the screen). A value left out is unknown, and each shimmer then draws its
 * usual shape: Loans its side column, Goals its list, Accounts no ⋯. */
export type ShimmerHints = { debts?: boolean; goals?: boolean; accountsMenu?: boolean };

type Workspace = { loading: boolean; records: readonly Entry[]; goals: readonly Goal[]; shared: boolean; businesses: number };

export function shimmerHints({ loading, records, goals, shared, businesses }: Workspace): ShimmerHints {
 // Accounts opens with ⋯ when it has owners (a shared workspace) or businesses to edit; both are known before records.
 const accountsMenu = shared || businesses > 0;
 if (loading) return { accountsMenu };
 return {
  // Loans draws its side column only while a debt is owed.
  debts: records.some(record => liabilities.includes(record.kind) && record.amount > 0),
  // Goals opens on active goals; archived ones sit behind a switch, so they leave the page empty.
  goals: goals.some(goal => !goal.archived),
  accountsMenu,
 };
}
