"use client";
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, ReceiptText, X } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ShareBars } from '@/components/cash-flow-report';
import { chartAxis, chartBar, chartColors, chartDonut, chartGrid, chartHeight, chartLegend, chartMargin, chartTooltip, chartValueAxis, groupedBar, intervalLabel, moneyTick, stackTop } from '@/components/presentation-foundation/chart';
import { BusinessMark } from '@/components/presentation-foundation/business-mark';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { Count } from '@/components/presentation-foundation/count';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { Pagination } from '@/components/presentation-foundation/pagination';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { toggleKey } from '@/components/presentation-foundation/series-legend';
import { Button } from '@/components/ui/button';
import { paletteColor } from '@/lib/business';
import { ledgerExportRows, summarizeLines, type Drill, type Interval, type LedgerLine } from '@/lib/business-report';
import { otherShareKey, topShares, type Share } from '@/lib/cash-flow-report';
import { categoryHue, hueColor } from '@/lib/category-colors';
import { exportCSV } from '@/lib/csv';
import { formatDate, formatMoney, formatNumber, formatSignedMoney } from '@/lib/format';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { shownName } from '@/lib/record-names';

/** How a report names things: categories (built-in kinds are translated), the key a category's icon and colour come
 * from (a built-in kind, or an added category's own name), category groups and businesses. */
export type ReportNames = { category: (key: string) => string; icon: (key: string) => string; group: (key: string) => string; business: (id: string | null) => string; businessRecord: (id: string | null) => BusinessOption | undefined };

/** An interval key as a chart label: a short month, a quarter or a year. */
function useIntervalLabel(interval: Interval, long = false) {
 const { t, locale } = useLanguage();
 return intervalLabel(interval, locale, t, long);
}

/** A business's mark beside its name, or the household's. */
export function BusinessName({ id, names }: { id: string | null; names: ReportNames }) {
 const record = names.businessRecord(id);
 return <span className="report-business-name">{record ? <BusinessMark name={record.name} color={record.business_color} logo={record.business_logo} size="sm"/> : <span className="business-mark" data-size="sm" aria-hidden="true">🏠</span>}<span>{names.business(id)}</span></span>;
}

/** Bars over time: one series per key, side by side or stacked. Clicking a legend entry hides or shows its series. */
export function TrendChart({ rows, series, stacked, interval, currency }: { rows: Array<Record<string, number | string>>; series: Array<{ key: string; label: string; color: string }>; stacked: boolean; interval: Interval; currency: string }) {
 const { locale } = useLanguage();
 const [hidden, setHidden] = useState<string[]>([]);
 const label = useIntervalLabel(interval), longLabel = useIntervalLabel(interval, true);
 return <div className="cash-flow-chart"><ResponsiveContainer width="100%" height={chartHeight.regular}>
  <BarChart data={rows} barGap={2} stackOffset="sign" accessibilityLayer margin={chartMargin}>
   <CartesianGrid {...chartGrid}/>
   <XAxis dataKey="period" tickFormatter={value => label(String(value))} {...chartAxis}/>
   <YAxis tickFormatter={moneyTick(currency, locale)} {...chartValueAxis}/>
   <Tooltip {...chartTooltip} labelFormatter={value => longLabel(String(value))} formatter={(value, name) => [formatMoney(Number(value), currency, locale), String(name)]}/>
   <Legend {...chartLegend} onClick={entry => { const key = String((entry as { dataKey?: unknown }).dataKey ?? ''); setHidden(list => toggleKey(list, key)); }} formatter={(value, entry) => <span className="trend-legend" data-hidden={hidden.includes(String((entry as { dataKey?: unknown }).dataKey)) || undefined}>{value}</span>}/>
   {series.map((item, index) => <Bar key={item.key} dataKey={item.key} name={item.label} hide={hidden.includes(item.key)} stackId={stacked ? 'total' : undefined} {...(stacked ? { ...chartBar, ...stackTop(index === series.length - 1) } : groupedBar)} fill={item.color}/>)}
  </BarChart>
 </ResponsiveContainer></div>;
}

