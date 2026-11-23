"use client";
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/components/language-provider';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import { SeriesLegend, toggleKey } from '@/components/presentation-foundation/series-legend';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { times } from '@/components/presentation-foundation/skeleton-kit';
import { chartAxis, chartColors, chartDot, chartGrid, chartHeight, chartLine, chartMargin, chartTooltip, chartValueAxis, distinctMoneyTick, leadLine } from '@/components/presentation-foundation/chart';
import { formatDate, formatMoney, formatMonthYear, formatNumber, formatPercent, formatSignedMoney, formatSignedPercent } from '@/lib/format';
import { niceAxis } from '@/lib/chart-scale';
import { categoryColor } from '@/lib/category-colors';
import { historyChartDate, historyPerformance, historySeries, historyValueLabel, isLendingKind, linkedPaymentKinds, type HistoryEvent, type TrackerEvent } from '@/lib/investment-history';
import { depositInterest, depositProjection, depositToday } from '@/lib/deposit-interest';
import { isHolding } from '@/lib/asset-movements';
import { interestCompounding, interestKinds, isCounted, type Entry } from '@/lib/finance';
import type { MovementDraft } from '@/components/planning/asset-movement-dialog';

type Point=ReturnType<typeof historySeries>['points'][number];
type SeriesKey='balance'|'contributions'|'receipts';
const day=86400000;
/** Performance figures belong to what is owned and valued: not to money owed, and not to a cash balance. */
const tracksReturn=(kind:string)=>!isLendingKind(kind)&&kind!=='Cash';
/** The tiles a kind shows: the lead figure, the two performance figures where they apply, and its two totals. */
const tileCount=(kind:string)=>kind==='Cash'?1:tracksReturn(kind)?5:3;

/** A kind's two running totals: what a loan has repaid and added, a mortgage's principal and interest, an asset's income and costs. */
function historyTotals(kind:string,stats:ReturnType<typeof historySeries>):[string,number|null][]{
 if(kind==='Cash')return [];
 if(kind==='Mortgage')return [['Principal repaid',stats.principal],['Interest paid',stats.interest]];
 return isLendingKind(kind)?[['Repayments recorded',stats.repayments],['Additions recorded',stats.additions]]:[['Income received',stats.receipts],['Expense paid',stats.expenses]];
}

/** The key figures: the latest value across the row, then how the asset has done and what it has paid or cost. */
function TrackerTiles({record,events}:{record:Entry;events:TrackerEvent[]}){
 const {t,locale}=useLanguage();
 const stats=historySeries(events),performance=historyPerformance(events);
 const lending=isLendingKind(record.kind);
 const money=(amount:number|null)=>amount===null?'—':formatMoney(amount,record.currency,locale);
 const signed=(amount:number|null)=>amount===null?'—':formatSignedMoney(amount,record.currency,locale);
 const lead=lending||record.kind==='Cash'||interestKinds.includes(record.kind)?historyValueLabel(record.kind):'Latest tracked value (your share)';
 const shared=!lending&&stats.fullBalance!==null&&stats.ownership<100;
 const performs=tracksReturn(record.kind);
 return <StatTiles columns="auto">
  <StatTile label={t(lead)} value={money(stats.balance)}>{isCounted(record)&&stats.quantity!==null&&stats.unitValue!==null&&<p>{t('{quantity} {unit} × {value}',{quantity:formatNumber(stats.quantity,locale,8),unit:record.unit_label??'',value:money(stats.unitValue)})}</p>}{shared&&<p>{t('Full value {amount} · you own {percent}',{amount:money(stats.fullBalance),percent:formatPercent(stats.ownership,locale)})}</p>}</StatTile>
  {performs&&<StatTile label={t('Value change')} value={signed(performance.change)} tone={signTone(performance.change)}>{performance.changePercent!==null&&performance.firstDate&&<p>{t('{percent} since {date}',{percent:formatSignedPercent(performance.changePercent,locale),date:formatDate(performance.firstDate,locale)})}</p>}</StatTile>}
  {performs&&<StatTile label={t('Total return')} value={signed(performance.result)} tone={signTone(performance.result)} hint={<p>{t('Value change plus income received, minus expenses paid and net contributions, since the first tracked value.')}</p>}/>}
  {historyTotals(record.kind,stats).map(([label,amount])=><StatTile key={label} label={t(label)} value={money(amount)}/>)}
 </StatTiles>;
}

