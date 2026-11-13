"use client";
import { useId } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { ChartGradient, chartAxis, chartBar, chartColors, chartGrid, chartHeight, chartMargin, chartTooltip, chartValueAxis, leadArea, moneyTick, monthLabel, monthTick, referenceLine } from '@/components/presentation-foundation/chart';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { formatDate, formatPercent, formatSignedMoney } from '@/lib/format';
import { historyChartDate } from '@/lib/investment-history';
import type { MonthResult, ReturnDay } from '@/lib/investment-returns';
import { dayTime } from '@/lib/calendar-days';

/** Each month's result as a bar, green above zero and red below, and the fall from the last peak under it. */
export function PerformanceCharts({ months, days, currency }: { months: MonthResult[]; days: ReturnDay[]; currency: string }) {
 const { t, locale } = useLanguage(), id = useId();
 const falls = days.map(day => ({ time: dayTime(day.date), drawdown: day.drawdown * 100 }));
 const percent = (value: unknown) => formatPercent(Number(value), locale, 1);
 return <div className="performance-columns">
  <section className="panel">
   <PanelTitle title={t('Monthly profit and loss')} hint={t('What your investments earned each month: the change in value without the money you added or withdrew, plus income, minus costs. A value update counts in the month it was recorded.')}/>
   <div className="performance-chart" role="img" aria-label={t('Monthly profit and loss')}>
    <ResponsiveContainer width="100%" height={chartHeight.compact}><BarChart data={months} margin={chartMargin}>
     <CartesianGrid {...chartGrid}/>
     <XAxis dataKey="month" tickFormatter={monthTick(locale)} {...chartAxis}/>
     <YAxis tickFormatter={moneyTick(currency, locale)} {...chartValueAxis}/>
     <ReferenceLine y={0} {...referenceLine}/>
     <Tooltip {...chartTooltip} labelFormatter={monthLabel(locale)} formatter={value => [formatSignedMoney(Number(value), currency, locale), t('Profit and loss')]}/>
     <Bar dataKey="pnl" {...chartBar}>{months.map(item => <Cell key={item.month} fill={item.pnl < 0 ? chartColors.loss : chartColors.income}/>)}</Bar>
    </BarChart></ResponsiveContainer>
   </div>
  </section>
  <section className="panel">
   <PanelTitle title={t('Drawdown')} hint={t('How far your investments stand below their highest point so far, without the effect of money added or withdrawn. Zero means a new high.')}/>
   <div className="performance-chart" role="img" aria-label={t('Drawdown')}>
    <ResponsiveContainer width="100%" height={chartHeight.compact}><AreaChart data={falls} margin={chartMargin}>
     <ChartGradient id={id} color={chartColors.loss}/>
     <CartesianGrid {...chartGrid}/>
     <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={time => formatDate(historyChartDate(Number(time)), locale)} minTickGap={80} {...chartAxis}/>
     <YAxis tickFormatter={percent} domain={['dataMin', 0]} {...chartValueAxis}/>
     <Tooltip {...chartTooltip} labelFormatter={time => formatDate(historyChartDate(Number(time)), locale)} formatter={value => [percent(value), t('Drawdown')]}/>
     <Area type="stepAfter" dataKey="drawdown" baseValue={0} {...leadArea(id)} stroke={chartColors.loss}/>
    </AreaChart></ResponsiveContainer>
   </div>
  </section>
 </div>;
}
