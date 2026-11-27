"use client";
import { pastDatePresets } from '@/lib/date-picker-calendar';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { HypotheticalNetWorthCards } from '@/components/hypothetical-net-worth';
import { hypotheticalNetWorth, netWorthChart, netWorthLine } from '@/lib/hypothetical-net-worth';
import { periodGrowth,type PeriodGrowth } from '@/lib/period-growth';
import { benchmarkMethodStorageKey, readBenchmarkScope, investmentComparisonCoverage, investmentDecisionComparison, purchaseComparisonStart, comparisonMethod, type ComparisonMethod, type BenchmarkMovement, type FundingScope } from '@/lib/investment-benchmarks';
import { showError } from '@/lib/feedback';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BenchmarkTooltip } from '@/components/benchmark-tooltip';
import { demoBenchmarkKeys } from '@/lib/demo-finance';
import { readOverviewBenchmarks, overviewBenchmarkStorageKey, toggleOverviewBenchmark, overviewSeriesVisible } from '@/lib/overview-benchmarks';
import { portfolioQuotes } from '@/lib/diversified-portfolio';
import { stockBenchmarks } from '@/lib/benchmark-selection';
import { refreshRead } from '@/lib/refresh-read';
import { InvestmentValueChart } from '@/components/charts-lazy';
import { useEffect,useMemo,useState,type ReactNode } from 'react';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatPercent } from '@/lib/format';
import { type Entry } from '@/lib/finance';
import { type MarketData } from '@/lib/market';
import { type HistoryEvent } from '@/lib/investment-history';
import { depositBenchmarks, type BenchmarkData, type FxPoint } from '@/lib/benchmark-data';
import { mergeFx } from '@/lib/history-rates';
import { pricesByRecord, type HoldingPrices } from '@/lib/holding-prices';
import { benchmarkColor,defaultBenchmarkColor,defaultComparisonPreferences,isInvestmentRecord,type ComparisonProfile } from '@/lib/comparison-profile';
import Link from 'next/link';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { benchmarksLink } from '@/lib/add-links';
import { ChartNoAxesCombined } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/presentation-foundation/empty-state';

