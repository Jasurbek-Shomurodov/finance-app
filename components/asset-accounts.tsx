"use client";
import Link from 'next/link';
import type { ReactNode, Ref } from 'react';
import { AssetCard } from '@/components/presentation-foundation/asset-card';
import { Button } from '@/components/ui/button';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { Count } from '@/components/presentation-foundation/count';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { useLanguage } from '@/components/language-provider';
import { holdingAccountLabel, holdingAccountValue, type HoldingAccount } from '@/lib/holding-accounts';
import { formatMoney, formatNumber } from '@/lib/format';
import { value, type Entry } from '@/lib/finance';
import { gainSinceBought } from '@/lib/holding-figures';
import { signTone } from '@/components/presentation-foundation/tone';
import { convertAmount, marketEntry, type MarketData, marketRates } from '@/lib/market';

export function AssetAccounts({ref,accounts,records,market,loading,error,onRetry,onAdd,children,accountCount,onEdit,onTrack,demo,currency,portfolioTotal}: {
 /** The section, so the dashboard's allocation list can scroll to it. */ref?:Ref<HTMLElement>;currency:string;portfolioTotal:number;onEdit:(record:Entry)=>void;onTrack:(record:Entry)=>void;demo:boolean;children:ReactNode;accountCount:number;accounts:HoldingAccount[];records:Entry[];market:MarketData|null;loading:boolean;error:string;
 onRetry:()=>void;onAdd:(kind:'Cash'|'Stock'|'Crypto',accountId:string)=>void;
 
}) {
 const {t,locale}=useLanguage();
 return <section ref={ref} className="asset-account-section">
  <div className="asset-holdings-heading"><h2>{t('Accounts')}<Count value={accounts.length+accountCount} label={t('{count} accounts',{count:formatNumber(accounts.length+accountCount,locale,0)})}/></h2><Link className="panel-link" href="/accounts">{t('Manage accounts')}</Link></div>
  {error ? <InlineError message={t(error)} onRetry={onRetry}/> : loading ? <LoadingPlaceholder label={t('Loading records…')}/> : !accounts.length&&!accountCount ? <p className="muted">{t('No accounts yet.')}</p> : <div className="asset-card-grid">{children}{accounts.map(account=>{
   const {holdings,total}=holdingAccountValue(account,records,market);
   const converted=total===null?null:convertAmount(total,account.currency,currency,marketRates(market));
   // Each holding in the display currency too; one without a rate reads "—", never its own currency.
   const priced=holdings.map(record=>({original:record,converted:marketEntry(record,currency,market)}));
   const holdingValues=priced.map(({converted})=>converted&&value(converted));
   // The live figure is what the holdings with a purchase cost gained since bought; without one, how many it holds.
   const gain=gainSinceBought(priced);
   const count=formatNumber(holdings.length,locale,0);
   const share=converted!==null&&portfolioTotal>0?converted/portfolioTotal*100:null;
   return <AssetCard key={account.id} record={account} label={t(holdingAccountLabel(account.kind))} worth={converted===null?'—':formatMoney(converted,currency,locale)}
    fact={gain.count?{label:t('Gain/loss'),value:gain.amount===null?'—':formatMoney(gain.amount,currency,locale),tone:gain.amount===null?undefined:signTone(gain.amount)}:{label:t('Holdings'),value:count}} share={share}
    note={(converted===null||holdingValues.includes(null))&&<small>{t(total===null?'Exchange rates are missing. The account total is unavailable.':'Exchange rate unavailable.')}</small>}
    detailsLabel={gain.count?<>{t('Account details')}<Count value={holdings.length} label={t('{count} holdings',{count})}/></>:t('Account details')}
    details={holdings.length?<dl className="asset-card-holdings">{holdings.map((record,index)=>{const worth=holdingValues[index];return <div key={record.id}><dt>{record.name}</dt><dd>{worth===null?'—':formatMoney(worth,currency,locale)}</dd><dd><Button variant="ghost" size="sm" onClick={()=>onEdit(record)}>{t('Edit')}</Button>{!demo&&<Button variant="outline" size="sm" onClick={()=>onTrack(record)}>{t('Tracker')}</Button>}</dd></div>;})}</dl>:<p className="muted">{t('Add a holding to start tracking this account.')}</p>}>
    <Button variant="ghost" asChild><Link href="/accounts">{t('Manage account')}</Link></Button><Button variant="outline" onClick={()=>onAdd(account.kind,account.id)}>{t(account.kind==='Cash'?'Add cash balance':'Add holding')}</Button>
   </AssetCard>;
  })}</div>}
 </section>;
}
