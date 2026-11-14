"use client";
import { Fragment, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ReceiptText } from 'lucide-react';
import { BusinessName, type ReportNames } from '@/components/business-reports';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { signTone } from '@/components/presentation-foundation/tone';
import type { Drill, PnlLine, ProfitAndLoss } from '@/lib/business-report';
import { formatMoney, formatPercent } from '@/lib/format';

type Breakdown = 'category' | 'group' | 'both';
/** One column of figures: the period's profit and loss, the one before, or the year to date. `missing` blanks every sum
 * above its own category lines, because an amount in that range has no rate. */
export type PnlColumn = { key: string; label: string; pnl: ProfitAndLoss; missing: boolean };
/** Where a row reads its figure in any column's profit and loss. */
type Value = (pnl: ProfitAndLoss) => number;
/** `loss` colours a value red only below zero; `sign` colours it by its sign. */
type Tone = 'loss' | 'sign';
type Section = (pnl: ProfitAndLoss) => readonly PnlLine[];
/** A row's place: its indent, what its drill button narrows to, the revenue its share is of, and how it reads. A `section` row folds its lines away. */
type RowShape = { level: number; drill: Drill | null; base: number; kind?: 'line' | 'subtotal' | 'total'; tone?: Tone; section?: string };

/** Lines rolled up into their category groups, largest first. */
function grouped(lines: readonly PnlLine[], groupOf: (key: string) => string) {
 const groups = new Map<string, { key: string; amount: number; lines: PnlLine[] }>();
 for (const line of lines) {
  const key = groupOf(line.key), group = groups.get(key) ?? { key, amount: 0, lines: [] };
  group.amount += line.amount; group.lines.push(line); groups.set(key, group);
 }
 return [...groups.values()].sort((a, b) => b.amount - a.amount);
}
const lineOf = (section: Section, key: string): Value => pnl => section(pnl).find(line => line.key === key)?.amount ?? 0;
const groupTotal = (section: Section, group: string, groupOf: (key: string) => string): Value => pnl => section(pnl).filter(line => groupOf(line.key) === group).reduce((sum, line) => sum + line.amount, 0);

/** Profit and loss table: total income (household income and each business's net income, made of gross income less
 * business expenses), household expenses and net cash flow, for the period, the period before and the year to date,
 * with each row's share of its revenue (a business's gross income, or total income). A section's chevron folds its
 * lines away; hovering a row offers its transactions. Rows are the period's own; the other columns read the same rows. */