/** A deposit's interest estimate; how it is worked out sits behind its ⓘ. */
function DepositEstimate({record,events}:{record:Entry;events:TrackerEvent[]}){
 const {t,locale}=useLanguage();
 const money=(amount:number)=>formatMoney(amount,record.currency,locale);
 // A deposit has no linked payments, so every amount of its history is known.
 const ledger=events.filter((event):event is HistoryEvent=>event.amount!==null);
 const compounding=interestCompounding(record);
 const projection=depositProjection(ledger,record.rate,undefined,compounding,record.date);
 return <div className="ownership-summary">
  <p>{t('Estimated interest for {month}: {amount}',{month:formatMonthYear(depositToday().slice(0,7),locale),amount:money(depositInterest(ledger,record.rate,undefined,compounding,record.date))})}<InfoHint><p>{t(({monthly:'Monthly compounding',daily:'Daily compounding',none:'No compounding'})[compounding??'monthly'])}. {t('Top-ups and withdrawals affect interest from their recorded date. Estimates use the current annual rate. A confirmed balance or interest credit replaces the projection.')}</p><p>{t('Estimates start at the first dated balance. Record confirmed capitalized interest to update the available balance. Projections are not spendable cash.')}</p></InfoHint></p>
  <p>{t('Estimated balance including interest')}: {money(projection.total)}</p>
 </div>;
}

/** The lines a chart draws: the value always; money put in and income only where the history has any. */
function chartSeries(kind:string,points:readonly Point[]){
 const moved=(key:'contributions'|'receipts')=>tracksReturn(kind)&&points.some(point=>!!point[key]);
 return [
  {key:'balance' as SeriesKey,label:historyValueLabel(kind),type:'linear' as const,look:{...leadLine,dot:chartDot}},
  ...(moved('contributions')?[{key:'contributions' as SeriesKey,label:'Net contributions',type:'stepAfter' as const,look:{...chartLine,stroke:categoryColor('Property'),strokeDasharray:'5 4'}}]:[]),
  ...(moved('receipts')?[{key:'receipts' as SeriesKey,label:'Income received',type:'stepAfter' as const,look:{...chartLine,stroke:chartColors.income}}]:[]),
 ];
}

/** The dated values as a line, with what was put in and received beside it. A lone value is a dot on a bounded axis. */
function TrackerChart({record,points}:{record:Entry;points:Point[]}){
 const {t,locale}=useLanguage();
 const [hidden,setHidden]=useState<string[]>([]);
 const series=chartSeries(record.kind,points),drawn=series.filter(item=>!hidden.includes(item.key));
 const axis=niceAxis(points.flatMap(point=>drawn.map(item=>point[item.key])).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value)));
 const first=points[0].timestamp,last=points.at(-1)!.timestamp;
 const dateLabel=(date:unknown)=>formatDate(historyChartDate(Number(date)),locale);
 return <div className="tracker-chart" aria-label={t('Investment history chart')}>
  <ResponsiveContainer width="100%" height={chartHeight.compact}><LineChart data={points} margin={chartMargin} accessibilityLayer>
   <CartesianGrid {...chartGrid}/>
   <XAxis dataKey="timestamp" type="number" scale="time" domain={[first,last===first?first+day:last]} ticks={last===first?[first]:undefined} tickFormatter={dateLabel} minTickGap={80} {...chartAxis}/>
   <YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={distinctMoneyTick(axis.ticks,record.currency,locale)} {...chartValueAxis}/>
   <Tooltip {...chartTooltip} labelFormatter={dateLabel} formatter={value=>value===null||value===undefined?'—':formatMoney(Number(value),record.currency,locale)}/>
   {drawn.map(item=><Line key={item.key} type={item.type} dataKey={item.key} name={t(item.label)} {...item.look} connectNulls={false}/>)}
  </LineChart></ResponsiveContainer>
  <SeriesLegend items={series.map(item=>({key:item.key,label:t(item.label),swatch:<i style={{background:item.look.stroke}}/>}))} hidden={hidden} onToggle={key=>setHidden(previous=>toggleKey(previous,key))}/>
 </div>;
}

