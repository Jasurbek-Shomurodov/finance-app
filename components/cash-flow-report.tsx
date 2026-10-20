"use client";
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { chartAxis, chartColors, chartGrid, chartHeight, chartLegend, chartMargin, chartTooltip, chartValueAxis, groupedBar, intervalLabel, moneyTick } from '@/components/presentation-foundation/chart';
import { CashFlowDrillDialog, FlowSankey } from '@/components/cash-flow-sankey';
import type { DrillTarget } from '@/lib/cash-flow-drill';
import { drillLink, linkedTitle, readRange } from '@/lib/cash-flow-link';
import { mainTarget } from '@/lib/cash-flow-main';
import { useLocationSearch } from '@/hooks/use-location-search';
import type { GoalEvent } from '@/lib/goal-funding';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { cashFlowReport, partialBar, periodMonths, reportPeriods, sankeyFlows, topShares, otherShareKey, trendBarsBy, trendMonths, type ReportPeriod, type Share } from '@/lib/cash-flow-report';
import { hueColor } from '@/lib/category-colors';
import { useCategoryHue } from '@/components/category-icons-context';
import { depositToday } from '@/lib/deposit-interest';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { formatMoney, formatMonthYear, formatPercent } from '@/lib/format';
import { marketRates, type MarketData } from '@/lib/market';
import { emptyPlanning, type PlanningData } from '@/lib/planning';
import type { TransactionSplit } from '@/lib/transaction-tools';

const noGoalEvents = { events: [] as GoalEvent[] };
const periodLabels: Record<ReportPeriod, string> = { month: 'Month', quarter: 'Quarter', year: 'Year' };
const trendTitles: Record<ReportPeriod, string> = { month: 'Income and spending by month', quarter: 'Income and spending by quarter', year: 'Income and spending by year' };
type Props = { /** Opens a transaction's details, as a row on Transactions does. */onOpenRecord?: (record: Entry) => void; owner: string | null; demo: boolean; revision: number; data: PlanningData; splits: TransactionSplit[]; month: string; currency: string; market: MarketData | null };

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

