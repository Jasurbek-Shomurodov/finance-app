"use client";
import { useMemo } from 'react';
import { useLanguage } from '@/components/language-provider';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { budgetCategories } from '@/lib/budget';
import { depositToday } from '@/lib/deposit-interest';
import { budgetKey, normalizeEntry, type Entry } from '@/lib/finance';
import { marketRates } from '@/lib/market';
import { emptyPlanning } from '@/lib/planning';
import { accountChange, categoryChange, type RestorePreview } from '@/lib/restore-preview';
import type { DeletedItem } from '@/lib/deleted-items';

/** What Recently deleted needs from the workspace to describe an item and what restoring it changes. */
export type RestoreContext = {
 /** The category a record reads under: its custom category's name, or its kind in the current language. */
 categoryName: (entry: Entry) => string;
 /** The cash account a record names, when it still exists. */
 accountName: (id: string | null | undefined) => string | null;
 preview: (item: DeletedItem) => RestorePreview | null;
};

/** Reads this month as the Budget does (the same request as the Dashboard's, shared) and the workspace's accounts. */
export function useRestorePreview(): RestoreContext {
 const { t } = useLanguage();
 const { demo, user, planning, transactionTools, budget, currency, market, removedCategories, reload } = useWorkspace();
 const today = depositToday(), month = today.slice(0, 7);
 const read = useOwnerResource('/api/planning?scope=review&month=' + month, demo ? null : user, !demo && !!user, reload, emptyPlanning);
 const monthData = useMemo(() => demo ? planning.data : { ...read.data, records: read.data.records.map(normalizeEntry) }, [demo, planning.data, read.data]);
 const categories = useMemo(() => budgetCategories(planning.data.categories, budget.state.categories, removedCategories.kinds), [planning.data.categories, budget.state.categories, removedCategories.kinds]);
 const accounts = planning.data.records;
 const rates = marketRates(market);
 // A month still loading or failed is no figure: the preview leaves the category out rather than guess.
 const monthReady = demo || (!read.loading && !read.error);
 const categoryName = (entry: Entry) => { const category = categories.find(item => item.key === budgetKey(entry)); return category?.custom ? category.name : t(entry.kind); };
 return {
  categoryName,
  accountName: id => accounts.find(row => row.id === id && row.kind === 'Cash')?.name ?? null,
  preview: item => {
   if (item.source !== 'finance_records') return null;
   const entry = normalizeEntry(item.data);
   const category = monthReady ? categoryChange(entry, !!item.splits?.length, categoryName(entry), { data: monthData, splits: transactionTools.data.splits, month, today, currency, rates, categories, amounts: budget.state.amounts, schedules: planning.data.records }) : undefined;
   return { account: accountChange(accounts, entry), category };
  },
 };
}
