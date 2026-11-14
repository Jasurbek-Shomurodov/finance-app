"use client";
import { useMemo, useState } from 'react';
import { attributeColor, TrendChart } from '@/components/business-reports';
import { useLanguage } from '@/components/language-provider';
import { intervalLabel } from '@/components/presentation-foundation/chart';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import { HOUSEHOLD } from '@/lib/business';
import { businessKey, businessSankey, cashFlowTrend, intervalOf, largestLoss, linesIn, netTrendBy, previousPeriod, profitAndLoss, yearToDate, type BusinessPnl, type LedgerLine } from '@/lib/business-report';
import { formatMoney, formatPercent } from '@/lib/format';
import { BusinessSankeyChart } from './business-sankey';
import { ProfitLossTable, type PnlColumn } from './profit-loss-table';
import { rangeText, type TabProps } from './report-labels';
import { TrendRateNote } from './report-filters';

/** "−$164 from Coastal Candle Co.": the loss that pulled net income down, its amount in the loss colour. */
function LossLine({ loss, name, currency }: { loss: BusinessPnl; name: string; currency: string }) {
 const { t, locale } = useLanguage();
 const [before, after = ''] = t('{amount} from {name}', { amount: '\u0000', name }).split('\u0000');
 return <p>{before}<span className="negative">{formatMoney(loss.net, currency, locale)}</span>{after}</p>;
}

/** The period's income, expenses, net income and savings rate; when a business made a loss, the net income tile names it.
 * `missing` counts the amounts no rate converts: a total that would leave them out reads — instead, with no tone (MONEY-008). */
function CashFlowTotals({ totals, loss, lossName, missing, currency }: { totals: { income: number; expenses: number }; loss: BusinessPnl | null; lossName: string; missing: number; currency: string }) {
 const { t, locale } = useLanguage();
 const net = totals.income - totals.expenses, earning = !missing && totals.income > 0;
 const money = (amount: number) => missing ? '—' : formatMoney(amount, currency, locale);
 return <StatTiles columns={4} label={t('Cash flow')}>
  <StatTile label={t('Income')} value={money(totals.income)} tone={earning ? 'positive' : undefined}/>
  <StatTile label={t('Expenses')} value={money(totals.expenses)}/>
  <StatTile label={t('Net income')} value={money(net)} tone={missing ? undefined : signTone(net)}>{loss && !missing && <LossLine loss={loss} name={lossName} currency={currency}/>}</StatTile>
  <StatTile label={t('Savings rate')} value={earning ? formatPercent(net / totals.income * 100, locale) : '—'} tone={earning ? signTone(net) : undefined}/>
 </StatTiles>;
}

type View = 'flow' | 'pnl' | 'trends';

type Rows = 'category' | 'group' | 'both';
/** The panel's view (flow, profit and loss or trends) and that view's own switches. `series` is null without businesses. */
function CashFlowSwitches({ shown, onShown, stacked, onStacked, series, onSeries, breakdown, onBreakdown }: { shown: View; onShown: (view: View) => void; stacked: boolean; onStacked: (stacked: boolean) => void; series: 'totals' | 'business' | null; onSeries: (series: 'totals' | 'business') => void; breakdown: Rows; onBreakdown: (rows: Rows) => void }) {
 const { t } = useLanguage();
 return <div className="cash-flow-switches">
  <Segmented label={t('Report view')} options={[{ value: 'flow', label: t('Flow') }, { value: 'pnl', label: t('Profit & loss') }, { value: 'trends', label: t('Trends') }] as const} value={shown} onChange={onShown}/>
  {shown === 'trends' && <><Segmented label={t('Chart type')} options={[{ value: 'grouped', label: t('Grouped') }, { value: 'stacked', label: t('Stacked') }] as const} value={stacked ? 'stacked' : 'grouped'} onChange={value => onStacked(value === 'stacked')}/>
   {series && <Segmented label={t('Series')} options={[{ value: 'totals', label: t('Income and expenses') }, { value: 'business', label: t('Net by business') }] as const} value={series} onChange={onSeries}/>}</>}
  {shown === 'pnl' && <Segmented label={t('Rows')} options={[{ value: 'category', label: t('Categories') }, { value: 'group', label: t('Groups') }, { value: 'both', label: t('Both') }] as const} value={breakdown} onChange={onBreakdown}/>}
 </div>;
}

/** Cash flow: the period's totals, then where the money went as a flow coloured by who earned it, a profit and loss
 * table beside the period before and the year to date, or its trend over time. */
