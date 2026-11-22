"use client";
import { ReceiptText } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { SpendingPaceChart } from '@/components/charts-lazy';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { monthDays, shiftMonth } from '@/lib/calendar-days';
import { depositToday } from '@/lib/deposit-interest';
import { normalizeEntry } from '@/lib/finance';
import { formatDate, formatMoney, formatMonthYear, formatNumber } from '@/lib/format';
import { marketRates, type MarketData } from '@/lib/market';
import { emptyPlanning, type PlanningData } from '@/lib/planning';
import { spendingPace, type PaceStatus, type SpendingPace } from '@/lib/spending-pace';
import { monthlyReview, type TransactionSplit } from '@/lib/transaction-tools';

type Props = { owner?: string | null; demo?: boolean; revision?: number; data: PlanningData; splits: TransactionSplit[]; currency: string; market: MarketData | null;
 /** This month's plan for spending: the even-pace line runs toward it. None, or one no rate converts, leaves the line out. */ plan?: number | null };

/** This month's spending, read once for the dashboard: its running total against last month's and the plan (the
 * Spending pace card), the month's totals (the headline's Spent and Safe to spend tiles) and both months by category,
 * last month cut off on this day (the Where it is going card). It reads the same month-scoped records as the Monthly
 * review, so all of them show the same spending. */
export function useSpendingPace({ owner = null, demo = false, revision = 0, data: provided, splits, currency, market, plan = null }: Props) {
 const today = depositToday(), month = today.slice(0, 7), previousMonth = shiftMonth(month, -1);
 const live = !!owner && !demo;
 const remote = useOwnerResource('/api/planning?scope=review&month=' + month, owner, live, revision, emptyPlanning);
 const data = live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : provided;
 const rates = marketRates(market);
 const pace = spendingPace({ records: data.records, splits, activity: data.activity, investmentLinks: data.investmentLinks }, today, currency, rates, { plan: plan !== null && plan > 0 ? plan : null });
 const review = (target: string, cutoff: string) => monthlyReview(data.records, splits, [], target, currency, cutoff, data.activity, rates, data.investmentLinks);
 // A shorter previous month is whole by its last day.
 const sameDay = `${previousMonth}-${String(Math.min(Number(today.slice(8, 10)), monthDays(previousMonth))).padStart(2, '0')}`;
 return { pace, month: review(month, today), before: review(previousMonth, sameDay), data, rates, loading: live && remote.loading, error: live ? remote.error : '', retry: remote.retry };
}
export type SpendingPaceState = ReturnType<typeof useSpendingPace>;

/** How this month's spending compares with last month's by this day, or null when there is nothing to compare. */
export function paceDifference({ pace, loading }: Pick<SpendingPaceState, 'pace' | 'loading'>) {
 return loading || pace.missing || pace.empty || pace.previousToDate + pace.spent <= 0 ? null : pace.spent - pace.previousToDate;
}

const statusLabels: Record<PaceStatus, string> = { on_pace: 'On pace', above_pace: 'Above pace', over_plan: 'Over plan' };
const statusClass: Record<PaceStatus, string> = { on_pace: 'status-badge is-paid', above_pace: 'status-badge is-caution', over_plan: 'status-badge is-overdue' };

type CardProps = { pace: SpendingPace; data: Pick<PlanningData, 'records' | 'investmentLinks'>; rates?: number | Record<string, number>; currency: string;
 /** Budget's side panel: the month's figure heads a short chart without axes. The Dashboard leaves the figure to its Spent tile. */ compact?: boolean;
 loading?: boolean; error?: string; onRetry?: () => void;
 /** Where "View all" goes: the month's spending in Transactions. */ href?: string };

/** "Am I spending faster than last month, and than the plan allows?": the month's running total drawn over last month's
 * and beside an even pace toward the plan. The Dashboard and Budget share this one card. */
export function SpendingPaceCard({ pace, data, rates, currency, compact = false, loading = false, error = '', onRetry, href }: CardProps) {
 const { t, locale } = useLanguage();
 const day = pace.day > 0 ? t('Day {day} of {days}', { day: formatNumber(pace.day, locale, 0), days: formatNumber(pace.days, locale, 0) }) : null;
 return <section className={compact ? 'panel budget-pace' : 'panel overview-panel spending-pace'} aria-label={t('Spending pace')}>
  <PanelTitle title={<>{t('Spending pace')}{!compact && day && <> <span className="panel-figure">{day}</span></>}</>} hint={t('What you have spent so far this month, beside an even pace: the plan spread equally over the days of the month.')}>
   {!loading && !error && pace.status && <span className={statusClass[pace.status]}>{t(statusLabels[pace.status])}</span>}
   {href && <DrawerLink href={href}>{t('View all')}</DrawerLink>}
  </PanelTitle>
  {loading ? <ChartSkeleton label={t('Loading records…')}/> : error ? <InlineError message={t(error)} onRetry={onRetry}/> : <PaceBody pace={pace} data={data} rates={rates} currency={currency} compact={compact} day={day}/>}
 </section>;
}

/** The chart with its figure, axis and legend, or the empty state when neither month has spending. */
function PaceBody({ pace, data, rates, currency, compact, day }: Pick<CardProps, 'pace' | 'data' | 'rates' | 'currency'> & { compact: boolean; day: string | null }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 // The running month reads as This month and Last month; any other month Budget shows is named.
 const names = pace.running ? [t('This month'), t('Last month')] : [formatMonthYear(pace.month, locale), formatMonthYear(pace.previousMonth, locale)];
 if (pace.empty && !compact) return <EmptyState icon={<ReceiptText/>} description={t('No spending recorded this month or last.')}/>;
 return <>
   {compact && <p className="budget-pace-figure"><strong><RollingText text={money(pace.spent)}/></strong>{pace.plan !== null && <span>{t('{amount} planned', { amount: money(pace.plan) })}</span>}{day && <span>{day}</span>}</p>}
   <SpendingPaceChart pace={pace} data={data} currency={currency} rates={rates} compact={compact}/>
   {compact && <p className="budget-pace-axis"><span>{formatDate(pace.month + '-01', locale)}</span><span>{formatDate(`${pace.month}-${String(pace.days).padStart(2, '0')}`, locale)}</span></p>}
   <ul className="spending-pace-legend"><li><i className="current"/>{names[0]}</li><li><i className="previous"/>{names[1]}</li>{pace.plan !== null && <li><i className="pace"/>{t('Even pace')}</li>}</ul>
   {pace.missing && <p className="partial-total" role="status">{t('Exchange rate unavailable.')}</p>}
 </>;
}