/** Cash flow: figures for the period, monthly bars, and where money came from and went, as bars or a Sankey diagram. */
export function CashFlowReport({ onOpenRecord, owner, demo, revision, data: provided, splits, month, currency, market }: Props) {
 const { t, locale } = useLanguage();
 const today = depositToday();
 const [period, setPeriod] = useState<ReportPeriod>('month');
 const [grouping, setGrouping] = useState<'category' | 'merchant'>('category');
 const [view, setView] = useState<'bars' | 'sankey'>('sankey');
 const live = !!owner && !demo;
 // The read runs through this month when it can (two years at most), so a drill-down can tell a past balance from today's.
 const search = useLocationSearch(), { first, readTo, throughToday } = readRange(month, today, drillLink(search)?.month);
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${readTo}&from=${first}`, owner, live, revision, emptyPlanning);
 // Goals' histories, for a goal's own Sankey in the drill-down; the sample workspace has none.
 const goalHistory = useOwnerResource('/api/goal-tools', owner, live, revision, noGoalEvents);
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : provided, [live, remote.data, provided]);
 const rates = marketRates(market);
 const report = useMemo(() => cashFlowReport(data, splits, periodMonths(month, period), currency, today, rates), [data, splits, month, period, currency, today, rates]);
 const trend = useMemo(() => trendBarsBy(cashFlowReport(data, splits, trendMonths(month, period), currency, today, rates).series, period), [data, splits, month, period, currency, today, rates]);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 // A quarter or year still running is labelled "to date", so it is never read as a whole period beside the others.
 const partial = partialBar(month, period, today);
 const barLabel = (long: boolean) => { const label = intervalLabel(period, locale, t, long); return (value: unknown) => value === partial && (long || period !== 'month') ? t('{period} to date', { period: label(value) }) : label(value); };
 const unknown = report.missing > 0 || trend.some(bar => bar.missing > 0);
 const categoryName = (key: string) => data.categories.find(category => category.id === key)?.name ?? t(key);
 const label = grouping === 'category' ? categoryName : (key: string) => key;
 const categoryHue = useCategoryHue();
 const colorKey = (key: string) => grouping === 'category' ? hueColor(categoryHue(data.categories.find(category => category.id === key)?.name ?? key)) : 'var(--foreground)';
 const flows = sankeyFlows(report, categoryName);
 // Every node opens its own Sankey in a dialog: a category, Savings, the merged "Other" (its categories) and the Income
 // total (every income source).
 const drillOf = (index: number): DrillTarget | null => mainTarget(flows.nodes[index]);
 const periodName = period === 'month' ? formatMonthYear(month, locale) : `${formatMonthYear(periodMonths(month, period)[0], locale)} – ${formatMonthYear(month, locale)}`;
 const { drill, setDrill, drillTitle, drillMonths, drillPeriod } = useDrill(data, t, search, { months: periodMonths(month, period), label: periodName, locale });
 if (live && remote.initialLoading) return <section className="panel cash-flow-report"><ChartSkeleton label={t('Loading records…')}/></section>;
 if (live && remote.error) return <section className="panel cash-flow-report"><InlineError message={t(remote.error)} onRetry={remote.retry}/></section>;
 return <section className="cash-flow-report" aria-label={t('Cash flow')}>
  <div className="cash-flow-report-tools">
   <Segmented label={t('Period')} options={reportPeriods.map(value => ({ value, label: t(periodLabels[value]) }))} value={period} onChange={setPeriod}/>
  </div>
  <CashFlowTiles report={report} currency={currency}/>
  {unknown && <p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>}
  <section className="panel">
   <PanelTitle title={t(trendTitles[period])}/>
   <div className="cash-flow-chart"><ResponsiveContainer width="100%" height={chartHeight.regular}>
    <BarChart data={trend} barGap={2} accessibilityLayer margin={chartMargin}>
     <CartesianGrid {...chartGrid}/>
     <XAxis dataKey="period" tickFormatter={barLabel(false)} {...chartAxis}/>
     <YAxis tickFormatter={moneyTick(currency, locale)} {...chartValueAxis}/>
     <Tooltip {...chartTooltip} filterNull={false} labelFormatter={barLabel(true)} formatter={(value, name) => [value === null || value === undefined ? '—' : money(Number(value)), String(name)]}/>
     <Legend {...chartLegend}/>
     <Bar dataKey="income" name={t('Income')} {...groupedBar} fill={chartColors.income}/>
     <Bar dataKey="expenses" name={t('Expenses')} {...groupedBar} fill={chartColors.expense}/>
    </BarChart>
   </ResponsiveContainer></div>
  </section>
  <section className="panel">
   <PanelTitle title={<>{t('Breakdown')} <span className="panel-figure">{periodName}</span></>}>
    <div className="cash-flow-switches">
     {view === 'bars' && <Segmented label={t('Group by')} options={[{ value: 'category', label: t('Category') }, { value: 'merchant', label: t('Merchant') }] as const} value={grouping} onChange={setGrouping}/>}
     <Segmented label={t('Chart type')} options={[{ value: 'bars', label: t('Bars') }, { value: 'sankey', label: t('Sankey') }] as const} value={view} onChange={setView}/>
    </div>
   </PanelTitle>
   {view === 'bars' ? <div className="cash-flow-breakdown">
    <div><h3>{t('Income')}</h3><ShareBars items={report[grouping === 'category' ? 'categories' : 'merchants'].income} label={label} colorKey={() => 'var(--positive)'} currency={currency}/></div>
    <div><h3>{t('Expenses')}</h3><ShareBars items={report[grouping === 'category' ? 'categories' : 'merchants'].expense} label={label} colorKey={colorKey} currency={currency}/></div>
   </div> : flows.links.length ? <FlowSankey flows={flows} currency={currency} canOpen={index => !!drillOf(index)} onOpen={index => { const target = drillOf(index); if (target) setDrill({ target, title: flows.nodes[index].name }); }}/> : <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>}
  </section>
  {drill && <CashFlowDrillDialog target={drill.target} title={drillTitle} period={drillPeriod} savings={report.savings} context={{ data, splits, months: drillMonths, currency, today, rates, t, label: categoryName, locale, throughToday: !live || throughToday, goalEvents: goalHistory.data.events }} onClose={() => setDrill(null)} onOpenRecord={onOpenRecord}/>}
 </section>;
}
