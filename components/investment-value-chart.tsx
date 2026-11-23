"use client";
import { useIsMobile } from '@/hooks/use-mobile';
import { useId, type ReactElement } from 'react';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChartViewport } from '@/hooks/use-chart-viewport';
import { pointsInView } from '@/lib/chart-viewport';
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney } from '@/lib/format';
import { ChartGradient, EndLabelTick, chartAxis, chartEndAxis, chartGrid, chartLine, chartTooltip, chartValueAxis, endLabelMoney, endLabelWidth, leadArea, distinctMoneyTick } from '@/components/presentation-foundation/chart';
import { evenTimeTicks, flooredAxis, niceAxis, spreadLabels } from '@/lib/chart-scale';
import { historyChartDate } from '@/lib/investment-history';

type Series={key:string;label:string;color:string;dash?:string;primary?:boolean};
type Point={date:string;[key:string]:string|number|null};
type Drawn=Point&{timestamp:number};
type Window={start:number;end:number}|null;

/** What a view draws: zoomed in, only the days in view, with the value axis fitted to them as a trading chart does
 * (its floor follows the lowest value shown); otherwise everything, on the floor the caller gave. */
function drawnWindow(all:Drawn[],view:Window,series:Series[],floor:number|undefined){
 const data=view?pointsInView(all,view):all;
 const finite=(keys:readonly string[])=>data.flatMap(point=>keys.map(key=>point[key])).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value));
 const lead=view&&floor!==undefined?finite(series.filter(item=>item.primary).map(item=>item.key)):[];
 const lastPoint=view?data.findLast(point=>point.timestamp<=view.end):all.at(-1);
 return {data,values:finite(series.map(item=>item.key)),floor:lead.length?Math.min(...lead):floor,lastPoint};
}

/** The time axis: the view when zoomed in, otherwise the first to the last day (a lone day gets one day of width). */
function timeDomain(first:number|undefined,last:number|undefined,view:Window):[number,number]|[string,string]{
 if(view)return [view.start,view.end];
 if(first===undefined||last===undefined)return ['dataMin','dataMax'];
 return [first,last===first?first+86400000:last];
}

/** The days the time axis labels: evenly spread over what is shown, so the first two never share the left edge; the
 * chart then drops any that would still touch at its width (`interval`, `minTickGap`). A lone day is one label. */
const dayTicks=(first:number|undefined,last:number|undefined,view:Window,count:number)=>first===undefined||last===undefined?undefined:view?evenTimeTicks(view.start,view.end,count):evenTimeTicks(first,last,count);

/** The history a chart can move through: none for a lone day. */
const extentOf=(all:Drawn[])=>all.length>1?{start:all[0].timestamp,end:all.at(-1)!.timestamp}:null;

/** Where a full-screen chart opens: the chosen period's first day, renewed each time a period is chosen. */
const opening=(start:string|undefined,pick:number)=>start?{start:Date.parse(start+'T00:00:00Z'),pick}:undefined;

/** The full-screen chart's zoom buttons, beside a line on how to drag and zoom. */
function ViewportTools({whole,canZoomIn,zoom,reset}:{whole:boolean;canZoomIn:boolean;zoom:(factor:number)=>void;reset:()=>void}){
 const {t}=useLanguage();
 return <div className="chart-viewport-tools">
  <span>{t('Drag to move through time, scroll to zoom')}</span>
  <Button type="button" variant="outline" size="icon" aria-label={t('Zoom out')} title={t('Zoom out')} disabled={whole} onClick={()=>zoom(1.6)}><ZoomOut aria-hidden="true"/></Button>
  <Button type="button" variant="outline" size="icon" aria-label={t('Zoom in')} title={t('Zoom in')} disabled={!canZoomIn} onClick={()=>zoom(1/1.6)}><ZoomIn aria-hidden="true"/></Button>
  <Button type="button" variant="outline" size="icon" aria-label={t('Show all history')} title={t('Show all history')} disabled={whole} onClick={reset}><Maximize aria-hidden="true"/></Button>
 </div>;
}
/** Renders nothing: the tooltip keeps tracking the touched day without drawing over the details window. */
const noTooltip=()=>null;

/** `floor`, when given, is where the value axis starts: the chart's main line then opens in the bottom-left corner.
 * `navigable` (the full-screen card) lets the person drag through time and zoom, as on a trading chart; it opens at
 * `initialStart` (the chosen period's first day), `periodPick` changes each time a period is chosen, and `onViewMove`
 * hears the person drag or zoom away from it. */
