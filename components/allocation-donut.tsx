"use client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { chartDonut, chartTooltip } from '@/components/presentation-foundation/chart';
import { categoryColor } from '@/lib/category-colors';
import { formatCompactMoney, formatMoney, formatPercent } from '@/lib/format';

type Slice = { kind: string; amount: number };

/** Asset allocation at a glance: a donut of each kind's share with the total in its middle. A slice opens its kind. */
export function AllocationDonut({ slices, total, currency, onSelect }: { slices: readonly Slice[]; total: number; currency: string; onSelect?: (kind: string) => void }) {
 const { t, locale } = useLanguage();
 const shown = slices.filter(slice => slice.amount > 0);
 return <div className="allocation-donut" role="img" aria-label={`${t('Asset allocation')}: ${shown.map(slice => `${t(slice.kind)} ${formatPercent(total > 0 ? slice.amount / total * 100 : 0, locale)}`).join(', ')}`}>
  <ResponsiveContainer width="100%" height="100%"><PieChart>
   <Pie data={shown} dataKey="amount" nameKey="kind" {...chartDonut} onClick={entry => { const kind = (entry.payload as Slice | undefined)?.kind; if (kind) onSelect?.(kind); }}>
    {shown.map(slice => <Cell key={slice.kind} fill={categoryColor(slice.kind)} className="donut-slice"/>)}
   </Pie>
   <Tooltip {...chartTooltip} formatter={(value, kind) => [`${formatMoney(Number(value), currency, locale)} · ${formatPercent(total > 0 ? Number(value) / total * 100 : 0, locale)}`, t(String(kind))]}/>
  </PieChart></ResponsiveContainer>
  <div className="allocation-donut-total" aria-hidden="true"><strong>{formatCompactMoney(total, currency, locale, true)}</strong><span>{t('Total assets')}</span></div>
 </div>;
}
