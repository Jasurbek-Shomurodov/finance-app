"use client";
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { chartAxis, chartColors, chartGrid, chartHeight, chartMargin, chartTooltip, chartValueAxis, groupedBar, intervalLabel, leadLine, moneyTick, plannedGroupedBar, referenceLine } from '@/components/presentation-foundation/chart';
import { FlowBars } from '@/components/cash-flow/flow-bars';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { CashFlowDrillDialog, FlowSankey } from '@/components/cash-flow-sankey';
import type { DrillTarget } from '@/lib/cash-flow-drill';
import { drillLink, linkedTitle } from '@/lib/cash-flow-link';
import { useCashFlowData } from '@/components/cash-flow-data';
import { mainTarget } from '@/lib/cash-flow-main';
import { useLocationSearch } from '@/hooks/use-location-search';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { CashFlowReportSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { signTone } from '@/components/presentation-foundation/tone';
import { allPeriodsLink } from '@/lib/add-links';
import { cashFlowReport, partialBar, sankeyFlows, trendBarsBy, trendMonths, trendTotals, type TrendBar } from '@/lib/cash-flow-report';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
import { formatMoney, formatMonthYear, formatSignedMoney } from '@/lib/format';
import { marketRates, type MarketData } from '@/lib/market';
import type { PlanningData } from '@/lib/planning';
import type { TransactionSplit } from '@/lib/transaction-tools';

/** Bars or the money flow diagram in Where the month went; the screen keeps it, so a link (`#flow`) can open the diagram. */
export type FlowView = 'bars' | 'sankey';
/** The months of bars Cash flow keeps beside the month it shows; every period is on Reports. */
const recentMonths = 6;
type Props = { /** Opens a transaction's details, as a row on Transactions does. */onOpenRecord?: (record: Entry) => void; owner: string | null; demo: boolean; revision: number; data: PlanningData; splits: TransactionSplit[]; month: string; currency: string; market: MarketData | null; /** A compact Monthly review of `month` sits above, with its own conversion note. */ monthReviewAbove?: boolean;
 /** What the running month still expects on top of what is recorded, in `currency`: drawn as outlines on its bars. */ expected?: Expected | null;
 view: FlowView; onView: (view: FlowView) => void };
type Expected = { income: number; spending: number };

type Drill = { target: DrillTarget; title: string; months?: string[] };
/** The open drill-down. A link from elsewhere (a row of Goals › History or Accounts › Recent activity) opens its Sankey
 * for its month, once per distinct link; its title follows from the workspace once it is read. */
function useDrill(data: PlanningData, t: (key: string) => string, search: string, period: { months: string[]; label: string; locale: string }) {
 const [drill, setDrill] = useState<Drill | null>(null);
 const [appliedSearch, setAppliedSearch] = useState('');
 if (search !== appliedSearch) { setAppliedSearch(search); const link = drillLink(search); if (link) setDrill({ target: link.target, title: '', months: [link.month] }); }
 return {
  drill, setDrill, drillTitle: drill ? drill.title || linkedTitle(drill.target, data, t) : '',
  // A linked drill-down is for its own month; one opened here for the month shown.
  drillMonths: drill?.months ?? period.months, drillPeriod: drill?.months ? formatMonthYear(drill.months[0], period.locale) : period.label,
 };
}

/** Income and spending of the recent months as bars, with each month's net as a line and the average net as a guide.
 * The running month's bars carry what is still expected as a planned outline on top of what is recorded. Every other
 * period (a quarter, a year, any business) is on Reports, one link away. */
function TrendPanel({ trend, month, currency, expected }: { trend: TrendBar[]; month: string; currency: string; expected?: Expected | null }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 // A month still running is labelled "to date", so it is never read as a whole month beside the others.
 const partial = partialBar(month, 'month', depositToday());
 const barLabel = (long: boolean) => { const label = intervalLabel('month', locale, t, long); return (value: unknown) => value === partial && long ? t('{period} to date', { period: label(value) }) : label(value); };
 const outlined = !!expected && trend.some(bar => bar.period === month && bar.income !== null);
 const data = trend.map(bar => ({ ...bar, net: bar.income === null || bar.expenses === null ? null : bar.income - bar.expenses, ...(outlined && bar.period === month ? { expectedIncome: expected!.income, expectedExpenses: expected!.spending } : {}) }));
 const totals = trendTotals(trend, trend.length);
 const names: Record<string, string> = { income: t('Income'), expenses: t('Expenses'), net: t('Net'), expectedIncome: t('Income still expected'), expectedExpenses: t('Spending still expected') };
 // A bar with nothing still expected leaves its line out of the tooltip; a missing amount stays, as a dash.
 const tip = (value: unknown, key: unknown) => String(key).startsWith('expected') && value == null ? null : [value === null || value === undefined ? '—' : key === 'net' ? formatSignedMoney(Number(value), currency, locale) : money(Number(value)), names[String(key)] ?? String(key)];
 return <section className="panel cash-flow-trend">
  <PanelTitle title={t('Income and spending by month')}><DrawerLink href={allPeriodsLink}>{t('See all periods')}</DrawerLink></PanelTitle>
  <div className="cash-flow-key"><span><i style={{ background: chartColors.income }}/>{t('Income')}</span><span><i style={{ background: chartColors.expense }}/>{t('Expenses')}</span><span><i style={{ background: leadLine.stroke }}/>{t('Net')}</span>{outlined && <span><i className="chart-planned-key"/>{t('Expected')}</span>}</div>
  <div className="cash-flow-chart"><ResponsiveContainer width="100%" height="100%" minHeight={chartHeight.compact}>
   <ComposedChart data={data} barGap={2} accessibilityLayer margin={chartMargin}>
    <CartesianGrid {...chartGrid}/>
    <XAxis dataKey="period" tickFormatter={barLabel(false)} {...chartAxis}/>
    <YAxis tickFormatter={moneyTick(currency, locale)} {...chartValueAxis}/>
    <Tooltip {...chartTooltip} filterNull={false} labelFormatter={barLabel(true)} formatter={tip as never}/>
    <Bar dataKey="income" name="income" stackId="income" {...groupedBar} fill={chartColors.income}/>
    {outlined && <Bar dataKey="expectedIncome" name="expectedIncome" stackId="income" {...plannedGroupedBar}/>}
    <Bar dataKey="expenses" name="expenses" stackId="expenses" {...groupedBar} fill={chartColors.expense}/>
    {outlined && <Bar dataKey="expectedExpenses" name="expectedExpenses" stackId="expenses" {...plannedGroupedBar}/>}
    {totals && <ReferenceLine y={totals.average} {...referenceLine}/>}
    <Line dataKey="net" name="net" {...leadLine}/>
   </ComposedChart>
  </ResponsiveContainer></div>
  <dl className="cash-flow-totals">
   <div><dt>{t('Average monthly surplus')}</dt><dd className={totals ? signTone(totals.average) : undefined}>{totals ? formatSignedMoney(totals.average, currency, locale) : '—'}</dd></div>
  </dl>
 </section>;
}

type Grouping = 'category' | 'merchant';
/** What a row of the ranked bars opens: the same drill-downs the Sankey's nodes open. */
const barTarget = (grouping: Grouping, side: 'income' | 'expense' | 'left', key: string): DrillTarget => side === 'left' ? { side: 'savings' }
 : grouping === 'merchant' ? { side: 'merchant', key, income: side === 'income' } : { side, key };

type WhereProps = { report: ReturnType<typeof cashFlowReport>; flows: ReturnType<typeof sankeyFlows>; periodName: string; view: FlowView; onView: (view: FlowView) => void; currency: string; categories: PlanningData['categories']; onDrill: (target: DrillTarget, title: string) => void };
/** Where the month's money went: ranked bars by category or merchant, or the Sankey. Every row and node opens its own
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

/** Cash flow's month: the recent months as bars beside where this month's money went, as ranked bars or the money flow
 * diagram. A quarter, a year or one business is a report: Reports has every period. */
export function CashFlowReport({ onOpenRecord, owner, demo, revision, data: provided, splits, month, currency, market, monthReviewAbove = false, expected, view, onView }: Props) {
 const { t, locale } = useLanguage();
 const today = depositToday();
 const search = useLocationSearch();
 const { live, data, remote, goalEvents, throughToday } = useCashFlowData({ owner, demo, revision, provided, month, today, linked: drillLink(search)?.month });
 const rates = marketRates(market);
 const report = useMemo(() => cashFlowReport(data, splits, [month], currency, today, rates), [data, splits, month, currency, today, rates]);
 const trend = useMemo(() => trendBarsBy(cashFlowReport(data, splits, trendMonths(month, 'month').slice(-recentMonths), currency, today, rates).series, 'month'), [data, splits, month, currency, today, rates]);
 const unknown = report.missing > 0 || trend.some(bar => bar.missing > 0);
 const category = (key: string) => data.categories.find(item => item.id === key);
 const categoryName = (key: string) => category(key)?.name ?? t(key);
 const flows = sankeyFlows(report, categoryName);
 const periodName = formatMonthYear(month, locale);
 const { drill, setDrill, drillTitle, drillMonths, drillPeriod } = useDrill(data, t, search, { months: [month], label: periodName, locale });
 if (live && remote.initialLoading) return <CashFlowReportSkeleton label={t('Loading records…')}/>;
 if (live && remote.error) return <section className="panel cash-flow-report"><InlineError message={t(remote.error)} onRetry={remote.retry}/></section>;
 return <section className="cash-flow-report" aria-label={t('Cash flow')}>
  {/* The compact Monthly review above already says so for the month. */}
  {unknown && !monthReviewAbove && <p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>}
  <div className="cash-flow-report-grid" data-view={view}>
   <TrendPanel trend={trend} month={month} currency={currency} expected={expected}/>
   <WherePanel report={report} flows={flows} periodName={periodName} view={view} onView={onView} currency={currency} categories={data.categories} onDrill={(target, title) => setDrill({ target, title })}/>
  </div>
  {drill && <CashFlowDrillDialog target={drill.target} title={drillTitle} period={drillPeriod} savings={report.savings} context={{ data, splits, months: drillMonths, currency, today, rates, t, label: categoryName, locale, throughToday, goalEvents }} onClose={() => setDrill(null)} onOpenRecord={onOpenRecord}/>}
 </section>;
}
