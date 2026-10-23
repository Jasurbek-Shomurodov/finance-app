"use client";
import { useMemo, useState } from 'react';
import { attributeColor, BusinessSankeyChart, ProfitLossTable, TrendChart } from '@/components/business-reports';
import { useLanguage } from '@/components/language-provider';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import { HOUSEHOLD } from '@/lib/business';
import { businessKey, businessSankey, cashFlowTrend, netTrendBy, profitAndLoss } from '@/lib/business-report';
import { formatMoney, formatPercent } from '@/lib/format';
import { rangeText, type TabProps } from './report-labels';

/** Cash flow: the period's totals, its breakdown as a Sankey or a profit and loss table, and its trend over time. */
/** The period's income, expenses, net income and savings rate. `missing` counts the amounts no rate converts: a total that
 * would leave them out reads — instead, with no tone (MONEY-008). */
function CashFlowTotals({ totals, missing, currency }: { totals: { income: number; expenses: number }; missing: number; currency: string }) {
 const { t, locale } = useLanguage();
 const net = totals.income - totals.expenses, earning = !missing && totals.income > 0;
 const money = (amount: number) => missing ? '—' : formatMoney(amount, currency, locale);
 return <StatTiles columns={4} label={t('Cash flow')}>
  <StatTile label={t('Income')} value={money(totals.income)} tone={earning ? 'positive' : undefined}/>
  <StatTile label={t('Expenses')} value={money(totals.expenses)}/>
  <StatTile label={t('Net income')} value={money(net)} tone={missing ? undefined : signTone(net)}/>
  <StatTile label={t('Savings rate')} value={earning ? formatPercent(net / totals.income * 100, locale) : '—'} tone={earning ? signTone(net) : undefined}/>
 </StatTiles>;
}

/** `missing` counts the period's amounts no rate converts; the totals above the breakdown then read — (MONEY-008). */
export function CashFlowTab({ lines, trendLines, trendRange, interval, includeHousehold, businessIds, names, groupOf, currency, view, onView, mode, onMode: setMode, onDrill, missing = 0 }: TabProps & { missing?: number; includeHousehold: boolean; businessIds: string[]; view: 'sankey' | 'pnl'; onView: (view: 'sankey' | 'pnl') => void; mode: 'breakdown' | 'trends'; onMode: (mode: 'breakdown' | 'trends') => void }) {
 const { t, locale } = useLanguage();
 const [breakdown, setBreakdown] = useState<'category' | 'group' | 'both'>('category');
 const [stacked, setStacked] = useState(false);
 const [series, setSeries] = useState<'totals' | 'business'>('totals');
 const pnl = useMemo(() => profitAndLoss(lines, businessIds, line => line.category, includeHousehold), [lines, businessIds, includeHousehold]);
 const totals = lines.reduce((sum, line) => line.direction === 'income' ? { ...sum, income: sum.income + line.amount } : { ...sum, expenses: sum.expenses + line.amount }, { income: 0, expenses: 0 });
 const sankey = businessSankey(pnl, { category: names.category, business: id => names.business(id), total: t(businessIds.length ? 'Household income' : 'Income'), savings: t('Net income'), profit: t('Net profit'), loss: name => t('{name} net loss', { name }), otherIncome: t('All other income'), otherExpense: t('All other expenses'), inBusiness: (name, business) => t('{business}: {name}', { business, name }) });
 const trend = cashFlowTrend(trendLines, trendRange, interval);
 // Net income of the household and of each business, side by side or stacked, so businesses can be compared.
 const netKeys = [...(includeHousehold ? [HOUSEHOLD] : []), ...businessIds];
 const byBusiness = series === 'business' && businessIds.length > 0;
 return <>
  <CashFlowTotals totals={totals} missing={missing} currency={currency}/>
  <section className="panel">
   <PanelTitle title={t(mode === 'breakdown' ? 'Breakdown' : 'Trends')} hint={mode === 'trends' ? rangeText(trendRange, locale) : view === 'sankey' ? t('Net income is income less spending in this period: what stayed in your accounts or went to savings, investments or loan principal.') : undefined}>
    <div className="cash-flow-switches">
     <Segmented label={t('Report view')} options={[{ value: 'breakdown', label: t('Breakdown') }, { value: 'trends', label: t('Trends') }] as const} value={mode} onChange={setMode}/>
     {mode === 'breakdown' ? <Segmented label={t('Chart type')} options={[{ value: 'sankey', label: t('Sankey') }, { value: 'pnl', label: t('Profit & loss') }] as const} value={view} onChange={onView}/>
      : <><Segmented label={t('Chart type')} options={[{ value: 'grouped', label: t('Grouped') }, { value: 'stacked', label: t('Stacked') }] as const} value={stacked ? 'stacked' : 'grouped'} onChange={value => setStacked(value === 'stacked')}/>
       {businessIds.length > 0 && <Segmented label={t('Series')} options={[{ value: 'totals', label: t('Income and expenses') }, { value: 'business', label: t('Net by business') }] as const} value={series} onChange={setSeries}/>}</>}
     {mode === 'breakdown' && view === 'pnl' && <Segmented label={t('Rows')} options={[{ value: 'category', label: t('Categories') }, { value: 'group', label: t('Groups') }, { value: 'both', label: t('Both') }] as const} value={breakdown} onChange={setBreakdown}/>}
    </div>
   </PanelTitle>
   {mode === 'trends' && byBusiness ? <TrendChart key="business" rows={netTrendBy(trendLines, trendRange, interval, businessKey, netKeys)} interval={interval} currency={currency} stacked={stacked} series={netKeys.map(key => ({ key, label: names.business(key), color: attributeColor('business', key, names) }))}/>
    : mode === 'trends' ? <TrendChart key="totals" rows={stacked ? trend.map(row => ({ period: row.period, income: row.income, expenses: -row.expenses })) : trend} interval={interval} currency={currency} stacked={stacked} series={[{ key: 'income', label: t('Income'), color: 'var(--positive)' }, { key: 'expenses', label: t('Expenses'), color: 'color-mix(in srgb, var(--foreground) 55%, transparent)' }]}/>
    : view === 'sankey' ? <BusinessSankeyChart data={sankey} currency={currency} onDrill={onDrill}/>
    : <ProfitLossTable pnl={pnl} breakdown={breakdown} names={names} groupOf={groupOf} currency={currency} onDrill={onDrill}/>}
  </section>
 </>;
}
