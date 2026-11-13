"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { ChartGradient, chartAxis, chartGrid, chartHeight, chartMargin, chartTooltip, chartValueAxis, leadArea, moneyTick, referenceLine, sideBar, sideGrid, toneColor } from '@/components/presentation-foundation/chart';
import { niceAxis } from '@/lib/chart-scale';
import { formatDate, formatMonthShort, formatSignedMoney } from '@/lib/format';
import { historyChartDate } from '@/lib/investment-history';
import type { HoldingPnl, PnlPoint } from '@/lib/investment-pnl';

/** The running profit or loss day by day, around a zero line: green while ahead, red while behind. Loaded through
 * components/charts-lazy.tsx with the bars below, so the chart library arrives only when the view is opened. */
export function PnlTrendChart({ points, currency }: { points: readonly PnlPoint[]; currency: string }) {
 const { t, locale } = useLanguage();
 const data = points.map(point => ({ at: Date.parse(point.date + 'T00:00:00Z'), total: point.total }));
 const axis = niceAxis([0, ...points.map(point => point.total)]);
 const color = toneColor(points.at(-1)?.total ?? 0);
 return <div className="portfolio-chart"><ResponsiveContainer width="100%" height={chartHeight.regular}>
  <AreaChart data={data} margin={chartMargin} accessibilityLayer>
   <ChartGradient id="pnl-trend-fill" color={color}/>
   <CartesianGrid {...chartGrid}/>
   <XAxis dataKey="at" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={at => formatMonthShort(historyChartDate(Number(at)), locale)} minTickGap={40} {...chartAxis}/>
   <YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={moneyTick(currency, locale)} {...chartValueAxis}/>
   <Tooltip {...chartTooltip} labelFormatter={at => formatDate(historyChartDate(Number(at)), locale)} formatter={amount => [formatSignedMoney(Number(amount), currency, locale), t('Gain/loss')]}/>
   <ReferenceLine y={0} {...referenceLine}/>
   <Area type="monotone" dataKey="total" {...leadArea('pnl-trend-fill')} stroke={color}/>
  </AreaChart>
 </ResponsiveContainer></div>;
}

/** How many holdings the bars name; the table under them lists every one. */
export const pnlBarLimit = 8;

/** Each holding's profit or loss as a bar from zero, the largest moves first. */
export function PnlHoldingBars({ rows, currency }: { rows: readonly HoldingPnl[]; currency: string }) {
 const { t, locale } = useLanguage();
 const data = [...rows].sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).slice(0, pnlBarLimit).sort((a, b) => b.total - a.total);
 const axis = niceAxis([0, ...data.map(row => row.total)]);
 return <div className="portfolio-chart"><ResponsiveContainer width="100%" height={chartHeight.regular}>
  <BarChart data={data} layout="vertical" margin={chartMargin} accessibilityLayer>
   <CartesianGrid {...sideGrid}/>
   <XAxis type="number" domain={axis.domain} ticks={axis.ticks} tickFormatter={moneyTick(currency, locale)} {...chartAxis}/>
   <YAxis type="category" dataKey="name" interval={0} {...chartValueAxis}/>
   <Tooltip {...chartTooltip} formatter={amount => [formatSignedMoney(Number(amount), currency, locale), t('Gain/loss')]}/>
   <ReferenceLine x={0} {...referenceLine}/>
   <Bar dataKey="total" {...sideBar}>{data.map(row => <Cell key={row.id} fill={toneColor(row.total)}/>)}</Bar>
  </BarChart>
 </ResponsiveContainer></div>;
}
