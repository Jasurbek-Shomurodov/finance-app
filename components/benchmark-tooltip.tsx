"use client";
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney, formatSignedMoney } from '@/lib/format';
import { movePrefix } from '@/lib/hypothetical-net-worth';
import { signTone } from '@/components/presentation-foundation/tone';
import { categoryColor } from '@/lib/category-colors';
import { benchmarkUnitPrice } from '@/lib/investment-comparison';
import type { BenchmarkData } from '@/lib/benchmark-data';
import type { FundingDetail } from '@/lib/investment-benchmarks';
import type { receivedIncome } from '@/lib/income-history';

type Receipt=ReturnType<typeof receivedIncome>[number];
type Point={date:string;contributed?:number;[key:string]:string|number|null|undefined};
type Props={fundingDetails?:FundingDetail[];marketHistory?:BenchmarkData|null;openingNetWorth?:{date:string;amount:number};active?:boolean;payload?:readonly {payload?:Point}[];receipts:Receipt[];currency:string;series:{key:string;label:string;color:string;quotes?:{key:string;symbol:string}[]}[]};
export function BenchmarkTooltip({active,payload,receipts,currency,series,openingNetWorth,marketHistory,fundingDetails}:Props){
 const {t,locale}=useLanguage();
 const point=payload?.[0]?.payload;
 if(!active||!point)return null;
 // Quotes are USD closes for the hovered day; a missing or stale quote shows a dash.
 const unitPrice=(key:string)=>marketHistory?.prices[key]?benchmarkUnitPrice(marketHistory.prices[key],point.date,'USD',marketHistory.fx):null;
 // What moved net worth since the chart's previous day, largest first: each kind of record, debts together.
 const moves=Object.entries(point).flatMap(([key,amount])=>key.startsWith(movePrefix)&&typeof amount==='number'?[{kind:key.slice(movePrefix.length),amount}]:[]).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount));
 const funding=(fundingDetails??receipts).filter(receipt=>receipt.date===point.date&&(!openingNetWorth||receipt.date>openingNetWorth.date));
 return <div className="portfolio-tooltip benchmark-tooltip" onMouseMove={event=>event.stopPropagation()} onTouchMove={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()}>
  <header><span>{formatDate(point.date,locale)}</span>{series.map(item=><div className="portfolio-tooltip-row" key={item.key}><i style={{background:item.color}}/><div><strong>{item.label}</strong>{item.quotes?.map(quote=>{const price=unitPrice(quote.key);return <span key={quote.key}>{t('{symbol} price (USD)',{symbol:quote.symbol})}: {price===null?'—':formatMoney(price,'USD',locale,true)}</span>;})}</div><b>{typeof point[item.key]==='number'?formatMoney(point[item.key] as number,currency,locale):'—'}</b></div>)}</header>
  <div className="portfolio-tooltip-body" tabIndex={0} role="region" aria-label={t(fundingDetails?'Investment activity on this date':'Income invested on this date')} onKeyDown={event=>{if(event.key!=='Escape')event.stopPropagation();}}>
   <p className="portfolio-tooltip-note">{t('Total funding invested by this date')} <strong>{typeof point.contributed==='number'?formatMoney(point.contributed,currency,locale):'—'}</strong></p>
   {openingNetWorth&&point.date>=openingNetWorth.date&&<p className="portfolio-tooltip-note">{t('Opening net worth invested')} · {formatDate(openingNetWorth.date,locale)} <strong>{formatMoney(openingNetWorth.amount,currency,locale)}</strong></p>}
   {moves.length>0&&<section className="net-worth-moves"><h4>{t('What changed your net worth')}</h4>{moves.map(move=><div className="portfolio-tooltip-row" key={move.kind}><i style={{background:categoryColor(move.kind)}}/><div><strong>{t(move.kind)}</strong></div><b className={signTone(move.amount)}>{formatSignedMoney(move.amount,currency,locale)}</b></div>)}</section>}
   <section><h4>{t(fundingDetails?'Investment activity on this date':'Income invested on this date')}</h4>{funding.length?funding.map(receipt=><div className="portfolio-tooltip-row" key={receipt.id}><i style={{background:categoryColor('kind' in receipt&&receipt.kind?receipt.kind:'Other income')}}/><div><strong>{receipt.id==='opening'?t(receipt.name):receipt.name}</strong><span>{'source' in receipt&&receipt.source==='expense'?t('Expense funding')+' · '+t(receipt.kind??'Other expense'):'source' in receipt&&receipt.source==='opening'?t('Recorded value · purchase not recorded'):t('principal' in receipt?'Principal repaid':fundingDetails?'Fresh investment funding':'Income received and invested')}</span></div><b>{formatMoney('principal' in receipt&&typeof receipt.principal==='number'?receipt.principal:receipt.amount,receipt.currency,locale)}</b>{'reused' in receipt&&receipt.reused>0&&<small>{t('Transferred from an existing investment')}: {formatMoney(receipt.reused,receipt.currency,locale)}</small>}{'fromIncome' in receipt&&typeof receipt.fromIncome==='number'&&receipt.fromIncome>0&&<small>{t('Paid from investment income')}: {formatMoney(receipt.fromIncome,receipt.currency,locale)}</small>}</div>):<p className="portfolio-tooltip-note">{t(fundingDetails?'No new investment funding on this date.':'No new income invested on this date.')}</p>}</section>
  </div>
 </div>;
}
