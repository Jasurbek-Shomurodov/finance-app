"use client";
import { useMemo } from 'react';
import { Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { Button } from '@/components/ui/button';
import { signTone } from '@/components/presentation-foundation/tone';
import type { useMonthBudget } from '@/components/dashboard-cards';
import { paceDifference, type SpendingPaceState } from '@/components/spending-pace-card';
import type { ExpectedPayout } from '@/lib/investment-insights';
import { monthEnd } from '@/lib/calendar-days';
import { cashForecast, type CashForecast, type CashForecastBudget } from '@/lib/cash-forecast';
import { incomeStillExpected } from '@/lib/cash-flow-outlook';
import { safeToSpend, type SafeToSpend } from '@/lib/dashboard-glance';
import { depositToday } from '@/lib/deposit-interest';
import type { EarningSource } from '@/lib/earning-sources';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { convertAmount, marketRates, type MarketData } from '@/lib/market';
import { monthlyIncomeCards } from '@/lib/monthly-income-cards';
import { planFundingLink, unassignedSurplus } from '@/lib/goal-funding';
import { dueCounts, dueSoon } from '@/lib/overview';
import { transactionsHref } from '@/lib/transaction-list';
import { upcomingPayments, type DueItem, type PlanningData } from '@/lib/planning';

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
 /** The estimated monthly surplus; it counts only once `surplusReady`, as that figure does. */
 surplus?: number;
 surplusReady?: boolean;
 /** This month's budget and spending, read once by the screen: Safe to spend is worked out from them. */
 budget?: Budget;
 spending?: SpendingPaceState;
 /** The income sources whose estimates say what the month still expects, as Cash flow counts them. */
 sources?: EarningSource[];
 currency: string;
 market: MarketData | null;
};
type Figures = { due: ReturnType<typeof dueSoon> | null; forecast: CashForecast | null; /** The monthly surplus no goal has been given yet (`unassignedSurplus`). */ unassigned?: number | null;
 /** What may still be spent this month (`safeToSpend`); null until its reads are in, or when one failed. */ safe?: SafeToSpend | null;
 /** Payments to make whose date has passed, earliest first: What to improve names the first. */ overdue?: DueItem[] };
export type HeadlineFigures = Figures;
type Props = {
 netWorth: number;
 /** Show net worth as a tile too: only when the Net worth over time card, which leads with it, is hidden. */
 netWorthTile?: boolean;
 budget: Budget;
 /** This month's spending against last month's, shared with the Spending pace card; undefined leaves the line out. */
 spending?: SpendingPaceState;
 /** What may be spent, what is due and the cash ahead (`useHeadlineFigures`). */
 figures: Figures;
 currency: string;
};

type SafeRead = { data: PlanningData; owed: DueItem[]; budget: Budget; spending: SpendingPaceState; sources?: EarningSource[]; today: string; currency: string; rates: ReturnType<typeof marketRates> };
/** Safe to spend from the reads the dashboard already holds. Null while one is loading or failed: no figure rather
 * than one that leaves something out. Without saved budget amounts the bills alone are no budget, so the month's
 * expected income stands in (`safeToSpend`). */
function monthSafe({ data, owed, budget, spending, sources = [], today, currency, rates }: SafeRead) {
 if (budget.loading || budget.error || spending.loading || (!budget.budgeted && spending.error)) return null;
 const month = today.slice(0, 7), convert = (amount: number, from: string) => convertAmount(amount, from, currency, rates);
 const known = !spending.error && !spending.month.missing;
 return safeToSpend({
  month, due: owed, convert,
  budget: { plan: budget.budgeted ? budget.plan : 0, spent: budget.spent, covered: budget.covered, unknown: !!budget.missing },
  income: { received: known ? spending.month.received : null, spent: known ? spending.month.spent : null, expected: incomeStillExpected(monthlyIncomeCards(data.records, month, sources, today, rates), convert) },
 });
}

/** What may still be spent, what falls due within a week and the projected cash, worked out once: the screen places the
 * headline in two spots and shows one, by the room it has. The projection waits for the saved Budget, since it spends
 * what is left of it. */
