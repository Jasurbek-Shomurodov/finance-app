"use client";
import { normalizeEntry } from '@/lib/finance';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { marketRates, type MarketData } from '@/lib/market';
import { useState } from 'react';
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

export function MonthlyReview({data:providedData,owner,demo=false,revision=0,tools,snapshots,historyError,currency,market,compact=false,selectedMonth,estimates}:{compact?:boolean;selectedMonth?:string;estimates?:{income:number;spending:number;net:number}|null;data:PlanningData;owner?:string|null;demo?:boolean;revision?:number;tools:ToolsController;snapshots:PortfolioSnapshot[];historyError:string;currency:string;market?:MarketData|null}){
 const {t,locale}=useLanguage();
 const today=depositToday();
 const [localMonth,setMonth]=useState(()=>today.slice(0,7));
 const month=selectedMonth??localMonth;
 const remote=useOwnerResource('/api/planning?scope=review&month='+month,owner??null,!!owner&&!demo,revision,emptyPlanning);
 const data=owner&&!demo?{...remote.data,records:remote.data.records.map(normalizeEntry)}:providedData;
 const result=monthlyReview(data.records,tools.data.splits,snapshots,month,currency,today,data.activity,marketRates(market),data.investmentLinks);
 const previous=monthlyReview(data.records,tools.data.splits,snapshots,shiftMonth(month,-1),currency,today,data.activity,marketRates(market),data.investmentLinks);
 const money=(amount:number)=>formatMoney(amount,currency,locale);
 if(compact&&owner&&!demo&&remote.loading)return <CashflowSummarySkeleton/>;
 if(owner&&!demo&&(remote.loading||remote.error))return <section className="panel tools-panel monthly-review"><h2>{t('Monthly review')} · {formatMonthYear(month,locale)}</h2>{remote.error?<InlineError message={t(remote.error)} onRetry={remote.retry}/>:<LoadingPlaceholder label={t('Loading records…')} rows={3}/>}</section>;
 // A month with an amount no rate converts shows no total: — with the note, never a partial figure (MONEY-008).
 if(compact)return <section className="cashflow-summary" aria-label={t('Monthly review')}>
  {tools.error&&<InlineError message={t(tools.error)} onRetry={tools.retry}/>}
  <StatTiles columns={4}>{[
   {label:'Income received',value:result.received,estimate:estimates?.income},
   {label:'Actual spending',value:result.spent,estimate:estimates?.spending},
   {label:'Net cash flow',value:result.saved,estimate:estimates?.net,tone:signTone(result.saved)},
  ].map(({label,value,estimate,tone})=><StatTile key={label} label={t(label)} value={tools.loading?<Skeleton aria-hidden="true" className="h-7 w-3/4"/>:tools.error||result.missing?'—':money(value)} tone={tools.loading||tools.error||result.missing?undefined:tone}><p>{t(label==='Net cash flow'?'Estimated monthly surplus':'Monthly estimate')}: {estimate==null?'—':money(estimate)}</p></StatTile>)}
   {/* The month's savings rate, as the period report shows it for a quarter or a year (the user's choice, 20 October 2026). */}
   <StatTile label={t('Savings rate')} value={tools.loading?<Skeleton aria-hidden="true" className="h-7 w-3/4"/>:tools.error||result.missing||!(result.received>0)?'—':formatPercent(result.saved/result.received*100,locale)} tone={tools.loading||tools.error||result.missing||!(result.received>0)?undefined:signTone(result.saved)}/></StatTiles>
  {!!result.missing&&<p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>}
 </section>;
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