/** `missing` counts the period's amounts no rate converts; the totals above the breakdown then read — (MONEY-008). */
export function CashFlowTab({ period, lines, trendLines, trendRange, interval, includeHousehold, businessIds, names, groupOf, currency, view, onView, mode, onMode: setMode, onDrill, missing = 0, trendMissing = 0 }: TabProps & { includeHousehold: boolean; businessIds: string[]; view: 'sankey' | 'pnl'; onView: (view: 'sankey' | 'pnl') => void; mode: 'breakdown' | 'trends'; onMode: (mode: 'breakdown' | 'trends') => void }) {
 const { t, locale } = useLanguage();
 const [breakdown, setBreakdown] = useState<Rows>('category');
 const [stacked, setStacked] = useState(false);
 const [series, setSeries] = useState<'totals' | 'business'>('totals');
 const pnlOf = useMemo(() => (list: readonly LedgerLine[]) => profitAndLoss(list, businessIds, line => line.category, includeHousehold), [businessIds, includeHousehold]);
 const pnl = useMemo(() => pnlOf(lines), [pnlOf, lines]);
 const totals = lines.reduce((sum, line) => line.direction === 'income' ? { ...sum, income: sum.income + line.amount } : { ...sum, expenses: sum.expenses + line.amount }, { income: 0, expenses: 0 });
 const loss = largestLoss(pnl);
 const sankey = businessSankey(pnl, { category: names.category, business: id => names.business(id), total: t(businessIds.length ? 'Household income' : 'Income'), savings: t('Net income'), profit: t('Net profit'), loss: name => t('{name} net loss', { name }), otherIncome: t('All other income'), otherExpense: t('All other expenses'), inBusiness: (name, business) => t('{business}: {name}', { business, name }) });
 const trend = cashFlowTrend(trendLines, trendRange, interval);
 // Net income of the household and of each business, side by side or stacked, so businesses can be compared.
 const netKeys = [...(includeHousehold ? [HOUSEHOLD] : []), ...businessIds];
 const byBusiness = series === 'business' && businessIds.length > 0;
 const shown: View = mode === 'trends' ? 'trends' : view === 'pnl' ? 'pnl' : 'flow';
 const choose = (next: View) => { setMode(next === 'trends' ? 'trends' : 'breakdown'); if (next !== 'trends') onView(next === 'flow' ? 'sankey' : 'pnl'); };
 // The period, the one before and (unless the period is a year) the year so far; an unconverted amount in the trend
 // window blanks the sums of the earlier columns, which read from it.
 const periodName = intervalLabel(interval, locale, t, true);
 const previous = previousPeriod(period, interval);
 const columns: PnlColumn[] = shown !== 'pnl' ? [] : [
  { key: 'period', label: periodName(intervalOf(period.from, interval)), pnl, missing: missing > 0 },
  { key: 'previous', label: periodName(intervalOf(previous.from, interval)), pnl: pnlOf(linesIn(trendLines, previous)), missing: trendMissing > 0 },
  ...(interval === 'year' ? [] : [{ key: 'ytd', label: t('Year to date'), pnl: pnlOf(linesIn(trendLines, yearToDate(period))), missing: trendMissing > 0 }]),
 ];
 return <>
  <CashFlowTotals totals={totals} loss={loss} lossName={loss ? names.business(loss.id) : ''} missing={missing} currency={currency}/>
  <section className="panel">
   <PanelTitle title={t('Where the money went')} hint={shown === 'trends' ? rangeText(trendRange, locale) : shown === 'flow' ? t('Net income is income less spending in this period: what stayed in your accounts or went to savings, investments or loan principal.') : undefined}>
    <CashFlowSwitches shown={shown} onShown={choose} stacked={stacked} onStacked={setStacked} series={businessIds.length ? series : null} onSeries={setSeries} breakdown={breakdown} onBreakdown={setBreakdown}/>
   </PanelTitle>
   {shown === 'trends' && byBusiness ? <TrendChart key="business" rows={netTrendBy(trendLines, trendRange, interval, businessKey, netKeys)} interval={interval} currency={currency} stacked={stacked} series={netKeys.map(key => ({ key, label: names.business(key), color: attributeColor('business', key, names) }))}/>
    : shown === 'trends' ? <TrendChart key="totals" rows={stacked ? trend.map(row => ({ period: row.period, income: row.income, expenses: -row.expenses })) : trend} interval={interval} currency={currency} stacked={stacked} series={[{ key: 'income', label: t('Income'), color: 'var(--positive)' }, { key: 'expenses', label: t('Expenses'), color: 'color-mix(in srgb, var(--foreground) 55%, transparent)' }]}/>
    : shown === 'flow' ? <BusinessSankeyChart data={sankey} pnl={pnl} names={names} currency={currency} onDrill={onDrill}/>
    : <ProfitLossTable columns={columns} breakdown={breakdown} names={names} groupOf={groupOf} currency={currency} onDrill={onDrill}/>}
   {shown === 'trends' && <TrendRateNote count={trendMissing}/>}
  </section>
 </>;
}
