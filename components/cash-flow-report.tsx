"use client";
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { chartAxis, chartColors, chartGrid, chartHeight, chartMargin, chartTooltip, chartValueAxis, groupedBar, intervalLabel, moneyTick, plannedGroupedBar } from '@/components/presentation-foundation/chart';
import { FlowBars } from '@/components/cash-flow/flow-bars';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { CashFlowDrillDialog, FlowSankey } from '@/components/cash-flow-sankey';
import type { DrillTarget } from '@/lib/cash-flow-drill';
import { drillLink, linkedTitle } from '@/lib/cash-flow-link';
import { useCashFlowData } from '@/components/cash-flow-data';
import { mainTarget } from '@/lib/cash-flow-main';
import { useLocationSearch } from '@/hooks/use-location-search';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { SankeySkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import { cashFlowReport, partialBar, periodMonths, reportPeriods, sankeyFlows, topShares, otherShareKey, trendBarsBy, trendMonths, trendTotals, type ReportPeriod, type Share, type TrendBar } from '@/lib/cash-flow-report';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
import { formatMoney, formatMonthYear, formatPercent, formatSignedMoney } from '@/lib/format';
import { marketRates, type MarketData } from '@/lib/market';
import type { PlanningData } from '@/lib/planning';
import type { TransactionSplit } from '@/lib/transaction-tools';

const periodLabels: Record<ReportPeriod, string> = { month: 'Month', quarter: 'Quarter', year: 'Year' };
const trendTitles: Record<ReportPeriod, string> = { month: 'Income and spending by month', quarter: 'Income and spending by quarter', year: 'Income and spending by year' };
type Props = { /** Opens a transaction's details, as a row on Transactions does. */onOpenRecord?: (record: Entry) => void; owner: string | null; demo: boolean; revision: number; data: PlanningData; splits: TransactionSplit[]; month: string; currency: string; market: MarketData | null; /** A compact Monthly review of `month` sits above, with its own conversion note. */ monthReviewAbove?: boolean;
 /** What the running month still expects on top of what is recorded, in `currency`: drawn as outlines on its bars. */ expected?: Expected | null };
type Expected = { income: number; spending: number };

/** One side of the breakdown: proportional bars with amount and share, the Income / Expenses panels. The largest ten
 * are named and the rest share one "Other" row, so the rows add up to the total.
 * With `onSelect`, each named bar is a button that narrows the transactions below to it. */
export function ShareBars({ items, label, colorKey, currency, onSelect }: { items: Share[]; label: (key: string) => string; colorKey: (key: string) => string; currency: string; onSelect?: (key: string) => void }) {
 const { t, locale } = useLanguage();
 if (!items.length) return <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>;
 const shown = topShares(items), peak = Math.max(...shown.map(item => item.amount));
 const name = (key: string) => key === otherShareKey ? t('Other') : label(key);
 return <ul className="share-bars">{shown.map(item => {
  const other = item.key === otherShareKey;
  const bar = <span className="share-bar" style={{ width: `${Math.max(2, item.amount / peak * 100)}%`, background: `color-mix(in srgb, ${other ? 'var(--muted-foreground)' : colorKey(item.key)} 22%, transparent)` }}><span>{name(item.key)}</span></span>;
  return <li key={item.key} title={`${name(item.key)} · ${formatMoney(item.amount, currency, locale)}`}>
   {onSelect && !other ? <button type="button" className="share-bar-button" onClick={() => onSelect(item.key)} aria-label={t('Show transactions for {name}', { name: label(item.key) })}>{bar}</button> : bar}
   <strong>{formatMoney(item.amount, currency, locale)}</strong><small>{formatPercent(item.share * 100, locale)}</small>
  </li>;
 })}</ul>;
}

/** The period's income, expenses, savings and savings rate. An amount that could not be converted leaves them unknown
 * (—), never too low, as on Budget and Reports. */
function CashFlowTiles({ report, currency }: { report: ReturnType<typeof cashFlowReport>; currency: string }) {
 const { t, locale } = useLanguage();
 const known = !report.missing, rate = known ? report.savingsRate : null;
 const tile = (value: number) => known ? formatMoney(value, currency, locale) : '—';
 return <StatTiles columns={4} label={t('Cash flow')}>
  <StatTile label={t('Income')} value={tile(report.income)} tone={known && report.income > 0 ? 'positive' : undefined}/>
  <StatTile label={t('Expenses')} value={tile(report.expenses)}/>
  <StatTile label={t('Total savings')} value={tile(report.savings)} tone={known ? signTone(report.savings) : undefined}/>
  <StatTile label={t('Savings rate')} value={rate === null ? '—' : formatPercent(rate, locale)} tone={rate === null ? undefined : signTone(rate)}/>
 </StatTiles>;
}

type Drill = { target: DrillTarget; title: string; months?: string[] };
/** The open drill-down. A link from elsewhere (a row of Goals › History or Accounts › Recent activity) opens its Sankey
 * for its month, once per distinct link; its title follows from the workspace once it is read. */
function useDrill(data: PlanningData, t: (key: string) => string, search: string, period: { months: string[]; label: string; locale: string }) {
 const [drill, setDrill] = useState<Drill | null>(null);
 const [appliedSearch, setAppliedSearch] = useState('');
 if (search !== appliedSearch) { setAppliedSearch(search); const link = drillLink(search); if (link) setDrill({ target: link.target, title: '', months: [link.month] }); }
 return {
  drill, setDrill, drillTitle: drill ? drill.title || linkedTitle(drill.target, data, t) : '',
  // A linked drill-down is for its own month; one opened here for the chosen period.
  drillMonths: drill?.months ?? period.months, drillPeriod: drill?.months ? formatMonthYear(drill.months[0], period.locale) : period.label,
 };
}

/** Income and spending per month, quarter or year. The running month's bars carry what is still expected as a planned
 * outline on top of what is recorded, and the totals of the months on screen sit under the chart. */
function TrendPanel({ trend, period, month, currency, expected }: { trend: TrendBar[]; period: ReportPeriod; month: string; currency: string; expected?: Expected | null }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 // A quarter or year still running is labelled "to date", so it is never read as a whole period beside the others.
 const partial = partialBar(month, period, depositToday());
 const barLabel = (long: boolean) => { const label = intervalLabel(period, locale, t, long); return (value: unknown) => value === partial && (long || period !== 'month') ? t('{period} to date', { period: label(value) }) : label(value); };
 const outlined = !!expected && period === 'month' && trend.some(bar => bar.period === month && bar.income !== null);
 const data = outlined ? trend.map(bar => bar.period === month ? { ...bar, expectedIncome: expected!.income, expectedExpenses: expected!.spending } : bar) : trend;
 const months = trendMonths(month, period).length, totals = trendTotals(trend, months);
 const names: Record<string, string> = { income: t('Income'), expenses: t('Expenses'), expectedIncome: t('Income still expected'), expectedExpenses: t('Spending still expected') };
 // A bar with nothing still expected leaves its line out of the tooltip; a missing amount stays, as a dash.
 const tip = (value: unknown, key: unknown) => String(key).startsWith('expected') && value == null ? null : [value === null || value === undefined ? '—' : money(Number(value)), names[String(key)] ?? String(key)];
 return <section className="panel cash-flow-trend">
  <PanelTitle title={t(trendTitles[period])}/>
  <div className="cash-flow-key"><span><i style={{ background: chartColors.income }}/>{t('Income')}</span><span><i style={{ background: chartColors.expense }}/>{t('Expenses')}</span>{outlined && <span><i className="chart-planned-key"/>{t('Expected')}</span>}</div>
  <div className="cash-flow-chart"><ResponsiveContainer width="100%" height="100%" minHeight={chartHeight.regular}>
   <BarChart data={data} barGap={2} accessibilityLayer margin={chartMargin}>
    <CartesianGrid {...chartGrid}/>
    <XAxis dataKey="period" tickFormatter={barLabel(false)} {...chartAxis}/>
    <YAxis tickFormatter={moneyTick(currency, locale)} {...chartValueAxis}/>
    <Tooltip {...chartTooltip} filterNull={false} labelFormatter={barLabel(true)} formatter={tip as never}/>
    <Bar dataKey="income" name="income" stackId="income" {...groupedBar} fill={chartColors.income}/>
    {outlined && <Bar dataKey="expectedIncome" name="expectedIncome" stackId="income" {...plannedGroupedBar}/>}
    <Bar dataKey="expenses" name="expenses" stackId="expenses" {...groupedBar} fill={chartColors.expense}/>
    {outlined && <Bar dataKey="expectedExpenses" name="expectedExpenses" stackId="expenses" {...plannedGroupedBar}/>}
   </BarChart>
  </ResponsiveContainer></div>
  <dl className="cash-flow-totals">
   <div><dt>{t('{count}-month income', { count: months })}</dt><dd>{totals ? money(totals.income) : '—'}</dd></div>
   <div><dt>{t('{count}-month spending', { count: months })}</dt><dd>{totals ? money(totals.expenses) : '—'}</dd></div>
   <div><dt>{t('Average monthly surplus')}</dt><dd className={totals ? signTone(totals.average) : undefined}>{totals ? formatSignedMoney(totals.average, currency, locale) : '—'}</dd></div>
  </dl>
 </section>;
}

type Grouping = 'category' | 'merchant';
/** What a row of the ranked bars opens: the same drill-downs the Sankey's nodes open. */
const barTarget = (grouping: Grouping, side: 'income' | 'expense' | 'left', key: string): DrillTarget => side === 'left' ? { side: 'savings' }
 : grouping === 'merchant' ? { side: 'merchant', key, income: side === 'income' } : { side, key };

type View = 'bars' | 'sankey';
type WhereProps = { report: ReturnType<typeof cashFlowReport>; flows: ReturnType<typeof sankeyFlows>; periodName: string; view: View; onView: (view: View) => void; currency: string; categories: PlanningData['categories']; onDrill: (target: DrillTarget, title: string) => void };
/** Where the period's money went: ranked bars by category or merchant, or the Sankey. Every row and node opens its own
 * Sankey in a dialog: a category, Savings, the merged "Other" (its categories) and the Income total (every income source). */
function WherePanel({ report, flows, periodName, view, onView, currency, categories, onDrill }: WhereProps) {
 const { t } = useLanguage();
 const [grouping, setGrouping] = useState<Grouping>('category');
 const category = (key: string) => categories.find(item => item.id === key);
 const byCategory = grouping === 'category', shares = report[byCategory ? 'categories' : 'merchants'];
 const label = (key: string) => byCategory ? category(key)?.name ?? t(key) : key;
 const drillOf = (index: number): DrillTarget | null => mainTarget(flows.nodes[index]);
 return <section className="panel cash-flow-where">
  <PanelTitle title={t('Where {period} went', { period: periodName })}>
   <div className="cash-flow-switches">
    {view === 'bars' && <Segmented label={t('Group by')} options={[{ value: 'category', label: t('Category') }, { value: 'merchant', label: t('Merchant') }] as const} value={grouping} onChange={setGrouping}/>}
    <Segmented label={t('Chart type')} options={[{ value: 'bars', label: t('Bars') }, { value: 'sankey', label: t('Sankey') }] as const} value={view} onChange={onView}/>
   </div>
  </PanelTitle>
  {view === 'bars' ? <FlowBars income={shares.income} expense={shares.expense} left={report.missing ? null : report.savings} label={label} currency={currency}
   icon={byCategory ? key => <CategoryIcon kind={category(key)?.name ?? key} size="sm"/> : undefined}
   onOpen={(side, key) => onDrill(barTarget(grouping, side, key), side === 'left' ? t('Savings') : label(key))}/>
  : flows.links.length ? <FlowSankey flows={flows} currency={currency} canOpen={index => !!drillOf(index)} onOpen={index => { const target = drillOf(index); if (target) onDrill(target, flows.nodes[index].name); }}/> : <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>}
 </section>;
}

/** Cash flow: figures for the period, bars over time beside where the period's money went, as ranked bars or a Sankey diagram. */
export function CashFlowReport({ onOpenRecord, owner, demo, revision, data: provided, splits, month, currency, market, monthReviewAbove = false, expected }: Props) {
 const { t, locale } = useLanguage();
 const today = depositToday();
 const [period, setPeriod] = useState<ReportPeriod>('month');
 // Ranked bars first; the Sankey is one tap away (the 2026 redesign).
 const [view, setView] = useState<View>('bars');
 const search = useLocationSearch();
 const { live, data, remote, goalEvents, throughToday } = useCashFlowData({ owner, demo, revision, provided, month, today, linked: drillLink(search)?.month });
 const rates = marketRates(market);
 const report = useMemo(() => cashFlowReport(data, splits, periodMonths(month, period), currency, today, rates), [data, splits, month, period, currency, today, rates]);
 const trend = useMemo(() => trendBarsBy(cashFlowReport(data, splits, trendMonths(month, period), currency, today, rates).series, period), [data, splits, month, period, currency, today, rates]);
 const unknown = report.missing > 0 || trend.some(bar => bar.missing > 0);
 const category = (key: string) => data.categories.find(item => item.id === key);
 const categoryName = (key: string) => category(key)?.name ?? t(key);
 const flows = sankeyFlows(report, categoryName);
 const periodName = period === 'month' ? formatMonthYear(month, locale) : `${formatMonthYear(periodMonths(month, period)[0], locale)} – ${formatMonthYear(month, locale)}`;
 const { drill, setDrill, drillTitle, drillMonths, drillPeriod } = useDrill(data, t, search, { months: periodMonths(month, period), label: periodName, locale });
 if (live && remote.initialLoading) return <section className="panel cash-flow-report"><SankeySkeleton label={t('Loading records…')} height={360}/></section>;
 if (live && remote.error) return <section className="panel cash-flow-report"><InlineError message={t(remote.error)} onRetry={remote.retry}/></section>;
 return <section className="cash-flow-report" aria-label={t('Cash flow')}>
  <div className="cash-flow-report-tools">
   <Segmented label={t('Period')} options={reportPeriods.map(value => ({ value, label: t(periodLabels[value]) }))} value={period} onChange={setPeriod}/>
  </div>
  {/* A month's figures are the page's headline tiles already; a quarter or a year adds its own (the user's choice, 20 October 2026). */}
  {period !== 'month' && <CashFlowTiles report={report} currency={currency}/>}
  {/* The compact Monthly review above already says so for the month; a quarter or a year has amounts of its own to report. */}
  {unknown && !(monthReviewAbove && period === 'month') && <p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>}
  <div className="cash-flow-report-grid" data-view={view}>
   <TrendPanel trend={trend} period={period} month={month} currency={currency} expected={expected}/>
   <WherePanel report={report} flows={flows} periodName={periodName} view={view} onView={setView} currency={currency} categories={data.categories} onDrill={(target, title) => setDrill({ target, title })}/>
  </div>
  {drill && <CashFlowDrillDialog target={drill.target} title={drillTitle} period={drillPeriod} savings={report.savings} context={{ data, splits, months: drillMonths, currency, today, rates, t, label: categoryName, locale, throughToday, goalEvents }} onClose={() => setDrill(null)} onOpenRecord={onOpenRecord}/>}
 </section>;
}