type History={movements?:BenchmarkMovement[];records:Entry[];events:HistoryEvent[];cashflows?:Entry[];/** Past closes of quoted holdings, by series. */prices?:HoldingPrices};
export function InvestmentComparison({fx,allPoints,periodPick,onViewMove,history,today,currency,market,demo,windowStart,points,summary,profile,profileError,trackingStart,onTrackingStartChange,onGrowth,chartHeight}:{/** The rates the net worth line converts each day with; the comparison converts with the same ones. */fx?:FxPoint[];/** Net worth over the whole tracked history: in full screen the chart holds all of it and the period only sets its zoom. */allPoints?:{date:string;net:number}[];/** Changes each time a period is chosen, so choosing one again zooms back to it. */periodPick?:number;/** The person dragged or zoomed the full-screen chart away from the chosen period. */onViewMove?:()=>void;/** The chart's height when its card fills the window; the usual height otherwise. */chartHeight?:number;onGrowth?:(growth:PeriodGrowth|null)=>void;windowStart:string;points:{date:string;net:number}[];summary?:ReactNode|((fx:FxPoint[]|undefined,scope:FundingScope)=>ReactNode);history:History;today:string;currency:string;market:MarketData|null;demo:boolean;profile:ComparisonProfile|null;profileError:string;trackingStart:string|null;onTrackingStartChange:(date:string|null)=>Promise<void>}){
 const {t,locale}=useLanguage();
 const [data,setData]=useState<BenchmarkData|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[loadedKey,setLoadedKey]=useState('');
 const [overviewSelection,setOverviewSelection]=useState<{owner:string;keys:string[]}|null>(null);
 const [scopeChoice,setScopeChoice]=useState<{owner:string;scope:FundingScope}|null>(null);
 const [savingStart,setSavingStart]=useState(false);
 const [detailDate,setDetailDate]=useState<string|null>(null);
 const overviewOwner=demo?'demo':profile?.owner_id;
 useEffect(()=>{
  if(!overviewOwner)return;
  let cancelled=false;
  queueMicrotask(()=>{
   if(cancelled)return;
   // Until the owner chooses, show the headline market benchmarks rather than an empty comparison.
   let keys:string[]=[...demoBenchmarkKeys];
   try{if(localStorage.getItem(overviewBenchmarkStorageKey(overviewOwner))!==null)keys=readOverviewBenchmarks(localStorage,overviewOwner);}catch{}
   setOverviewSelection({owner:overviewOwner,keys});
   try{const saved=readBenchmarkScope(localStorage,overviewOwner);if(saved)setScopeChoice({owner:overviewOwner,scope:saved});}catch{}
  });
  return()=>{cancelled=true;};
 },[overviewOwner,demo]);
 const coverage=useMemo(()=>investmentComparisonCoverage(history.records,history.events,today),[history.records,history.events,today]);
 const scope=scopeChoice&&scopeChoice.owner===overviewOwner?scopeChoice.scope:'investments';
 const purchaseStart=useMemo(()=>purchaseComparisonStart({records:history.records,events:history.events,movements:history.movements,cashflows:history.cashflows,today},scope),[history,today,scope]);
 const plan=useMemo(()=>comparisonMethod(trackingStart,purchaseStart,today,scope),[trackingStart,purchaseStart,today,scope]);
 const {trackingFrom,earliestStart,beforeMarketHistory,chosenEarlier}=plan;
 const method:ComparisonMethod=plan.method;
 function chooseScope(next:FundingScope){if(!overviewOwner)return;setScopeChoice({owner:overviewOwner,scope:next});setDetailDate(null);try{localStorage.setItem(benchmarkMethodStorageKey(overviewOwner),JSON.stringify({scope:next}));}catch{}}
 async function chooseTrackingStart(date:string|null){setSavingStart(true);try{await onTrackingStartChange(date);setDetailDate(null);}catch(reason){showError((reason as Error).message);}finally{setSavingStart(false);}}
 const overviewKeys=overviewSelection?.owner===overviewOwner?overviewSelection?.keys??[]:[];
 function toggleOverview(key:string){
  if(!overviewOwner)return;
  const keys=toggleOverviewBenchmark(overviewKeys,key);
  setOverviewSelection({owner:overviewOwner,keys});
  try{localStorage.setItem(overviewBenchmarkStorageKey(overviewOwner),JSON.stringify(keys));}catch{/* The current selection still works when browser storage is unavailable. */}
 }
 const start=method.date;
 const selected:readonly string[]=demo?demoBenchmarkKeys:profile?.preferences.benchmarks??defaultComparisonPreferences.benchmarks;
 // Legend visibility is presentation state. Keep every configured benchmark
 // loaded so hiding and restoring lines never changes the request or simulation.
 const selectionKey=selected.join(',');
 const symbol=profile?.preferences.custom_symbol??'';
 const diversified=profile?.preferences.portfolio;
 const activeDiversified=selected.includes('PORTFOLIO')?diversified:null;
 const portfolioConfig=activeDiversified?.assets?JSON.stringify(activeDiversified):'';
 const portfolioCrypto=selected.includes('PORTFOLIO')&&!diversified?.assets&&diversified?.crypto?diversified.cryptoSymbol:'';
 const portfolioStock=selected.includes('PORTFOLIO')&&!diversified?.assets&&diversified?.stock?diversified.stockSymbol:'';
 const requestKey=points.length?start+':'+today+':'+selectionKey+':'+symbol+':'+portfolioCrypto+':'+portfolioStock+':'+portfolioConfig:'';
 const canLoad=(demo||!!profile||!!profileError)&&(!!profileError||overviewSelection?.owner===overviewOwner);
 useEffect(()=>{
  if(!requestKey||!canLoad)return;
  const controller=new AbortController(),params=new URLSearchParams({start,end:today,benchmarks:selectionKey});
  if(portfolioConfig)params.set('portfolio',portfolioConfig);
  if(symbol)params.set('symbol',symbol);
  if(portfolioCrypto)params.set('portfolioCrypto',portfolioCrypto);
  if(portfolioStock)params.set('portfolioStock',portfolioStock);
  refreshRead(demo?'/api/benchmarks?demo=1':'/api/benchmarks?'+params,{signal:controller.signal,cache:'default'}).then(async response=>{const result=await response.json() as BenchmarkData&{error?:string};if(!response.ok)throw Error(result.error);if(!controller.signal.aborted){setData(result);setLoadedKey(requestKey);setError('');}}).catch(reason=>{if(!controller.signal.aborted){setError(reason.message);setLoadedKey(requestKey);setData(null);}});
  return()=>controller.abort();
 },[demo,requestKey,start,today,selectionKey,symbol,portfolioCrypto,portfolioStock,portfolioConfig,retry,canLoad]);
 const comparisonsLoading=!!requestKey&&((!demo&&!profile&&!profileError)||loadedKey!==requestKey);
 const loaded=loadedKey===requestKey?data:null;
 // One basis: the comparison converts each day at the rates the net worth line used for it.
 const ready=useMemo(()=>loaded?{...loaded,fx:mergeFx(loaded.fx,fx)}:null,[loaded,fx]);
 // The period summary converts with the same dated rates as the chart, so their funding totals agree.
 const summaryNode=typeof summary==='function'?summary(ready?.fx,scope):summary;
 // Quoted holdings follow the same past closes as the net worth line, so a benchmark line never moves with them.
 const holdingCloses=useMemo(()=>pricesByRecord(history.records,history.prices),[history.records,history.prices]);
 const decision=useMemo(()=>ready?investmentDecisionComparison({records:history.records,events:history.events,cashflows:history.cashflows,movements:history.movements,market,currency,today,method,prices:holdingCloses},ready,activeDiversified):null,[ready,history,market,currency,today,method,activeDiversified,holdingCloses]);
 const definitions=[{key:'actual',label:t('Net worth'),color:'var(--primary)',dash:undefined,quotes:undefined},...stockBenchmarks(profile?.preferences.benchmarks??[]).map(item=>({key:item.id,label:item.symbol,color:defaultBenchmarkColor(item.id),dash:'12 4',quotes:[{key:item.id,symbol:item.symbol}]})),{key:'BTC',label:'Bitcoin · BTC',color:defaultBenchmarkColor('BTC'),dash:undefined,quotes:[{key:'BTC',symbol:'BTC'}]},{key:'SPY',label:'S&P 500 · SPY',color:defaultBenchmarkColor('SPY'),dash:'7 3',quotes:[{key:'SPY',symbol:'SPY'}]},{key:'HYG',label:t('High-yield bonds · HYG'),color:defaultBenchmarkColor('HYG'),dash:'9 3 2 3',quotes:[{key:'HYG',symbol:'HYG'}]},{key:'BIL',label:t('US Treasury bills · BIL'),color:defaultBenchmarkColor('BIL'),dash:'4 2',quotes:[{key:'BIL',symbol:'BIL'}]},...depositBenchmarks.map(deposit=>({key:deposit.key as string,label:t('{currency} deposit · {rate}',{currency:deposit.currency,rate:formatPercent(deposit.rate,locale)}),color:defaultBenchmarkColor(deposit.key),dash:deposit.key==='depositUZS'?'5 5':'2 4',quotes:undefined})),{key:'CUSTOM',label:symbol,color:defaultBenchmarkColor('CUSTOM'),dash:'12 4',quotes:[{key:'CUSTOM',symbol}]},{key:'PORTFOLIO',label:t('Diversified portfolio'),color:defaultBenchmarkColor('PORTFOLIO'),dash:'8 3 2 3',quotes:activeDiversified?portfolioQuotes(activeDiversified):undefined}];
 const colors=profile?.preferences.colors;
 const displayed=definitions.filter(item=>item.key==='actual'||selected.includes(item.key)).map(item=>item.key==='actual'?item:{...item,color:benchmarkColor(item.key,colors)});
 const visibleSeries=displayed.filter(item=>overviewSeriesVisible(overviewKeys,item.key));
 const visibleKeys=new Set(visibleSeries.map(item=>item.key));
 const overviewResult=decision?.result;
 const chartPoints=(overviewResult?.points??[]).filter(point=>point.date>=windowStart);
 const chartSeries=visibleSeries;
 // The chart draws net worth, debts subtracted, and each benchmark as the net worth it would have led to. The
 // comparison's own points keep the investment value, which the period's growth and funding totals read.
 const benchmarkKeys=displayed.filter(item=>item.key!=='actual').map(item=>item.key);
 const shownPoints=netWorthChart(chartPoints,points,benchmarkKeys);
 // In full screen the chart holds the whole history, as a trading chart does: the period picks where it opens, and
 // dragging or zooming out reaches every earlier day. Its value axis fits the days in view.
 const navigable=chartHeight!==undefined;
 // Without any investment, or with only ones worth nothing and never paid into (a $0 business), there is nothing to
 // compare: invite the first one instead of drawing a flat line at zero.
 const nothingInvested=!history.records.some(isInvestmentRecord)||(!!decision&&chartPoints.length>0&&chartPoints.every(point=>!point.actual&&!point.contributed));
 // Net worth is worth drawing for cash and debts alone: with two days of it, the line is shown and the invitation sits under it.
 const lineAlone=scope==='investments'&&nothingInvested&&points.length>1;
 // Net worth needs no benchmark data: while comparisons load, or when they cannot be worked out, its line is drawn alone.
 const wholeHistory=navigable&&allPoints?allPoints:null;
 const chartData=overviewResult&&!lineAlone?wholeHistory?netWorthChart(overviewResult.points,wholeHistory,benchmarkKeys):shownPoints:netWorthLine(wholeHistory??points);
 const detailPoint=chartData.find(point=>point.date===detailDate);
 // The axis starts at net worth on the first shown day, so its line opens in the bottom-left corner. A later dip
 // below that value lowers the floor to it: the main line is never cut off, only benchmarks below it are.
 const netWorthValues=chartData.map(point=>point.actual).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value));
 const floor=visibleKeys.has('actual')&&netWorthValues.length?Math.min(...netWorthValues):undefined;
 // The period's change in investments, split into money put in and returns, for the net worth headline.
 const growth=comparisonsLoading?null:periodGrowth(chartPoints);
 const growthReturns=growth?.returns,growthInvested=growth?.invested;
 useEffect(()=>{onGrowth?.(growthReturns===undefined||growthInvested===undefined?null:{returns:growthReturns,invested:growthInvested});},[onGrowth,growthReturns,growthInvested]);
 // Net worth today, and what it would be had investments and spending gone into each shown benchmark.
 const netWorth=points.at(-1)?.net;
 const whatIf=scope==='expenses'?hypotheticalNetWorth(netWorth,overviewResult?.points.at(-1),visibleSeries.filter(item=>item.key!=='actual').map(item=>item.key)):[];
 if(scope==='investments'&&nothingInvested&&!lineAlone)return <>
  <EmptyState icon={<ChartNoAxesCombined aria-hidden="true"/>} title={t('No investments yet')} description={t('Add a stock, crypto, deposit, Treasury bill or another investment to follow its value and compare it with the market.')}><Button asChild><Link href="/assets">{t('Add asset')}</Link></Button></EmptyState>
  {summaryNode}
 </>;
 return <>
  {!lineAlone&&<div className="overview-chart-heading"><div className="overview-chart-title"><Segmented className="funding-switch" label={t('Benchmark funding')} options={[{value:'investments' as FundingScope,label:t('Excluding expenses')},{value:'expenses' as FundingScope,label:t('Including expenses')}]} value={scope} onChange={next=>{if(overviewOwner)chooseScope(next);}}/></div><div className="comparison-legend" aria-busy={comparisonsLoading}>{displayed.map(item=><button key={item.key} type="button" aria-pressed={visibleKeys.has(item.key)} disabled={!overviewOwner} onClick={()=>toggleOverview(item.key)}><i style={{background:item.color}}/>{item.label}</button>)}</div></div>}
  {ready&&!decision&&<p className="comparison-notice">{t('Investment history or exchange rates are incomplete for this comparison.')}</p>}
  {ready&&visibleSeries.filter(item=>item.key!=='actual').map(item=>{const reason=ready.errors[item.key]??ready.errors.fx??(overviewResult?.unavailable.includes(item.key)?'Price data, exchange rates or funds needed for a matching withdrawal are unavailable.':null);return reason?<p key={item.key} className="comparison-note">{item.label}: {t(reason)}</p>:null;})}
  {comparisonsLoading&&!chartData.length?<ChartSkeleton label={t('Loading comparisons…')}/>:!!chartData.length&&<><InvestmentValueChart navigable={navigable} initialStart={navigable?windowStart:undefined} periodPick={periodPick} onViewMove={onViewMove} onPointSelect={setDetailDate} label={t('Net worth')} floor={floor} height={chartHeight} points={chartData} currency={currency} series={(overviewResult&&!lineAlone?chartSeries:definitions.slice(0,1)).map(item=>({...item,primary:item.key==='actual'}))} tooltip={<BenchmarkTooltip marketHistory={ready} fundingDetails={decision?.details} receipts={[]} currency={currency} series={chartSeries}/>}/></>}
  {lineAlone&&<p className="comparison-note">{t('Add a stock, crypto, deposit, Treasury bill or another investment to follow its value and compare it with the market.')} <Link href="/assets">{t('Add asset')}</Link></p>}
  {scope==='expenses'&&netWorth!==undefined&&<HypotheticalNetWorthCards netWorth={netWorth} rows={whatIf} series={visibleSeries} currency={currency}/>}
  {summaryNode}
  {!lineAlone&&<details className="overview-details"><summary>{t('Tracking since {date}',{date:formatDate(method.date,locale)})}</summary>
   <div className="form-grid"><label className="tracking-start" aria-busy={savingStart}>{t('Start date')}{/* The picker shows the day the chart starts from and offers no day before the first investment activity: there is no value to compare from earlier. */}<DatePicker value={trackingFrom??''} required={false} min={earliestStart} max={today} presets={pastDatePresets} onChange={date=>{if(!savingStart)void chooseTrackingStart(date||null);}}/></label></div>
   <p className="comparison-note">{chosenEarlier?t('Comparisons start on {date}, the day of your first investment, because nothing was invested before the tracking start you chose.',{date:formatDate(method.date,locale)}):trackingFrom?t('Tracking starts on {date}. Benchmarks start from your investment value that day, and nothing earlier is shown. Clear the date to track from your first investment.',{date:formatDate(trackingFrom,locale)}):t('Tracking starts with your first investment activity. Choose a tracking start date to begin later, for example after you finished entering existing holdings.')}</p>
   <p className="comparison-note">{t('The main line is your net worth: everything you own minus your debts. Each benchmark line is the net worth you would have had the same money gone into that benchmark instead.')}</p>
   <p className="comparison-note">{t(scope==='expenses'?'Investment purchases, principal repayments and every recorded expense fund benchmarks. Spending adds nothing to your investment value, so the gap shows what it cost. Transfers between your accounts and income receipts are not counted.':'Investment purchases and principal repayments fund benchmarks. Explicit transfers between investments are not counted again. Cash balances and income receipts are excluded.')}</p>
   {beforeMarketHistory&&<p className="comparison-note">{t('Market history starts on {date}. Earlier purchases are compared from their recorded values on that day.',{date:formatDate(earliestStart,locale)})}</p>}
   {coverage.missing.length>0&&<p className="comparison-note">{t('Some investments have no recorded purchase. Their first recorded value counts as invested on the day it was recorded, so it is never shown as a gain.')}</p>}
   {/* Which benchmarks are drawn, and their colours, are chosen in Settings: one home, linked from the chart they change. */}
   <p className="comparison-note"><DrawerLink href={benchmarksLink}>{t('Investment benchmarks')}</DrawerLink></p>
   {demo&&<p className="comparison-note">{t("Sample portfolio compared with real BTC and SPY price history. SPY tracks the S&P 500; deposits use assumed annual rates.")}</p>}
  </details>}
  <Dialog open={!!detailPoint} onOpenChange={open=>{if(!open)setDetailDate(null);}}><DialogContent className="chart-point-details"><DialogHeader><DialogTitle>{t('Activity and investments')}</DialogTitle><DialogDescription>{detailDate?formatDate(detailDate,locale):''}</DialogDescription></DialogHeader>
   {detailPoint&&<>
    <BenchmarkTooltip linked marketHistory={ready} fundingDetails={decision?.details} active payload={[{payload:detailPoint}]} receipts={[]} currency={currency} series={chartSeries}/>
   </>}
  </DialogContent></Dialog>
  {error&&<InlineError message={t(error)} onRetry={()=>{setLoadedKey('');setError('');setRetry(n=>n+1);}}/>}
 </>;
}
