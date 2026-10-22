"use client";
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import type { useMonthBudget } from '@/components/dashboard-cards';
import { paceDifference, type SpendingPaceState } from '@/components/spending-pace-card';
import { cashForecast, type CashForecastBudget } from '@/lib/cash-forecast';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { marketRates, type MarketData } from '@/lib/market';
import { dueSoon } from '@/lib/overview';
import { transactionsHref } from '@/lib/transaction-list';
import type { PlanningData } from '@/lib/planning';

type Budget = ReturnType<typeof useMonthBudget>;
type Rates = ReturnType<typeof marketRates>;
type Props = {
 netWorth: number | null;
 /** Show net worth as a tile too: only when the Net worth over time card, which leads with it, is hidden. */
 netWorthTile?: boolean;
 budget: Budget;
 /** This month's spending against last month's, shared with the Spending card; undefined leaves the line out. */
 spending?: SpendingPaceState;
 /** Null until the planning read is in. */
 data: PlanningData | null;
 /** The budget lines the cash forecast spends, as on the Lowest balance ahead card; undefined while they load. */
 forecastBudget?: CashForecastBudget;
 forecastLoading?: boolean;
 /** The saved Budget could not be read: the projection would leave its spending out. */
 forecastError?: boolean;
 currency: string;
 market: MarketData | null;
};

/** This month's spending, and how far ahead of or behind last month it is by this day. */
function SpentTile({ budget, spending, currency }: { budget: Budget; spending?: SpendingPaceState; currency: string }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const difference = spending ? paceDifference(spending) : null;
 return <StatTile label={t('Spent this month')} value={budget.loading ? '—' : money(budget.spent)} href={transactionsHref({ direction: 'expense', period: 'this_month' })}>
  {difference !== null && <p className="stat-tile-trend">
   {difference !== 0 && (difference < 0 ? <TrendingDown size={14} aria-hidden="true" className="positive"/> : <TrendingUp size={14} aria-hidden="true"/>)}
   <span>{difference > 0 ? t('{amount} more than last month by this day', { amount: money(difference) }) : difference < 0 ? t('{amount} less than last month by this day', { amount: money(-difference) }) : t('Same as last month by this day')}</span>
  </p>}
 </StatTile>;
}

/** What is left of this month's budget, or how far over it is, with how much of the plan is spent. */
function BudgetTile({ budget, currency }: { budget: Budget; currency: string }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const plan = budget.plan !== null && budget.plan > 0 ? budget.plan : null;
 const left = plan === null || budget.loading ? null : plan - budget.spent;
 // The figure alone, so it fits the tile; whether it is left or over is in the label.
 return <StatTile label={t(left !== null && left < 0 ? 'Over budget' : 'Budget left')} value={left === null ? '—' : money(Math.abs(left))} tone={left === null ? undefined : signTone(left)} href="/budget">
  {left !== null && plan !== null && <>
   <div className={left < 0 ? 'stat-tile-bar negative' : 'stat-tile-bar'}><i style={{ width: `${Math.min(100, Math.max(0, budget.spent / plan * 100))}%` }}/></div>
   <p>{t('{spent} of {plan} spent', { spent: money(budget.spent), plan: money(plan) })}</p>
  </>}
 </StatTile>;
}

/** Bills due within a week: their total, how many, and which one comes next. */
function DueTile({ data, currency, rates }: { data: PlanningData | null; currency: string; rates: Rates }) {
 const { t, locale } = useLanguage();
 const today = depositToday();
 const due = data ? dueSoon(data, today, 7, currency, rates) : null;
 return <StatTile label={t('Due in 7 days')} value={due?.total == null ? '—' : formatMoney(due.total, currency, locale)} href="/upcoming">
  {due?.next && <p className="stat-tile-line">
   <span className="status-badge is-caution">{t('{count} due soon', { count: formatNumber(due.count, locale, 0) })}</span>
   <span>{t('Next: {name}', { name: due.next.name })} · {due.next.date < today ? <span className="negative">{t('Overdue')}</span> : due.next.date === today ? t('Today') : formatDate(due.next.date, locale)}</span>
  </p>}
 </StatTile>;
}

/** The lowest total cash balance in the next 90 days and the day it falls, or the day cash goes below zero. It waits
 * for the saved Budget, since the projection spends what is left of it, and shows no figure while any amount has no
 * rate to the display currency (MONEY-008). */
function LowestBalanceTile({ data, budget, loading, failed, currency, rates }: { data: PlanningData | null; budget?: CashForecastBudget; loading: boolean; failed: boolean; currency: string; rates: Rates }) {
 const { t, locale } = useLanguage();
 const forecast = !data || loading || failed ? null : cashForecast({ records: data.records, occurrences: data.occurrences, debtPayments: data.debtPayments, budget, today: depositToday(), days: 90, currency, rates });
 const total = forecast && forecast.missing === 0 ? forecast.totals[0] ?? null : null;
 return <StatTile label={t('Lowest balance ahead')} value={total ? formatMoney(total.lowest.balance, total.currency, locale) : '—'} tone={total ? signTone(total.lowest.balance, true) : undefined} href="/income-expenses#forecast">
  {forecast && forecast.missing > 0 ? <p>{t('Exchange rate unavailable.')}</p>
   : total?.belowZero ? <p className="negative">{t('Below zero on {date}', { date: formatDate(total.belowZero, locale) })}</p>
   : total && <p>{formatDate(total.lowest.date, locale)} · {t(total.name)}</p>}
 </StatTile>;
}

/** The dashboard's key figures, beside the Net worth over time card: this month's spending and budget, what falls due
 * within a week and the lowest cash ahead, each a link to the page behind it. The budget figures are the Budget card's
 * own (useMonthBudget), worked out once. */
export function DashboardHeadline({ netWorth, netWorthTile = false, budget, spending, data, forecastBudget, forecastLoading = false, forecastError = false, currency, market }: Props) {
 const { t, locale } = useLanguage();
 const rates = marketRates(market);
 return <StatTiles columns={netWorthTile ? 'auto' : 2} label={t('Overview')}>
  {netWorthTile && <StatTile label={t('Net worth')} value={netWorth === null ? '—' : formatMoney(netWorth, currency, locale)} href="/assets"/>}
  <SpentTile budget={budget} spending={spending} currency={currency}/>
  <BudgetTile budget={budget} currency={currency}/>
  <DueTile data={data} currency={currency} rates={rates}/>
  <LowestBalanceTile data={data} budget={forecastBudget} loading={forecastLoading} failed={forecastError} currency={currency} rates={rates}/>
 </StatTiles>;
}
