"use client";
import { SurplusButton } from '@/components/surplus-button';
import { AllocationDonut } from '@/components/charts-lazy';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { signTone } from '@/components/presentation-foundation/tone';
import { CalendarClock, Landmark } from 'lucide-react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { PartialTotal } from '@/components/presentation-foundation/partial-total';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { categoryColor } from '@/lib/category-colors';
import { estimatedCashFlow, financialTotals, income, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { allocationRows, assetAllocation, dueCounts, nextPayments } from '@/lib/overview';
import { otherShareKey } from '@/lib/cash-flow-report';
import { upcomingPayments, type PlanningData } from '@/lib/planning';
import { payLink } from '@/lib/recurring';
import { openProps } from '@/lib/row-open';

/** `firstVisit` greets a brand-new account with "Welcome" instead of "Welcome back". */
export function OverviewHeading({ name, firstVisit = false, children }: { name?: string; firstVisit?: boolean; children?: ReactNode }) {
 const { t } = useLanguage();
 const title = firstVisit ? (name ? t('Welcome, {name}!', { name }) : t('Welcome!')) : name ? t('Welcome back, {name}!', { name }) : t('Welcome back!');
 return <PageHeader title={title}>{children}</PageHeader>;
}

type Props = { entries: Entry[]; currency: string; excludedCurrencies: string[]; forecast: ReturnType<typeof estimatedCashFlow>; forecastReady: boolean; planning: PlanningData | null };
/** An upcoming payment opens its Sankey for its month, by click, Enter or Space, unless the tap was on its link. */

export function useOverviewCards({ entries, currency, excludedCurrencies, forecast, forecastReady, planning }: Props) {
 const { t, locale } = useLanguage();
 const { entered } = useDisplayMoney();
 // An upcoming payment opens Recurring, where its payments are listed, unless the tap was on its link.
 const router = useRouter(), openRecurring = () => router.push('/upcoming');
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const percent = (value: number | null) => formatPercent(value ?? NaN, locale, 1, 1);
 const { totalAssets, totalDebt } = financialTotals(entries);
 const allocation = assetAllocation(entries);
 const rows = allocationRows(allocation), openAssets = () => router.push('/assets');
 const rowColor = (kind: string) => kind === otherShareKey ? 'var(--muted-foreground)' : categoryColor(kind);
 const rowLabel = (kind: string) => kind === otherShareKey ? t('Other') : t(kind);
 const upcomingItems = planning ? upcomingPayments(planning.records, planning.occurrences, undefined, undefined, planning.debtPayments) : [];
 const due = nextPayments(upcomingItems);
 // The pill counts every payment, not just the rows shown, the way the dashboard's Due tile does (dueCounts): income on
 // its way is not due, and an overdue item is never "due soon".
 const counts = dueCounts(upcomingItems);
 const figure = (value: string) => <span className="panel-figure">{value}</span>;
 // Every commitment figure waits for the forecast, as Expenses does: a partial forecast never prints as a total (MONEY-008).
 const ready = (amount: number) => forecastReady ? money(amount) : '—';
 const commitments = <section className="panel overview-panel" key="commitments">
  <PanelTitle title={<>{t("Monthly commitments")} {forecastReady && figure(t('{amount} left', { amount: money(forecast.forecast) }))}</>} hint={<>
   <p>{t('Estimated asset income: {amount}', { amount: ready(forecast.estimatedIncome) })}</p>
   <p>{t('Other recurring income: {amount}', { amount: ready(forecast.otherIncome) })}</p>
   <p>{t("Yearly records are divided by 12. A category's budget counts when it is more than the bills in that category. One-time records are excluded.")}</p>
  </>}/>
  <ul className="overview-list overview-commitments">
   <li><CategoryIcon kind="Salary"/><span>{t("Income")}</span><strong className={forecastReady ? 'positive' : undefined}>{ready(forecast.plannedIncome)}</strong></li>
   <li><CategoryIcon kind="Living expense"/><span>{t("Expenses")}</span><strong>{ready(forecast.monthlyExpenses)}</strong></li>
   <li><CategoryIcon kind="Mortgage"/><span>{t("Estimated mortgage payments")}</span><strong>{ready(forecast.mortgagePayments)}</strong></li>
   {forecast.loanPayments > 0 && <li><CategoryIcon kind="Loan"/><span>{t("Estimated loan payments")}</span><strong>{ready(forecast.loanPayments)}</strong></li>}
  </ul>
  <div className="cash-footer"><span>{t("Left after expenses")}</span><strong className={forecastReady ? signTone(forecast.forecast, true) : undefined}><SurplusButton parts={forecastReady ? forecast : null} currency={currency} className="surplus-link">{forecastReady ? money(forecast.forecast) : '—'}</SurplusButton></strong></div>
 </section>;
 const allocationCard = <section className="panel overview-panel" key="allocation">
  <PanelTitle title={<>{t("Asset allocation")} {figure(money(totalAssets))}</>} hint={totalDebt > 0 ? <p>{t('Outstanding debt')}: {money(totalDebt)}</p> : undefined}><DrawerLink href="/assets">{t('View all')}</DrawerLink></PanelTitle>
  <PartialTotal currencies={excludedCurrencies}/>
  {allocation.length ? <div className="dashboard-allocation">
   {/* The donut and the list share one set of rows and colours; a slice opens Investments, as View all does. */}
   <AllocationDonut slices={rows.map(item => ({ kind: item.kind, amount: item.total, color: rowColor(item.kind), label: rowLabel(item.kind) }))} total={totalAssets} currency={currency} onSelect={openAssets}/>
   <ul className="overview-list">{rows.map(item => <li key={item.kind}><i style={{ background: rowColor(item.kind) }}/><span>{rowLabel(item.kind)}</span><strong>{money(item.total)}</strong><small>{percent(item.share)}</small></li>)}</ul>
  </div> : <EmptyState icon={<Landmark/>} description={t("Add your first asset to see its allocation.")}/>}
 </section>;
 const upcoming = <section className="panel overview-panel" key="upcoming">
  <PanelTitle title={<>{t('Upcoming payments')} {counts.overdue > 0 ? <span className="panel-figure negative">{t('{count} overdue', { count: formatNumber(counts.overdue, locale, 0) })}</span> : counts.dueSoon > 0 && figure(t('{count} due soon', { count: formatNumber(counts.dueSoon, locale, 0) }))}</>}><DrawerLink href="/upcoming">{t('View all')}</DrawerLink></PanelTitle>
  {due.length ? <ul className="overview-list overview-due">{due.map(item => {
   const incoming = income.includes(item.record.kind);
   return <li key={item.key} {...openProps(openRecurring, t('Open {name}', { name: item.record.name }))}><CategoryIcon kind={item.record.kind}/><span>{item.record.name}<small className={item.overdue ? 'negative' : undefined}>{item.overdue ? t('Overdue') + ' · ' : ''}{formatDate(item.date, locale)}</small><DrawerLink href={payLink(item.record.id, item.date)} className="overview-due-pay" aria-label={`${t('Record payment')}: ${item.record.name}`}>{t('Record payment')}</DrawerLink></span><strong className={incoming ? 'positive' : undefined}>{incoming ? '+' : ''}{entered(item.amount, item.record.currency)}</strong></li>;
  })}</ul> : planning ? <EmptyState icon={<CalendarClock/>} description={t('Nothing is due in the next 31 days.')}/> : <LoadingPlaceholder label={t('Loading records…')} rows={3}/>}
 </section>;
 return { commitments, allocation: allocationCard, upcoming };
}
