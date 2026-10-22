"use client";
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { NetWorthSparkline } from '@/components/charts-lazy';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import type { useMonthBudget } from '@/components/dashboard-cards';
import { cashForecast, type CashForecastBudget } from '@/lib/cash-forecast';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate, formatMoney, formatNumber, formatPercent, formatSignedMoney } from '@/lib/format';
import { marketRates, type MarketData } from '@/lib/market';
import type { netWorthTrend } from '@/lib/net-worth-series';
import { dueSoon } from '@/lib/overview';
import { transactionsHref } from '@/lib/transaction-list';
import type { PlanningData } from '@/lib/planning';

type Trend = ReturnType<typeof netWorthTrend>;
type Props = {
 netWorth: number | null;
 /** How net worth moved over the last year; null until the history is in. */
 trend?: Trend | null;
 budget: ReturnType<typeof useMonthBudget>;
 /** Null until the planning read is in. */
 data: PlanningData | null;
 /** The budget lines the cash forecast spends, as on the Lowest balance ahead card; undefined while they load. */
 forecastBudget?: CashForecastBudget;
 forecastLoading?: boolean;
 currency: string;
 market: MarketData | null;
};

/** The hero: net worth, how it moved over the last year (or the whole history when shorter), and its line. */
function NetWorthHero({ netWorth, trend, currency }: { netWorth: number | null; trend: Trend | null; currency: string }) {
 const { t, locale } = useLanguage();
 const change = trend?.change ?? null, Arrow = change !== null && change < 0 ? TrendingDown : TrendingUp;
 return <div className="dashboard-headline-hero">
  <StatTile label={t('Net worth over time')} value={netWorth === null ? '—' : formatMoney(netWorth, currency, locale)} href="/assets">
   {change !== null && <p className="dashboard-headline-change">
    <span className={`overview-delta ${signTone(change) ?? ''}`}><Arrow size={15} aria-hidden="true"/>{formatSignedMoney(change, currency, locale)}{trend?.percent != null && <> · {trend.percent > 0 ? '+' : ''}{formatPercent(trend.percent, locale)}</>}</span>
    <span>{trend?.fullYear ? t('{days} days', { days: formatNumber(365, locale, 0) }) : t('All history')}</span>
   </p>}
   {trend && trend.values.length > 1 && <NetWorthSparkline values={trend.values}/>}
  </StatTile>
 </div>;
}

/** What is left of this month's budget, or how far over it is, with how much of the plan is used. */
function BudgetTile({ budget, currency }: { budget: ReturnType<typeof useMonthBudget>; currency: string }) {
 const { t, locale } = useLanguage();
 const plan = budget.plan !== null && budget.plan > 0 ? budget.plan : null;
 const left = plan === null || budget.loading ? null : plan - budget.spent;
 // The figure alone, so it fits the tile; whether it is left or over is in the label.
 return <StatTile label={t(left !== null && left < 0 ? 'Over budget' : 'Budget left')} value={left === null ? '—' : formatMoney(Math.abs(left), currency, locale)} tone={left === null ? undefined : signTone(left)} href="/budget">
  {left !== null && plan !== null && <>
   <div className={left < 0 ? 'stat-tile-bar negative' : 'stat-tile-bar'}><i style={{ width: `${Math.min(100, Math.max(0, budget.spent / plan * 100))}%` }}/></div>
   <p>{t('of {amount}', { amount: formatMoney(plan, currency, locale) })}</p>
  </>}
 </StatTile>;
}

/** The primary currency's lowest cash balance in the next 90 days, as the Lowest balance ahead card leads with it;
 * that card lists every currency. */
function LowestBalanceTile({ data, budget, loading, currency, rates }: { data: PlanningData | null; budget?: CashForecastBudget; loading: boolean; currency: string; rates: ReturnType<typeof marketRates> }) {
 const { t, locale } = useLanguage();
 const lowest = !data || loading ? null : cashForecast({ records: data.records, occurrences: data.occurrences, debtPayments: data.debtPayments, budget, today: depositToday(), days: 90, currency, rates }).totals[0] ?? null;
 return <StatTile label={t('Lowest balance ahead')} value={lowest ? formatMoney(lowest.lowest.balance, lowest.currency, locale) : '—'} tone={lowest ? signTone(lowest.lowest.balance, true) : undefined} href="/income-expenses#forecast">
  {lowest && <p>{formatDate(lowest.lowest.date, locale)}</p>}
 </StatTile>;
}

/** The dashboard's first row: net worth over time as the hero, beside four figures for this month and the weeks
 * ahead. Each is a link to the page behind it. The budget figures are the Budget card's own (useMonthBudget). */
export function DashboardHeadline({ netWorth, trend = null, budget, data, forecastBudget, forecastLoading = false, currency, market }: Props) {
 const { t, locale } = useLanguage();
 const rates = marketRates(market);
 const due = data ? dueSoon(data, depositToday(), 7, currency, rates) : null;
 return <div className="dashboard-headline" role="group" aria-label={t('Overview')}>
  <NetWorthHero netWorth={netWorth} trend={trend} currency={currency}/>
  <StatTiles columns={2}>
   <StatTile label={t('Spent this month')} value={budget.loading ? '—' : formatMoney(budget.spent, currency, locale)} href={transactionsHref({ direction: 'expense', period: 'this_month' })}/>
   <BudgetTile budget={budget} currency={currency}/>
   <StatTile label={t('Due in 7 days')} value={due?.total == null ? '—' : formatMoney(due.total, currency, locale)} href="/upcoming" aside={due && t('{count} due soon', { count: formatNumber(due.count, locale, 0) })}/>
   <LowestBalanceTile data={data} budget={forecastBudget} loading={forecastLoading} currency={currency} rates={rates}/>
  </StatTiles>
 </div>;
}