/** A breakdown as a donut with its legend beside it; clicking a slice or a legend row narrows the transactions. */
export function BreakdownDonut({ items, label, colorOf, currency, onSelect }: { items: Share[]; label: (key: string) => string; colorOf: (key: string) => string; currency: string; onSelect: (key: string) => void }) {
 const { t, locale } = useLanguage();
 if (!items.length) return <EmptyState icon={<ReceiptText/>} description={t('Nothing recorded in this period.')}/>;
 const top = topShares(items);
 const name = (key: string) => key === otherShareKey ? t('Other') : label(key);
 return <div className="breakdown-donut">
  <ResponsiveContainer width="100%" height={chartHeight.compact}><PieChart>
   <Pie data={top} dataKey="amount" nameKey="key" {...chartDonut} onClick={entry => { const key = (entry.payload as Share | undefined)?.key; if (key && key !== otherShareKey) onSelect(key); }}>
    {top.map(item => <Cell key={item.key} fill={item.key === otherShareKey ? chartColors.other : colorOf(item.key)} className="donut-slice"/>)}
   </Pie>
   <Tooltip {...chartTooltip} formatter={(value, key) => [formatMoney(Number(value), currency, locale), name(String(key))]}/>
  </PieChart></ResponsiveContainer>
  <ShareBars items={items} label={label} colorKey={colorOf} currency={currency} onSelect={onSelect}/>
 </div>;
}

/** The colour of a breakdown key: a business's own colour, a category's colour (the one chosen for it, through `hueOf`), otherwise the ink colour. */
export function attributeColor(attribute: 'category' | 'group' | 'business', key: string, names: ReportNames, hueOf: (kind: string) => number = categoryHue) {
 if (attribute === 'business') return paletteColor(names.businessRecord(key === 'household' ? null : key)?.business_color ?? (key === 'household' ? 'slate' : null));
 return hueColor(hueOf(attribute === 'category' ? names.icon(key) : key));
}

const reportLinesPerPage = 20;
/** Largest first, by the amount in the display currency; equal amounts newest first. */
export const largestFirst = (lines: readonly LedgerLine[]) => [...lines].sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

/** The transactions behind a report, narrowed by the last click on a chart or table, largest first. Each reads as it was
 * entered. A row opens its transaction; `href` opens the same list, filtered, on Transactions. */
export function ReportTransactions({ lines: given, drill, label, names, href, onClear, onOpen }: { lines: readonly LedgerLine[]; drill: Drill | null; label: string | null; names: ReportNames; href?: string; onClear: () => void; onOpen?: (line: LedgerLine) => void }) {
 const { t, locale } = useLanguage();
 const lines = largestFirst(given);
 // Twenty a page; narrowing by another chart part starts again at the first page.
 const listKey = JSON.stringify([label, lines.length, lines[0]?.id]);
 const [paging, setPaging] = useState({ key: listKey, page: 1 });
 const pageCount = Math.max(1, Math.ceil(lines.length / reportLinesPerPage));
 const page = paging.key === listKey ? Math.min(paging.page, pageCount) : 1;
 return <section className="panel report-transactions" aria-label={t('Transactions')}>
  <PanelTitle title={t('Transactions')} count={<Count value={new Set(lines.map(line => line.record?.id ?? line.id)).size}/>}>{drill && label && <span className="report-drill">{label}<button type="button" aria-label={t('Clear filter')} onClick={onClear}><X size={14} aria-hidden="true"/></button></span>}{href && given.length > 0 && <DrawerLink href={href} className="panel-link">{t('Open in Transactions')}</DrawerLink>}</PanelTitle>
  {lines.length ? <ul className="report-transaction-list">{lines.slice((page - 1) * reportLinesPerPage, page * reportLinesPerPage).map(line => {
   const cells = <>
    <CategoryIcon kind={names.icon(line.category)} size="sm"/>
    <span><strong>{shownName(line, t)}</strong><small>{formatDate(line.date, locale)} · {names.category(line.category)}</small></span>
    <BusinessName id={line.business} names={names}/>
    <strong className={line.direction === 'income' ? 'positive' : undefined}>{formatSignedMoney(line.direction === 'income' ? line.entered.amount : -line.entered.amount, line.entered.currency, locale)}</strong>
   </>;
   return <li key={line.id}>{onOpen && line.record ? <button type="button" aria-label={t('View details for {name}', { name: shownName(line, t) })} onClick={() => onOpen(line)}>{cells}</button> : <div>{cells}</div>}</li>;
  })}</ul> : <EmptyState icon={<ReceiptText/>} description={t('Nothing recorded in this period.')}/>}
  <Pagination label={t('Transaction pages')} summary={t('Page {page} of {pages} · {count} transactions', { page: formatNumber(page, locale, 0), pages: formatNumber(pageCount, locale, 0), count: formatNumber(lines.length, locale, 0) })} page={page} pageCount={pageCount} hasNext={page < pageCount} onPage={next => setPaging({ key: listKey, page: next })}/>
 </section>;
}

