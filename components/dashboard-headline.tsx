"use client";
import { useMemo } from 'react';
import { Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { Button } from '@/components/ui/button';
import { signTone } from '@/components/presentation-foundation/tone';
import type { useMonthBudget } from '@/components/dashboard-cards';
import { paceDifference, type SpendingPaceState } from '@/components/spending-pace-card';
import type { ExpectedPayout } from '@/lib/investment-insights';
import { cashForecast, type CashForecast, type CashForecastBudget } from '@/lib/cash-forecast';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { marketRates, type MarketData } from '@/lib/market';
import { planFundingLink, unassignedSurplus } from '@/lib/goal-funding';
import { dueSoon } from '@/lib/overview';
import { transactionsHref } from '@/lib/transaction-list';
import type { PlanningData } from '@/lib/planning';

type Budget = ReturnType<typeof useMonthBudget>;
type Input = {
 /** Null until the planning read is in. */
 data: PlanningData | null;
 /** The budget lines the cash forecast spends, as on the Lowest balance ahead card; undefined while they load. */
 forecastBudget?: CashForecastBudget;
 /** Payouts expected from holdings, which the projection counts as the Forecast view does. */
 payouts?: readonly ExpectedPayout[];
 forecastLoading?: boolean;
 /** The saved Budget or this month's spending could not be read: the projection would count it wrongly. */
 forecastError?: boolean;
 /** The estimated monthly surplus ("Left after expenses"); it counts only once `surplusReady`, as that figure does. */
 surplus?: number;
 surplusReady?: boolean;
 currency: string;
 market: MarketData | null;
};
type Figures = { due: ReturnType<typeof dueSoon> | null; forecast: CashForecast | null; /** The monthly surplus no goal has been given yet (`unassignedSurplus`). */ unassigned?: number | null };
type Props = {
 netWorth: number;
 /** Show net worth as a tile too: only when the Net worth over time card, which leads with it, is hidden. */
 netWorthTile?: boolean;
 budget: Budget;
 /** This month's spending against last month's, shared with the Spending card; undefined leaves the line out. */
 spending?: SpendingPaceState;
 /** What is due and the cash ahead (`useHeadlineFigures`). */
 figures: Figures;
 currency: string;
};

/** What falls due within a week and the projected cash, worked out once: the screen places the headline in two spots and
 * shows one, by the room it has. The projection waits for the saved Budget, since it spends what is left of it. */
export function useHeadlineFigures({ data, forecastBudget, payouts, forecastLoading = false, forecastError = false, surplus, surplusReady = false, currency, market }: Input): Figures {
 const rates = marketRates(market), today = depositToday();
 const due = useMemo(() => data ? dueSoon(data, today, 7, currency, rates) : null, [data, today, currency, rates]);
 const forecast = useMemo(() => !data || forecastLoading || forecastError ? null : cashForecast({ records: data.records, occurrences: data.occurrences, debtPayments: data.debtPayments, budget: forecastBudget, payouts, today, days: 90, currency, rates }), [data, forecastBudget, payouts, forecastLoading, forecastError, today, currency, rates]);
 const unassigned = useMemo(() => data ? unassignedSurplus(data.goals, surplusReady && surplus !== undefined ? surplus : null, currency, today, rates) : null, [data, surplus, surplusReady, currency, today, rates]);
 return useMemo(() => ({ due, forecast, unassigned }), [due, forecast, unassigned]);
}

/** This month's spending, and how far ahead of or behind last month it is by this day. The figure is the Spending card's
 * (`monthlyReview.spent`, every category), the same one its trend compares, so the tile and the card agree; the Budget
 * card's `spent` (excluded categories dropped) only stands in until the pace is known. A read that failed, or an amount no
 * rate converts, leaves the figure unknown (—), never a partial total. */
function SpentTile({ budget, spending, currency }: { budget: Budget; spending?: SpendingPaceState; currency: string }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const difference = spending ? paceDifference(spending) : null;
 const spent = spending?.pace ? { loading: spending.loading, value: spending.pace.spent, failed: !!spending.error, missing: !!spending.pace.missing } : { loading: budget.loading, value: budget.spent, failed: !!budget.error, missing: !!budget.missing };
 return <StatTile label={t('Spent this month')} value={spent.loading || spent.failed || spent.missing ? '—' : money(spent.value)} href={transactionsHref({ direction: 'expense', period: 'this_month' })}>
  {!spent.loading && !spent.failed && spent.missing && <p>{t('Exchange rate unavailable.')}</p>}
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
 const failed = !!budget.error, missing = !failed && !!budget.missing;
 const left = plan === null || budget.loading || failed || missing ? null : plan - budget.spent;
 // The figure alone, so it fits the tile; whether it is left or over is in the label.
 return <StatTile label={t(left !== null && left < 0 ? 'Over budget' : 'Budget left')} value={left === null ? '—' : money(Math.abs(left))} tone={left === null ? undefined : signTone(left)} href="/budget">
  {missing && !budget.loading && <p>{t('Exchange rate unavailable.')}</p>}
  {left !== null && plan !== null && <>
   <div className={left < 0 ? 'stat-tile-bar negative' : 'stat-tile-bar'}><i style={{ width: `${Math.min(100, Math.max(0, budget.spent / plan * 100))}%` }}/></div>
   <p>{t('{spent} of {plan} spent', { spent: money(budget.spent), plan: money(plan) })}</p>
  </>}
 </StatTile>;
}

/** Bills due within a week: their total, how many, and which one comes next. */
function DueTile({ due, currency }: { due: Figures['due']; currency: string }) {
 const { t, locale } = useLanguage();
 const today = depositToday();
 const overdue = due?.overdue ?? 0;
 return <StatTile label={t('Due in 7 days')} value={due?.total == null ? '—' : formatMoney(due.total, currency, locale)} href="/upcoming">
  {due?.next && <p className="stat-tile-line">
   {overdue > 0 ? <span className="status-badge is-overdue">{t('{count} overdue', { count: formatNumber(overdue, locale, 0) })}</span> : <span className="status-badge is-caution">{t('{count} due soon', { count: formatNumber(due.count, locale, 0) })}</span>}
   <span>{t('Next: {name}', { name: due.next.name })} · {due.next.date < today ? <span className="negative">{t('Overdue')}</span> : due.next.date === today ? t('Today') : formatDate(due.next.date, locale)}</span>
  </p>}
 </StatTile>;
}

/** The lowest total cash balance in the next 90 days and the day it falls, or the day cash goes below zero. It shows no
 * figure while any amount has no rate to the display currency (MONEY-008). */
function LowestBalanceTile({ forecast }: { forecast: Figures['forecast'] }) {
 const { t, locale } = useLanguage();
 const total = forecast && forecast.missing === 0 ? forecast.totals[0] ?? null : null;
 return <StatTile label={t('Lowest balance ahead')} value={total ? formatMoney(total.lowest.balance, total.currency, locale) : '—'} tone={total ? signTone(total.lowest.balance, true) : undefined} href="/income-expenses#forecast">
  {forecast && forecast.missing > 0 ? <p>{t('Exchange rate unavailable.')}</p>
   : total?.belowZero ? <p className="negative">{t('Below zero on {date}', { date: formatDate(total.belowZero, locale) })}</p>
   : total && <p>{formatDate(total.lowest.date, locale)} · {t(total.name)}</p>}
 </StatTile>;
}

/** A nudge under the figures while part of the monthly surplus has no goal: the amount, and the way to Plan funding on
 * Goals. It shows nothing when everything is assigned or the surplus is unknown. */
function SurplusNudge({ unassigned, currency }: { unassigned?: number | null; currency: string }) {
 const { t, locale } = useLanguage();
 if (unassigned == null || Math.round(unassigned) < 1) return null;
 return <article className="stat-tile surplus-nudge">
  <span className="surplus-nudge-mark" aria-hidden="true"><Sparkles size={18}/></span>
  <div><h3>{t('Unassigned monthly surplus')}</h3><strong>{formatMoney(unassigned, currency, locale)}</strong></div>
  <Button asChild variant="outline" size="sm"><DrawerLink href={planFundingLink}>{t('Plan funding')}</DrawerLink></Button>
 </article>;
}

/** The dashboard's key figures, beside the Net worth over time card: this month's spending and budget, what falls due
 * within a week and the lowest cash ahead, each a link to the page behind it. The budget figures are the Budget card's
 * own (useMonthBudget), worked out once. */
export function DashboardHeadline({ netWorth, netWorthTile = false, budget, spending, figures, currency }: Props) {
 const { t, locale } = useLanguage();
 return <StatTiles columns={netWorthTile ? 'auto' : 2} label={t('Overview')}>
  {netWorthTile && <StatTile label={t('Net worth')} value={formatMoney(netWorth, currency, locale)} href="/assets"/>}
  <SpentTile budget={budget} spending={spending} currency={currency}/>
  <BudgetTile budget={budget} currency={currency}/>
  <DueTile due={figures.due} currency={currency}/>
  <LowestBalanceTile forecast={figures.forecast}/>
  <SurplusNudge unassigned={figures.unassigned} currency={currency}/>
 </StatTiles>;
}
