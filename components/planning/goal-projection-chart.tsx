"use client";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { ChartGradient, chartAxis, chartGrid, chartHeight, chartMargin, chartTooltip, leadArea, plannedLine, referenceLine } from '@/components/presentation-foundation/chart';
import { dayTime, isoDay } from '@/lib/calendar-days';
import { niceAxis } from '@/lib/chart-scale';
import { formatDate, formatMoney, formatMonthYear } from '@/lib/format';

export type GoalChartPoint = { date: string; saved?: number; projected?: number };

/** A goal on one line: what was saved up to today, where the monthly contribution takes it from there (dashed), and the
 * target as a level. The axis names the first month, today and the last day. Its own module, loaded through
 * goals-lazy.tsx, so Goals opens without the chart library. */
export function GoalProjectionChart({ points, target, today, currency, labels }: { points: readonly GoalChartPoint[]; target: number; today: string; currency: string; labels: { saved: string; projected: string } }) {
 const { t, locale } = useLanguage();
 const data = points.map(point => ({ ...point, time: dayTime(point.date) }));
 const axis = niceAxis([...data.flatMap(point => [point.saved, point.projected]).filter((value): value is number => typeof value === 'number'), target], 3);
 const first = data[0]?.time, last = data.at(-1)?.time, now = dayTime(today);
 const ticks = [...new Set([first, now, last].filter((time): time is number => typeof time === 'number'))];
 const tick = (time: number) => time === now ? t('Today') : time === last ? formatDate(isoDay(time), locale) : formatMonthYear(isoDay(time).slice(0, 7), locale);
 // The first and last labels hug the chart's edges, so a long date is never cut off.
 const edgeTick = ({ x, y, payload }: { x: number | string; y: number | string; payload: { value: unknown } }) => <text className="goal-projection-tick" x={x} y={y} dy="0.9em" textAnchor={ticks.length > 1 && payload.value === first ? 'start' : payload.value === last && ticks.length > 1 ? 'end' : 'middle'}>{tick(Number(payload.value))}</text>;
 const name: Record<string, string> = { saved: labels.saved, projected: labels.projected };
 return <div className="goal-projection"><ResponsiveContainer width="100%" height={chartHeight.slim}>
  <ComposedChart data={data} margin={chartMargin} accessibilityLayer>
   <ChartGradient id="goal-projection-fill"/>
   <CartesianGrid {...chartGrid}/>
   <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={ticks} interval={0} tick={edgeTick} {...chartAxis}/>
   <YAxis hide domain={axis.domain} ticks={axis.ticks}/>
   <Tooltip {...chartTooltip} labelFormatter={time => formatDate(isoDay(Number(time)), locale)} formatter={(amount, key) => [formatMoney(Number(amount), currency, locale), name[String(key)] ?? String(key)]}/>
   <ReferenceLine y={target} {...referenceLine} stroke="var(--positive)" ifOverflow="extendDomain"/>
   <Area type="monotone" dataKey="saved" name="saved" connectNulls {...leadArea('goal-projection-fill')}/>
   <Line type="monotone" dataKey="projected" name="projected" connectNulls {...plannedLine}/>
  </ComposedChart>
 </ResponsiveContainer></div>;
}
