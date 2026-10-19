"use client";
import { useMemo } from 'react';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { depositToday } from '@/lib/deposit-interest';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { marketRates, type MarketData } from '@/lib/market';
import { emptyPlanning } from '@/lib/planning';
import { propertyTotals, type PropertyTotals } from '@/lib/property-totals';

/** Each property's rent received and costs paid since 1 January, in the display currency. A signed-in workspace reads
 * this year's payments on its own; the sample workspace already holds every record. Null while they load or failed. */
export function usePropertyTotals({ owner, demo, revision, records, sample, currency, market }: { owner: string | null; demo: boolean; revision: number; records: readonly Entry[]; sample: readonly Entry[]; currency: string; market: MarketData | null }): Map<string, PropertyTotals> | null {
 const today = depositToday(), from = today.slice(0, 4) + '-01-01';
 const live = !!owner && !demo && records.some(record => record.kind === 'Property');
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${today.slice(0, 7)}&from=${from.slice(0, 7)}`, owner, live, revision, emptyPlanning);
 return useMemo(() => {
  if (live && (remote.initialLoading || remote.error)) return null;
  const rows = live ? remote.data.records.map(normalizeEntry) : sample;
  return propertyTotals(rows, from, today, currency, marketRates(market));
 }, [live, remote.initialLoading, remote.error, remote.data, sample, from, today, currency, market]);
}