export function ProfitLossTable({ columns, breakdown, names, groupOf, currency, onDrill }: { columns: readonly PnlColumn[]; breakdown: Breakdown; names: ReportNames; groupOf: (key: string) => string; currency: string; onDrill: (drill: Drill) => void }) {
 const { t, locale } = useLanguage();
 const [closed, setClosed] = useState<string[]>([]);
 const pnl = columns[0].pnl;
 // Each drill button is named by its own words and its row's label, which may hold an icon or a business mark.
 const idBase = useId(), rowId = (key: string) => `${idBase}${encodeURIComponent(key)}`; // keys hold category names with spaces
 const toggle = (key: string) => setClosed(list => list.includes(key) ? list.filter(item => item !== key) : [...list, key]);
 const share = (amount: number, base: number) => base > 0 ? formatPercent(amount / base * 100, locale) : '';
 const row = (key: string, label: ReactNode, value: Value, { level, drill, base, kind = 'line', tone, section }: RowShape) => <tr key={key} data-kind={kind} style={{ '--level': level } as CSSProperties}>
  <th scope="row">{section && <button type="button" className="pnl-toggle" aria-expanded={!closed.includes(key)} aria-label={t(closed.includes(key) ? 'Show {name}' : 'Hide {name}', { name: section })} onClick={() => toggle(key)}><ChevronDown size={15} aria-hidden="true"/></button>}<span className="pnl-label" id={rowId(key) + ":label"}>{label}</span>{drill && <button type="button" className="pnl-drill" id={rowId(key) + ":drill"} aria-label={t('Show transactions')} aria-labelledby={[`${rowId(key)}:drill`, `${rowId(key)}:label`, ...(/^b:[^:]+:/.test(key) ? [`${rowId(key.split(':').slice(0, 2).join(':'))}:label`] : [])].join(' ')} title={t('Show transactions')} onClick={() => onDrill(drill)}><ReceiptText size={14} aria-hidden="true"/></button>}</th>
  {columns.map(column => {
   const amount = value(column.pnl), shown = tone === 'sign' ? signTone(amount) : tone === 'loss' && amount < 0 ? 'negative' : undefined;
   return column.missing && kind !== 'line' ? <td key={column.key}>—</td> : <td key={column.key} className={shown}>{formatMoney(amount, currency, locale)}</td>;
  })}
  <td className="pnl-share">{columns[0].missing && kind !== 'line' ? '' : share(value(pnl), base)}</td>
 </tr>;
 const lines = (section: Section, level: number, drillBase: Drill, prefix: string, base: number) => breakdown === 'category'
  ? section(pnl).map(item => row(`${prefix}:${item.key}`, <><CategoryIcon kind={names.icon(item.key)} size="sm"/>{names.category(item.key)}</>, lineOf(section, item.key), { level, drill: { ...drillBase, category: item.key }, base }))
  : grouped(section(pnl), groupOf).flatMap(group => [
   row(`${prefix}:group:${group.key}`, t(group.key), groupTotal(section, group.key, groupOf), { level, drill: { ...drillBase, categories: group.lines.map(line => line.key) }, base, kind: breakdown === 'both' ? 'subtotal' : 'line' }),
   ...(breakdown === 'both' ? group.lines.map(item => row(`${prefix}:${group.key}:${item.key}`, <><CategoryIcon kind={names.icon(item.key)} size="sm"/>{names.category(item.key)}</>, lineOf(section, item.key), { level: level + 1, drill: { ...drillBase, category: item.key }, base })) : []),
  ]);
 const household = pnl.household, revenue = pnl.totalIncome;
 const businessOf = (id: string) => (p: ProfitAndLoss) => p.businesses.find(business => business.id === id);
 return <div className="table-scroll"><table className="pnl-table">
  <thead><tr><th scope="col">{t('Line item')}</th>{columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}<th scope="col">{t('Share of revenue')}</th></tr></thead>
  <tbody>
   {row('income', t('Total income'), p => p.totalIncome, { level: 0, drill: { direction: 'income' }, base: revenue, kind: 'total', tone: 'loss' })}
   {household && <>
    {row('household-income', <BusinessName id={null} names={names}/>, p => p.household?.incomeTotal ?? 0, { level: 1, drill: { direction: 'income', business: null }, base: revenue, kind: 'subtotal', section: names.business(null) })}
    {!closed.includes('household-income') && lines(p => p.household?.income ?? [], 2, { direction: 'income', business: null }, 'hi', revenue)}
   </>}
   {pnl.businesses.map(business => {
    const of = businessOf(business.id), gross = business.grossIncome;
    return <Fragment key={business.id}>
     {row(`b:${business.id}`, <><BusinessName id={business.id} names={names}/><small>{t('Net income')}</small></>, p => of(p)?.net ?? 0, { level: 1, drill: { business: business.id }, base: gross, kind: 'subtotal', tone: 'loss', section: names.business(business.id) })}
     {!closed.includes(`b:${business.id}`) && <>
      {row(`b:${business.id}:gross`, t('Gross business income'), p => of(p)?.grossIncome ?? 0, { level: 2, drill: { direction: 'income', business: business.id }, base: gross, kind: 'subtotal' })}
      {lines(p => of(p)?.income ?? [], 3, { direction: 'income', business: business.id }, `b:${business.id}:i`, gross)}
      {row(`b:${business.id}:expenses`, t('Business expenses'), p => of(p)?.totalExpenses ?? 0, { level: 2, drill: { direction: 'expense', business: business.id }, base: gross, kind: 'subtotal' })}
      {lines(p => of(p)?.expenses ?? [], 3, { direction: 'expense', business: business.id }, `b:${business.id}:e`, gross)}
     </>}
    </Fragment>;
   })}
   {household && <>
    {row('household-expenses', t('Household expenses'), p => p.household?.expenseTotal ?? 0, { level: 0, drill: { direction: 'expense', business: null }, base: revenue, kind: 'total', section: t('Household expenses') })}
    {!closed.includes('household-expenses') && lines(p => p.household?.expenses ?? [], 1, { direction: 'expense', business: null }, 'he', revenue)}
   </>}
   {row('net', t(household ? 'Net cash flow' : 'Net income'), p => p.net, { level: 0, drill: null, base: revenue, kind: 'total', tone: 'sign' })}
  </tbody>
 </table></div>;
}