export function useHeadlineFigures({ data, forecastBudget, payouts, forecastLoading = false, forecastError = false, surplus, surplusReady = false, budget, spending, sources, currency, market }: Input): Figures {
 const rates = marketRates(market), today = depositToday();
 const due = useMemo(() => data ? dueSoon(data, today, 7, currency, rates) : null, [data, today, currency, rates]);
 const forecast = useMemo(() => !data || forecastLoading || forecastError ? null : cashForecast({ records: data.records, occurrences: data.occurrences, debtPayments: data.debtPayments, budget: forecastBudget, payouts, today, days: 90, currency, rates }), [data, forecastBudget, payouts, forecastLoading, forecastError, today, currency, rates]);
 const unassigned = useMemo(() => data ? unassignedSurplus(data.goals, surplusReady && surplus !== undefined ? surplus : null, currency, today, rates) : null, [data, surplus, surplusReady, currency, today, rates]);
 // Every open due date through the end of the month, overdue ones included: what Safe to spend may still owe.
 const owed = data ? upcomingPayments(data.records, data.occurrences, today, monthEnd(today.slice(0, 7)), data.debtPayments) : null;
 const safe = data && owed && budget && spending ? monthSafe({ data, owed, budget, spending, sources, today, currency, rates }) : null;
 const overdue = owed ? dueCounts(owed).payments.filter(item => item.overdue) : [];
 return { due, forecast, unassigned, safe, overdue };
}

/** Safe to spend: what can still be spent this month without breaking the plan (`safeToSpend`), or how far over it is,
 * said by the label as well as the colour. The whole tile opens Budget; the ⓘ, which sits above that link, says in one
 * sentence what the figure counts. An amount no rate converts leaves it unknown (—) with the note, never a partial sum. */
function SafeTile({ safe, currency }: { safe?: SafeToSpend | null; currency: string }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const amount = safe?.amount ?? null, over = amount !== null && amount < 0;
 const limit = safe && safe.limit !== null && safe.limit > 0 ? safe.limit : null;
 const hint = safe?.basis === 'income'
  ? t('With no budget set: the income expected this month, minus what you have spent and everything still due this month.')
  : t('This month’s budget, minus what you have spent and the payments still due this month that no budget category covers.');
 return <article className="stat-tile stat-tile-link stat-tile-covered">
  <h3><DrawerLink href="/budget" className="stat-tile-cover">{t(over ? 'Over by' : 'Safe to spend')}</DrawerLink><InfoHint>{hint}</InfoHint></h3>
  <strong className={amount === null ? undefined : signTone(amount)}><RollingText text={amount === null ? '—' : money(Math.abs(amount))}/></strong>
  {safe && amount === null && <p>{t('Exchange rate unavailable.')}</p>}
  {amount !== null && limit !== null && <>
   <div className={over ? 'stat-tile-bar negative' : 'stat-tile-bar'}><i style={{ width: `${Math.min(100, Math.max(0, (limit - amount) / limit * 100))}%` }}/></div>
   <p>{safe!.basis === 'budget' ? t('{amount} planned', { amount: money(limit) }) : t('of {amount} expected', { amount: money(limit) })}{!!safe!.due && Math.round(safe!.due) > 0 && <> · {t('{amount} still due this month', { amount: money(safe!.due) })}</>}</p>
  </>}
 </article>;
}

/** This month's spending, and how far ahead of or behind last month it is by this day. The figure is the Monthly
 * review's (`monthlyReview.spent`, every category), the same one its trend compares and the Spending pace card draws;
 * the Budget card's `spent` (excluded categories dropped) only stands in until the pace is known. A read that failed,
 * or an amount no rate converts, leaves the figure unknown (—), never a partial total. */
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

/** The dashboard's key figures, beside the Net worth over time card: what is safe to spend, this month's spending, what
 * falls due within a week and the lowest cash ahead, each a link to the page behind it. The budget figures are the
 * Budget card's own (useMonthBudget), worked out once. */
export function DashboardHeadline({ netWorth, netWorthTile = false, budget, spending, figures, currency }: Props) {
 const { t, locale } = useLanguage();
 return <StatTiles columns={netWorthTile ? 'auto' : 2} label={t('Overview')}>
  {netWorthTile && <StatTile label={t('Net worth')} value={formatMoney(netWorth, currency, locale)} href="/assets"/>}
  <SafeTile safe={figures.safe} currency={currency}/>
  <SpentTile budget={budget} spending={spending} currency={currency}/>
  <DueTile due={figures.due} currency={currency}/>
  <LowestBalanceTile forecast={figures.forecast}/>
  <SurplusNudge unassigned={figures.unassigned} currency={currency}/>
 </StatTiles>;
}
