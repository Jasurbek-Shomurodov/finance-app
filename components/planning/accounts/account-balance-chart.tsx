"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { ChartGradient, chartAxis, chartGrid, chartHeight, chartMargin, chartTooltip, leadArea, monthLabel, monthTick } from '@/components/presentation-foundation/chart';
import { niceAxis } from '@/lib/chart-scale';
import { formatMoney } from '@/lib/format';
import type { AccountStory } from '@/lib/account-story';

/** An account's balance at the end of each of the last months, as one line: the figure for a month is in its tooltip.
 * Its own module, loaded through accounts-lazy.tsx, so Accounts opens without the chart library. */
export function AccountBalanceChart({ points, currency, label }: { points: AccountStory['points']; currency: string; /** Names the line in the tooltip. */ label: string }) {
 const { locale } = useLanguage();
 const axis = niceAxis(points.map(point => point.balance), 3);
 return <div className="account-balance-chart"><ResponsiveContainer width="100%" height={chartHeight.slim}>
  <AreaChart data={points} margin={chartMargin} accessibilityLayer>
   <ChartGradient id="account-balance-fill"/>
   <CartesianGrid {...chartGrid}/>
   <XAxis dataKey="month" tickFormatter={monthTick(locale)} interval={0} padding={{ left: 14, right: 14 }} {...chartAxis}/>
   <YAxis hide domain={axis.domain} ticks={axis.ticks}/>
   <Tooltip {...chartTooltip} labelFormatter={monthLabel(locale)} formatter={amount => [formatMoney(Number(amount), currency, locale), label]}/>
   <Area type="monotone" dataKey="balance" name="balance" {...leadArea('account-balance-fill')}/>
  </AreaChart>
 </ResponsiveContainer></div>;
}
