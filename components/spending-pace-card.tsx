"use client";
import { useMemo } from 'react';
import { ReceiptText } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { SpendingPaceChart } from '@/components/charts-lazy';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { depositToday } from '@/lib/deposit-interest';
import { normalizeEntry } from '@/lib/finance';
import { formatMoney } from '@/lib/format';
import { marketRates, type MarketData } from '@/lib/market';
import { emptyPlanning, type PlanningData } from '@/lib/planning';
import type { PortfolioSnapshot } from '@/lib/portfolio-snapshots';
import { spendingPace } from '@/lib/spending-pace';
import type { TransactionSplit } from '@/lib/transaction-tools';

type Props = { owner?: string | null; demo?: boolean; revision?: number; data: PlanningData; splits: TransactionSplit[]; snapshots: PortfolioSnapshot[]; currency: string; market: MarketData | null };

/** This month's spending against last month's by the same day, read once for the dashboard: its Spending card draws it
 * and the headline's Spent tile says how far ahead or behind it is. It reads the same month-scoped records as the
 * Monthly review, so all three show the same spending. */
export function useSpendingPace({ owner = null, demo = false, revision = 0, data: provided, splits, snapshots, currency, market }: Props) {
 const today = depositToday();
 const live = !!owner && !demo;
 const remote = useOwnerResource('/api/planning?scope=review&month=' + today.slice(0, 7), owner, live, revision, emptyPlanning);
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : provided, [live, remote.data, provided]);
 const rates = marketRates(market);
 const pace = useMemo(() => spendingPace({ records: data.records, splits, snapshots, activity: data.activity, investmentLinks: data.investmentLinks }, today, currency, rates), [data, splits, snapshots, today, currency, rates]);
 return { pace, data, rates, loading: live && remote.loading, error: live ? remote.error : '', retry: remote.retry };
}
export type SpendingPaceState = ReturnType<typeof useSpendingPace>;

/** How this month's spending compares with last month's by this day, or null when there is nothing to compare. */
export function paceDifference({ pace, loading }: SpendingPaceState) {
 return loading || pace.missing || pace.empty || pace.previousToDate + pace.spent <= 0 ? null : pace.spent - pace.previousToDate;
}

/** "Am I spending faster than last month?": this month's running total drawn over last month's, day by day. */
export function SpendingPaceCard({ state, currency }: { state: SpendingPaceState; currency: string }) {
 const { t, locale } = useLanguage();
 const { pace, data, rates, loading, error, retry } = state;
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const difference = paceDifference(state);
 return <section className="panel overview-panel spending-pace" aria-label={t('Spending')}>
  <PanelTitle title={<>{t('Spending')} <span className="panel-figure">{pace.missing ? '—' : t('{amount} this month', { amount: money(pace.spent) })}</span></>}/>
  {loading ? <ChartSkeleton label={t('Loading records…')}/> : error ? <InlineError message={t(error)} onRetry={retry}/> : <>
   {pace.empty ? <EmptyState icon={<ReceiptText/>} description={t('No spending recorded this month or last.')}/> : <>
   {difference !== null && <p className="spending-pace-delta">{difference > 0 ? t('{amount} more than last month by this day', { amount: money(difference) }) : difference < 0 ? t('{amount} less than last month by this day', { amount: money(-difference) }) : t('Same as last month by this day')}</p>}
   <SpendingPaceChart pace={pace} data={data} currency={currency} rates={rates}/>
   <ul className="spending-pace-legend"><li><i className="current"/>{t('This month')}</li><li><i className="previous"/>{t('Last month')}</li></ul>
   </>}
  </>}
 </section>;
}
