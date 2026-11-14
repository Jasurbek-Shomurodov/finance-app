"use client";
import { CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { chartDot, chartGrid, chartMargin, chartTooltip, guideLine, leadLine } from '@/components/presentation-foundation/chart';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import type { PaceStatus, SpendingPace } from '@/lib/budget-view';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';

const statusLabels: Record<PaceStatus, string> = { on_pace: 'On pace', above_pace: 'Above pace', over_plan: 'Over plan' };
const statusClass: Record<PaceStatus, string> = { on_pace: 'status-badge is-paid', above_pace: 'status-badge is-caution', over_plan: 'status-badge is-overdue' };

/** The month's spending so far as a line, beside an even pace toward the plan: under the dashed line is on pace.
 * `plan` is Planned spending; null (no usable rate) leaves the pace line out. */
export function SpendingPaceCard({ pace, plan, currency }: { pace: SpendingPace; plan: number | null; currency: string }) {
 const { t, locale } = useLanguage();
 const money = (value: number) => formatMoney(value, currency, locale);
 const names: Record<string, string> = { spent: t('Spent'), pace: t('Even pace') };
 const first = pace.points[0], last = pace.points.at(-1), reached = pace.points.findLast(point => point.spent !== null);
 return <section className="panel budget-pace" aria-label={t('Spending pace')}>
  <PanelTitle title={t('Spending pace')} hint={t('What you have spent so far this month, beside an even pace: the plan spread equally over the days of the month.')}>{pace.status && <span className={statusClass[pace.status]}>{t(statusLabels[pace.status])}</span>}</PanelTitle>
  <p className="budget-pace-figure"><strong><RollingText text={money(pace.spent)}/></strong>{plan !== null && <span>{t('{amount} planned', { amount: money(plan) })}</span>}{pace.day > 0 && <span>{t('Day {day} of {days}', { day: formatNumber(pace.day, locale, 0), days: formatNumber(pace.days, locale, 0) })}</span>}</p>
  <div className="budget-pace-chart" role="img" aria-label={t('Spending pace')}>
   <ResponsiveContainer width="100%" height="100%"><ComposedChart data={pace.points} margin={chartMargin}>
    <CartesianGrid {...chartGrid}/>
    <XAxis dataKey="date" hide/>
    <YAxis hide domain={[0, (max: number) => Math.max(max, 1)]}/>
    <Tooltip {...chartTooltip} labelFormatter={date => formatDate(String(date), locale)} formatter={(amount, name) => [money(Number(amount)), names[String(name)] ?? String(name)]}/>
    <Line dataKey="pace" {...guideLine} connectNulls={false}/>
    <Line dataKey="spent" {...leadLine} type="linear" connectNulls={false}/>
    {reached && reached.spent !== null && <ReferenceDot x={reached.date} y={reached.spent} {...chartDot} stroke={leadLine.stroke}/>}
   </ComposedChart></ResponsiveContainer>
  </div>
  {first && last && <p className="budget-pace-axis"><span>{formatDate(first.date, locale)}</span><span>{formatDate(last.date, locale)}</span></p>}
  <p className="budget-pace-legend"><span data-key="spent">{t('Spent')}</span>{plan !== null && <span data-key="pace">{t('Even pace')}</span>}</p>
 </section>;
}