/** What the record lets the person do from its tracker, as one row that wraps. */
function TrackerActions({record,busy,onMovement,onPayment,onAddEntry}:{record:Entry;busy:boolean;onMovement:(movement:MovementDraft)=>void;onPayment:()=>void;onAddEntry?:(direction:'income'|'expense')=>void}){
 const {t}=useLanguage();
 // Money moves in and out of a bank deposit alone: a bill or bond is bought once (`record_asset_movement` refuses them).
 const movable=record.kind==='Deposit';
 // Units at a quoted price: stocks, crypto, metals and vested equity are bought and sold by quantity.
 const trades=movable||isHolding(record);
 // A business's or a property's income and expenses are ordinary transactions that name it: the normal forms open.
 const entries=!!onAddEntry&&linkedPaymentKinds.includes(record.kind);
 if(!trades&&!entries&&record.kind!=='Cash'&&record.kind!=='Mortgage')return null;
 return <div className="entry-actions">
  {entries&&<Button type="button" variant="outline" disabled={busy} onClick={()=>onAddEntry('income')}>{t('Add income')}</Button>}
  {entries&&<Button type="button" variant="outline" disabled={busy} onClick={()=>onAddEntry('expense')}>{t('Add expense')}</Button>}
  {record.kind==='Cash'&&<Button type="button" variant="outline" disabled={busy} onClick={()=>onMovement({kind:'transfer',source_id:record.id})}>{t('Transfer money')}</Button>}
  {trades&&<Button variant="outline" onClick={()=>onMovement({kind:movable?'transfer':'buy',target_id:record.id})}>{t(movable?'Top-up':'Buy')}</Button>}
  {trades&&<Button variant="outline" onClick={()=>onMovement({kind:movable?'transfer':'sell',source_id:record.id})}>{t(movable?'Withdraw':'Sell / convert')}</Button>}
  {movable&&<Button variant="outline" onClick={()=>onMovement({kind:'interest',source_id:record.id})}>{t('Record capitalized interest')}</Button>}
  {record.kind==='Mortgage'&&<Button type="button" variant="outline" disabled={busy} onClick={onPayment}>{t('Record payment')}</Button>}
 </div>;
}

/** The Overview while the history loads: the kind's tiles and the chart with its legend, in their loaded places. */
function OverviewSkeleton({kind,label}:{kind:string;label:string}){
 return <div role="status" aria-busy="true" className="tracker-overview"><span className="sr-only">{label}</span>
  <div className="stat-tiles" data-columns="auto" aria-hidden="true">{times(tileCount(kind)).map(tile=><article className="stat-tile" key={tile}><Skeleton className="h-[18px] w-24"/><Skeleton className={tile?'h-[18px] w-20 max-w-full':'h-[30px] w-40 max-w-full'}/></article>)}</div>
  <div className="tracker-chart" aria-hidden="true"><ChartSkeleton height={chartHeight.compact}/><div className="comparison-legend"><Skeleton className="h-8 w-36 rounded-full"/></div></div>
 </div>;
}

type Props={record:Entry;events:TrackerEvent[];loading:boolean;busy:boolean;onMovement:(movement:MovementDraft)=>void;onPayment:()=>void;/** Opens the normal income or expense form with this business or property chosen. */onAddEntry?:(direction:'income'|'expense')=>void};

/** The tracker's Overview tab: the figures, the chart, then the record's own actions. */
export function TrackerOverview({record,events,loading,busy,onMovement,onPayment,onAddEntry}:Props){
 const {t}=useLanguage();
 const stats=historySeries(events);
 return <>
  {loading?<OverviewSkeleton kind={record.kind} label={t('Loading history…')}/>:<div className="tracker-overview">
   <TrackerTiles record={record} events={events}/>
   {interestKinds.includes(record.kind)&&<DepositEstimate record={record} events={events}/>}
   {stats.missing&&<p className="muted">{t('Exchange rate unavailable.')}</p>}
   {stats.points.length>0&&<TrackerChart record={record} points={stats.points}/>}
  </div>}
  <TrackerActions record={record} busy={busy} onMovement={onMovement} onPayment={onPayment} onAddEntry={onAddEntry}/>
 </>;
}
