"use client";
import { useId } from 'react';
import { Area, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { ChartGradient, chartAxis, chartDonut, chartGrid, chartHeight, chartMargin, chartTooltip, chartValueAxis, guideLine, leadArea, moneyTick, monthLabel } from '@/components/presentation-foundation/chart';
import { niceAxis } from '@/lib/chart-scale';
import type { payoffSeries } from '@/lib/debt-plan';
import { formatMoney, formatPercent } from '@/lib/format';

export type OwedSlice = { id: string; name: string; amount: number; color: string };

/** What is owed, split by debt: each slice is one debt's share of the total. */
export function OwedDonut({ slices, currency }: { slices: readonly OwedSlice[]; currency: string }) {
 const { t, locale } = useLanguage();
 const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
 const share = (amount: number) => formatPercent(total > 0 ? amount / total * 100 : 0, locale);
 return <div className="owed-donut" role="img" aria-label={`${t('What you owe')}: ${slices.map(slice => `${slice.name} ${share(slice.amount)}`).join(', ')}`}>
  <ResponsiveContainer width="100%" height="100%"><PieChart>
   <Pie data={[...slices]} dataKey="amount" nameKey="name" {...chartDonut}>{slices.map(slice => <Cell key={slice.id} fill={slice.color}/>)}</Pie>
   <Tooltip {...chartTooltip} formatter={(amount, name) => [`${formatMoney(Number(amount), currency, locale)} · ${share(Number(amount))}`, String(name)]}/>
  </PieChart></ResponsiveContainer>
 </div>;
}

/** The balance owed month by month: the plan as the lead line, minimum payments only as the dashed guide beside it.
 * `compact` is the small card on the overview: no axes; the card names the first and last month itself. */
export function PayoffChart({ points, currency, compact = false }: { points: ReturnType<typeof payoffSeries>; currency: string; compact?: boolean }) {
 const { t, locale } = useLanguage();
 const id = useId();
 const axis = niceAxis(points.flatMap(point => [point.plan, point.minimums]).filter((amount): amount is number => amount !== null));
 const names: Record<string, string> = { plan: t('Your plan'), minimums: t('Minimums only') };
 return <div className="payoff-chart" data-compact={compact || undefined} style={{ height: compact ? 110 : chartHeight.regular }} role="img" aria-label={t('Balance owed')}>
  <ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} margin={chartMargin}>
   <ChartGradient id={id}/>
   <CartesianGrid {...chartGrid}/>
   <XAxis dataKey="month" hide={compact} tickFormatter={monthLabel(locale)} minTickGap={56} interval="preserveStartEnd" {...chartAxis}/>
   <YAxis hide={compact} tickFormatter={moneyTick(currency, locale)} domain={[0, axis.domain[1]]} ticks={axis.ticks.filter(tick => tick >= 0)} {...chartValueAxis}/>
   <Tooltip {...chartTooltip} labelFormatter={monthLabel(locale)} formatter={(amount, name) => [formatMoney(Number(amount), currency, locale), names[String(name)] ?? String(name)]}/>
   <Area dataKey="plan" {...leadArea(id)} connectNulls={false}/>
   <Line dataKey="minimums" {...guideLine} connectNulls={false}/>
  </ComposedChart></ResponsiveContainer>
 </div>;
}
