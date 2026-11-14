"use client";
import { normalizeEntry } from '@/lib/finance';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { marketRates, type MarketData } from '@/lib/market';
import { useMemo, useState, type ReactNode } from 'react';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { LoadingPlaceholder, StatTilesSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { Skeleton } from '@/components/ui/skeleton';
import { signTone } from '@/components/presentation-foundation/tone';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { useLanguage } from '@/components/language-provider';
import { monthlyReview } from '@/lib/transaction-tools';
import type { ToolsController } from '@/components/transaction-tools-panel';
import { emptyPlanning,type PlanningData } from '@/lib/planning';
import { depositToday } from '@/lib/deposit-interest';
import { shiftMonth } from '@/lib/calendar-days';
import { formatDate, formatMoney, formatMonthYear, formatPercent } from '@/lib/format';
import type { PortfolioSnapshot } from '@/lib/portfolio-snapshots';
/** The compact Cash flow summary while its month loads: same tiles and note line, so nothing below it moves. */
export function CashflowSummarySkeleton(){
 const {t}=useLanguage();
 return <section className="cashflow-summary" aria-label={t('Monthly review')}><StatTilesSkeleton label={t('Loading records…')} columns={4}/><Skeleton aria-hidden="true" className="h-4 w-80 max-w-full"/></section>;
}

type Estimates={income:number;spending:number;net:number};
/** How far a figure is towards its estimate, as the bar under a tile's value. */
const share=(value:number,estimate:number|null|undefined)=>estimate&&estimate>0?Math.min(100,Math.max(0,value/estimate*100)):0;
/** Income or spending against its estimate: the figure, a bar towards the estimate (red once spending passes it) and the estimate itself. */
function EstimateTile({label,value,amount,estimate,shown,spending=false,money}:{label:string;value:ReactNode;amount:number;estimate:number|undefined;shown:boolean;spending?:boolean;money:(amount:number)=>string}){
 const {t}=useLanguage();
 const over=spending&&shown&&estimate!=null&&amount>estimate;
 return <StatTile label={label} value={value}>
  <div className={over?'stat-tile-bar negative':spending?'stat-tile-bar':'stat-tile-bar positive'}><i style={{width:`${shown?share(amount,estimate):0}%`}}/></div>
  <p>{t('of {amount} expected',{amount:estimate==null?'—':money(estimate)})}</p>
 </StatTile>;
}
/** Cash flow's four figures, each measured against what the month is still expected to bring: income and spending carry
 * a bar towards their estimate, net cash flow and the savings rate (in the running month) carry the month's Estimated monthly surplus, as the Dashboard does. A month with
 * an amount no rate converts shows no total: — with the note, never a partial figure (MONEY-008). */
function CompactReview({result,estimates,running,unknown,loading,money}:{result:ReturnType<typeof monthlyReview>;estimates?:Estimates|null;/** The running month: the savings rate then says what the month's estimate expects. */running?:boolean;unknown:boolean;loading:boolean;money:(amount:number)=>string}){
 const {t,locale}=useLanguage();
 const figure=(text:string)=>loading?<Skeleton aria-hidden="true" className="h-7 w-3/4"/>:unknown?'—':text;
 const shown=!loading&&!unknown;
 const rate=result.received>0?result.saved/result.received*100:null;
 const or=(value:number|null|undefined,format:(value:number)=>string)=>value==null?'—':format(value);
 // The same Estimated monthly surplus the Dashboard shows, so one surplus figure means one thing on every page.
 const net=`${t('Estimated monthly surplus')}: ${or(estimates?.net,money)}`;
 return <section className="cashflow-summary" aria-label={t('Monthly review')}>
  <StatTiles columns={4}>
   <EstimateTile label={t('Income received')} value={figure(money(result.received))} amount={result.received} estimate={estimates?.income} shown={shown} money={money}/>
   <EstimateTile label={t('Actual spending')} value={figure(money(result.spent))} amount={result.spent} estimate={estimates?.spending} shown={shown} spending money={money}/>
   <StatTile label={t('Net cash flow')} hint={t('Income received minus actual spending this month. Loan and mortgage principal payments are transfers, not spending.')} value={figure(money(result.saved))} tone={shown?signTone(result.saved):undefined}><p>{net}</p></StatTile>
   {/* The month's savings rate, as the period report shows it for a quarter or a year (the user's choice, 20 October 2026). */}
   <StatTile label={t('Savings rate')} hint={t('The share of this month’s income that was not spent.')} value={figure(or(rate,value=>formatPercent(value,locale)))} tone={shown&&rate!==null?signTone(result.saved):undefined}>{running&&<p>{t('{percent} expected for the month',{percent:or(estimates&&estimates.income>0?estimates.net/estimates.income*100:null,value=>formatPercent(value,locale))})}</p>}</StatTile>
  </StatTiles>
  {!!result.missing&&<p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>}
 </section>;
}

export function MonthlyReview({data:providedData,owner,demo=false,revision=0,tools,snapshots,historyError,currency,market,compact=false,selectedMonth,estimates,running}:{compact?:boolean;selectedMonth?:string;estimates?:Estimates|null;/** The running month's projection: its tiles then say what the month is expected to end at. */running?:boolean;data:PlanningData;owner?:string|null;demo?:boolean;revision?:number;tools:ToolsController;snapshots:PortfolioSnapshot[];historyError:string;currency:string;market?:MarketData|null}){
 const {t,locale}=useLanguage();
 const today=depositToday();
 const [localMonth,setMonth]=useState(()=>today.slice(0,7));
 const month=selectedMonth??localMonth;
 // A month chosen by the page is the month its planning read already holds, so that one read stands in for a second.
 const live=!!owner&&!demo&&!selectedMonth;
 const remote=useOwnerResource('/api/planning?scope=review&month='+month,owner??null,live,revision,emptyPlanning);
 const data=useMemo(()=>live?{...remote.data,records:remote.data.records.map(normalizeEntry)}:providedData,[live,remote.data,providedData]);
 const rates=marketRates(market),splits=tools.data.splits;
 const result=useMemo(()=>monthlyReview(data.records,splits,snapshots,month,currency,today,data.activity,rates,data.investmentLinks),[data,splits,snapshots,month,currency,today,rates]);
 const money=(amount:number)=>formatMoney(amount,currency,locale);
 if(compact&&live&&remote.loading)return <CashflowSummarySkeleton/>;
 if(live&&(remote.loading||remote.error))return <section className="panel tools-panel monthly-review"><h2>{t('Monthly review')} · {formatMonthYear(month,locale)}</h2>{remote.error?<InlineError message={t(remote.error)} onRetry={remote.retry}/>:<LoadingPlaceholder label={t('Loading records…')} rows={3}/>}</section>;
 // A month with an amount no rate converts shows no total: — with the note, never a partial figure (MONEY-008).
 if(compact)return <CompactReview result={result} estimates={estimates} running={running} unknown={!!tools.error||!!result.missing} loading={tools.loading} money={money}/>;
 const previous=monthlyReview(data.records,splits,snapshots,shiftMonth(month,-1),currency,today,data.activity,rates,data.investmentLinks);
 return <section className="panel tools-panel monthly-review">
  <header className="monthly-review-heading">
   <div><div className="monthly-review-title"><h2>{t('Monthly review')} · {formatMonthYear(month,locale)}</h2></div></div>
   <label>{t('Month')}<DatePicker mode="month" value={month} max={today} onChange={setMonth}/></label>
  </header>
  {tools.error&&<InlineError message={t(tools.error)} onRetry={tools.retry}/>}
  <div className="review-grid monthly-review-metrics">{[
   {label:'Income received',value:result.received,previous:previous.received},
   {label:'Actual spending',value:result.spent,previous:previous.spent},
   {label:'Income minus expenses',value:result.saved,previous:previous.saved},
  ].map(item=><article key={item.label}><h3>{t(item.label)}</h3><strong className={item.value<0?'negative':undefined}>{money(item.value)}</strong><p className="muted">{t('Previous month')}: {money(item.previous)}</p></article>)}</div>
  {!!(result.missing+previous.missing)&&<p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>}
  <div className="monthly-review-net-worth"><strong>{t('Net-worth change')}: {historyError||result.netWorthChange===null?'—':money(result.netWorthChange)}</strong><p className="muted">{historyError?t('Net-worth history could not be loaded.'):result.netWorthChange!==null?t('Observed between {from} and {to}',{from:formatDate(result.from!,locale),to:formatDate(result.to!,locale)}):t('Two recorded balances are needed to show a change.')}</p></div>

 </section>;
}