/** The figures beside a report's transactions: how many, the largest as it was entered and the average, totals, the first
 * and last dates, and the same transactions as a CSV file. `mixed` reports show income and spending apart. `missing` counts
 * transactions no rate converts: the sums then read —. */
export function ReportSummary({ lines, mixed, missing = 0, names, currency, fileName }: { lines: readonly LedgerLine[]; mixed: boolean; missing?: number; names: ReportNames; currency: string; fileName: string }) {
 const { t, locale } = useLanguage();
 const summary = summarizeLines(lines), money = (amount: number) => missing ? '—' : formatMoney(amount, currency, locale);
 const net = summary.income - summary.expenses, total = summary.income + summary.expenses;
 function download() {
  const headers = [t('Date'), t('Name'), t('Category'), t('Business'), t('Amount')];
  const rows = ledgerExportRows(lines, names.category, names.business).map(row => ({ [headers[0]]: row.date, [headers[1]]: row.name, [headers[2]]: row.category, [headers[3]]: row.business, [headers[4]]: row.amount }));
  const url = URL.createObjectURL(new Blob(['\uFEFF' + exportCSV(rows, headers)], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
  link.href = url; link.download = fileName + '.csv'; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
 }
 return <aside className="panel transactions-summary" aria-label={t('Summary')}>
  <PanelTitle title={t('Summary')}/>
  <dl className="budget-left-summary">
   <div><dt>{t('Total transactions')}</dt><dd>{formatNumber(summary.count, locale, 0)}</dd></div>
   <div><dt>{t('Largest transaction')}</dt><dd><RollingText text={summary.largest ? formatMoney(summary.largest.entered.amount, summary.largest.entered.currency, locale) : '—'}/></dd></div>
   <div><dt>{t('Average transaction')}</dt><dd><RollingText text={summary.count && !missing ? (mixed ? formatSignedMoney(net / summary.count, currency, locale) : money(total / summary.count)) : '—'}/></dd></div>
   {mixed ? <><div><dt>{t('Total income')}</dt><dd className={summary.income > 0 && !missing ? 'positive' : undefined}><RollingText text={money(summary.income)}/></dd></div><div><dt>{t('Total spending')}</dt><dd><RollingText text={money(summary.expenses)}/></dd></div></>
    : <div><dt>{t('Total')}</dt><dd><RollingText text={money(total)}/></dd></div>}
   <div><dt>{t('First transaction')}</dt><dd>{formatDate(summary.first ?? '', locale)}</dd></div>
   <div><dt>{t('Last transaction')}</dt><dd>{formatDate(summary.last ?? '', locale)}</dd></div>
  </dl>
  <Button variant="outline" size="sm" disabled={!lines.length} onClick={download}><Download size={15} aria-hidden="true"/>{t('Download CSV')}</Button>
 </aside>;
}