export function InvestmentValueChart({points,series,currency,tooltip,onPointSelect,floor,height=310,label='Investment value',navigable=false,initialStart,periodPick=0,onViewMove}:{initialStart?:string;periodPick?:number;onViewMove?:()=>void;points:Point[];series:Series[];currency:string;tooltip?:ReactElement;onPointSelect?:(date:string)=>void;floor?:number;height?:number;label?:string;navigable?:boolean}){
 const {locale,t}=useLanguage(),id=useId();
 const mobile=useIsMobile();
 // On phones a tap opens the point's details window; a tooltip drawn under the same finger would show through it
 // as the window fades in and look like a flash, so there the tooltip stays empty (its cursor line still marks the day).
 const tapOpensDetails=mobile&&!!onPointSelect;
 const all:Drawn[]=points.map(point=>({...point,timestamp:Date.parse(point.date+'T00:00:00Z')}));
 const first=all[0]?.timestamp,last=all.at(-1)?.timestamp;
 const single=all.length===1;
 const {ref:viewportRef,view:viewportView,whole,zoom,reset,consumeDrag}=useChartViewport(extentOf(all),navigable,opening(initialStart,periodPick),onViewMove);
 const view=navigable&&!whole?viewportView:null;
 const {data,values,floor:shownFloor,lastPoint}=drawnWindow(all,view,series,floor);
 const axis=shownFloor===undefined?niceAxis(values):flooredAxis(values,shownFloor);
 const money=(amount:number)=>formatMoney(amount,currency,locale);
 // Each line's latest figure sits at its right end, spread so close lines keep readable labels (about 24px apart).
 const endMoney=endLabelMoney(currency,locale);
 const ends=spreadLabels(series.flatMap(item=>{const value=lastPoint?.[item.key];return typeof value==='number'&&Number.isFinite(value)?[{value,color:item.color}]:[];}),axis.domain,(axis.domain[1]-axis.domain[0])*24/Math.max(1,height-65)).map(item=>({at:item.at,color:item.color,text:endMoney(item.value)}));
 const chart=<ResponsiveContainer width="100%" height={navigable?Math.max(200,height-44):height}><ComposedChart data={data} accessibilityLayer onClick={state=>{
   // A drag through time ends in a click; it moved the chart and opens no day. Clicks in the axis margins report a
   // stale index; only open the hovered point.
   if(consumeDrag()||!state.isTooltipActive)return;
   const index=state.activeTooltipIndex;
   if(index===undefined||index===null||index==='')return;
   const point=data[Number(index)];
   if(point&&series.length)onPointSelect?.(point.date);
  }} margin={{top:15,right:15,left:5,bottom:20}}>
  <ChartGradient id={id}/>
  <CartesianGrid {...chartGrid}/>
  <XAxis dataKey="timestamp" type="number" scale="time" domain={timeDomain(first,last,view)} allowDataOverflow={!!view} ticks={dayTicks(first,last,view,mobile?3:5)} interval="preserveStartEnd" tickFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} minTickGap={32} {...chartAxis}/>
  <YAxis domain={axis.domain} ticks={axis.ticks} allowDataOverflow tickFormatter={distinctMoneyTick(axis.ticks,currency,locale)} {...chartValueAxis}/>
  {ends.length>0&&<YAxis yAxisId="ends" domain={axis.domain} ticks={ends.map(item=>item.at)} width={endLabelWidth(ends)} tick={<EndLabelTick labels={ends}/>} {...chartEndAxis}/>}
  <Tooltip {...chartTooltip} position={mobile?{x:0,y:40}:undefined} offset={{x:0,y:20}} allowEscapeViewBox={{x:false,y:true}} content={tapOpensDetails?noTooltip:tooltip} labelFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} formatter={amount=>money(Number(amount))} wrapperStyle={{zIndex:20,pointerEvents:'auto',maxWidth:'100%',...(mobile?{width:'100%',whiteSpace:'normal' as const}:{})}}/>
  {series.map(item=><Area key={item.key} type="monotone" dataKey={item.key} name={item.label} baseValue="dataMin" {...(item.primary?leadArea(id):{...chartLine,fill:'none'})} stroke={item.color} strokeDasharray={item.dash} connectNulls={false} activeDot={false}/>)}
 </ComposedChart></ResponsiveContainer>;
 if(!navigable)return <div className="portfolio-chart" aria-label={t(label)}>{chart}</div>;
 return <div ref={viewportRef} className="portfolio-chart" data-navigable="" aria-label={t(label)}>
  <ViewportTools whole={whole} canZoomIn={!single&&!!viewportView} zoom={zoom} reset={reset}/>
  {chart}
 </div>;
}
