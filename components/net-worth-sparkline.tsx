"use client";
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { ChartGradient, chartHeight, leadArea, sparkChart } from '@/components/presentation-foundation/chart';

/** The dashboard headline's net worth trend: the line alone, no axes or tooltip, since the figure beside it is the
 * reading and the net worth card below has the full chart. Its own module, loaded through components/charts-lazy.tsx. */
export function NetWorthSparkline({ values }: { values: number[] }) {
 const data = values.map((net, index) => ({ index, net }));
 const low = Math.min(...values), high = Math.max(...values), pad = (high - low) * .08 || Math.abs(high) * .02 || 1;
 return <div className="net-worth-sparkline" aria-hidden="true"><ResponsiveContainer width="100%" height={chartHeight.spark}>
  <AreaChart data={data} {...sparkChart}>
   <ChartGradient id="net-worth-spark"/>
   <YAxis hide domain={[low - pad, high + pad]}/>
   <Area dataKey="net" type="monotone" {...leadArea('net-worth-spark')}/>
  </AreaChart>
 </ResponsiveContainer></div>;
}
