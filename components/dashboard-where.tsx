"use client";
import type { ReactNode } from 'react';
import { CalendarClock, ChartPie, ChevronRight, ReceiptText, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import type { useMonthBudget } from '@/components/dashboard-cards';
import type { HeadlineFigures } from '@/components/dashboard-headline';
import type { SpendingPaceState } from '@/components/spending-pace-card';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { otherShareKey } from '@/lib/cash-flow-report';
import { improvements, whereItGoes, type Improvement, type SpendingRow } from '@/lib/dashboard-glance';
import { formatDate, formatMoney, formatMonthYear, formatNumber, formatPercent, formatSignedMoney } from '@/lib/format';
import type { PlanningData } from '@/lib/planning';
import { payLink } from '@/lib/recurring';
import { transactionsHref } from '@/lib/transaction-list';

type Budget = ReturnType<typeof useMonthBudget>;
type Categories = PlanningData['categories'];

/** This month's spending in Transactions: one category's, or all of it. */
const spendingHref = (key?: string) => transactionsHref({ direction: 'expense', period: 'this_month', ...(key && key !== otherShareKey && { category: key }) });

/** What the dashboard's Where it is going card shows, from the reads the screen already holds: the month's spending by
 * category against last month by this day, and the lines of What to improve. Nothing is ranked while the month is
 * loading, failed or holds an amount no rate converts. */
export function dashboardGlance({ spending, budget, figures }: { spending: SpendingPaceState; budget: Budget; figures: HeadlineFigures }) {
 const known = !spending.loading && !spending.error && !spending.month.missing && !spending.before.missing;
 const where = known ? whereItGoes(spending.month.categories, spending.before.categories) : null;
 const total = figures.forecast && figures.forecast.missing === 0 ? figures.forecast.totals[0] : null;
 const improve = improvements({ overdue: figures.overdue ?? [], belowZero: total?.belowZero ?? null, over: budget.loading || budget.error || budget.missing ? [] : budget.over, mover: where?.mover ?? null });
 return { where, improve };
}

/** One category's row: its icon and name, its share of the month and its change against last month by this day (an
 * arrow and a signed amount, never colour alone), a bar sized against the largest category, and the amount. The whole
 * row opens that category's spending this month in Transactions. */
function WhereRow({ row, peak, name, mark, currency }: { row: SpendingRow; peak: number; name: string; mark: ReactNode; currency: string }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const change = Math.round(row.change);
 const compared = change > 0 ? t('{amount} more than last month by this day', { amount: money(change) }) : change < 0 ? t('{amount} less than last month by this day', { amount: money(-change) }) : t('Same as last month by this day');
 const share = formatPercent(row.share * 100, locale, 0);
 return <li data-side="expense">
  <DrawerLink href={spendingHref(row.key)} className="flow-bar-row" aria-label={`${name}: ${money(row.amount)}, ${share}. ${compared}`}>
   <span className="flow-bar-name">{mark}<span>{name}{row.mover && <> <span className="status-badge is-caution">{t('Biggest increase')}</span></>}
    <small>{share}{change !== 0 && <> · {change > 0 ? <TrendingUp size={13} aria-hidden="true"/> : <TrendingDown size={13} aria-hidden="true"/>}{formatSignedMoney(change, currency, locale)}</>}</small>
   </span></span>
   <span className="flow-bar-track" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(2, row.amount / peak * 100))}%` }}/></span>
   <strong>{money(row.amount)}</strong>
  </DrawerLink>
 </li>;
}

/** What to improve: three lines at most, each a link to where it is fixed. Nothing is drawn when there is nothing to say. */
function ImproveList({ lines, label, currency }: { lines: readonly Improvement[]; label: (key: string) => string; currency: string }) {
 const { t, locale } = useLanguage();
 if (!lines.length) return null;
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const line = (item: Improvement): { key: string; href: string; icon: ReactNode; text: string } => {
  switch (item.kind) {
   // One late payment opens its own Record payment; several open the list they are in.
   case 'overdue': return item.count > 1
    ? { key: 'overdue', href: '/upcoming', icon: <CalendarClock aria-hidden="true"/>, text: t('{count} payments are overdue', { count: formatNumber(item.count, locale, 0) }) }
    : { key: 'overdue', href: payLink(item.recordId, item.date), icon: <CalendarClock aria-hidden="true"/>, text: t('{name} is overdue', { name: item.name }) };
   case 'below_zero': return { key: 'below_zero', href: '/income-expenses#forecast', icon: <TriangleAlert aria-hidden="true"/>, text: t('Cash goes below zero on {date}', { date: formatDate(item.date, locale) }) };
   case 'over_budget': return { key: 'over:' + item.key, href: '/budget', icon: <ChartPie aria-hidden="true"/>, text: t('{name} is {amount} over budget', { name: label(item.key), amount: money(item.amount) }) };
   case 'mover': return { key: 'mover:' + item.key, href: spendingHref(item.key), icon: <TrendingUp aria-hidden="true"/>, text: t('{name} is up {amount} on last month', { name: label(item.key), amount: money(item.amount) }) };
  }
 };
 return <div className="dashboard-improve">
  <h3>{t('What to improve')}</h3>
  <ul>{lines.map(line).map(item => <li key={item.key}><DrawerLink href={item.href} className="improve-row">{item.icon}<span>{item.text}</span><ChevronRight aria-hidden="true" className="improve-row-go"/></DrawerLink></li>)}</ul>
 </div>;
}

type Props = { spending: SpendingPaceState; glance: ReturnType<typeof dashboardGlance>; categories: Categories; currency: string };

/** "Where is it going, and how do I improve?": this month's largest spending categories as ranked bars, each with its
 * share and its change against last month by this day, the biggest increase flagged; under them, What to improve. */
export function WhereCard({ spending, glance, categories, currency }: Props) {
 const { t, locale } = useLanguage();
 const category = (key: string) => categories.find(item => item.id === key);
 const label = (key: string) => key === otherShareKey ? t('Other') : category(key)?.name ?? t(key);
 const { where, improve } = glance;
 const peak = Math.max(1, ...(where?.rows ?? []).map(row => row.amount));
 return <section className="panel overview-panel dashboard-where" aria-label={t('Where it is going')}>
  <PanelTitle title={<>{t('Where it is going')} <span className="panel-figure">{formatMonthYear(spending.pace.month, locale)}</span></>} hint={t('This month’s spending by category, largest first, with each one’s share and its change against last month by this day.')}><DrawerLink href="/income-expenses">{t('View all')}</DrawerLink></PanelTitle>
  {spending.loading ? <LoadingPlaceholder label={t('Loading records…')} rows={5}/> : spending.error ? <InlineError message={t(spending.error)} onRetry={spending.retry}/>
   : !where ? <p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>
   : where.rows.length ? <ul className="flow-bars where-bars">{where.rows.map(row => <WhereRow key={row.key} row={row} peak={peak} name={label(row.key)} currency={currency}
    mark={row.key === otherShareKey ? <i className="flow-bar-dot" aria-hidden="true"/> : <CategoryIcon kind={category(row.key)?.name ?? row.key} size="sm"/>}/>)}</ul>
   : <EmptyState icon={<ReceiptText/>} description={t('Nothing recorded in this period.')}/>}
  <ImproveList lines={improve} label={label} currency={currency}/>
 </section>;
}
