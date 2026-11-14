"use client";
import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { ProgressLine } from '@/components/presentation-foundation/progress-line';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { CashflowPreviewSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { useDisplayMoney } from '@/components/display-money';
import { incomeCardTotals, monthlyIncomeCards } from '@/lib/monthly-income-cards';
import type { Entry } from '@/lib/finance';
import type { EarningSource } from '@/lib/earning-sources';
import { amountIn, type RateTable } from '@/lib/money';
import { ratesOrPair } from '@/lib/transaction-rates';

type Card=ReturnType<typeof monthlyIncomeCards>[number];
/** Where a source stands this month: received in full, in part, or still expected. Income that follows no schedule has no status. */
function IncomeStatus({card}:{card:Card}){
 const {t}=useLanguage();
 if(card.excluded)return null;
 if(!card.received)return <span className="status-badge">{t('Expected')}</span>;
 return card.missing||card.receivedAmount>=card.amount?<span className="status-badge is-paid">{t('Received')}</span>:<span className="status-badge">{t('Partly received')}</span>;
}
/** One source of the month: its estimate and what came in, each in the source's own currency (AGENTS.md, entered or converted). */
function IncomeRow({card}:{card:Card}){
 const {t,locale}=useLanguage();
 const received=card.entered??{amount:card.receivedAmount,currency:card.entry.currency};
 return <tr><td><div className="record-name"><CategoryIcon kind={card.entry.kind}/><div><strong>{card.entry.name||t(card.entry.kind)}</strong><small>{card.excluded?`${t('Not scheduled')} · ${t(card.entry.kind)}`:t(card.entry.kind)}</small></div></div></td>
  <td data-label={t('Status')}><IncomeStatus card={card}/></td>
  <td data-label={t('Expected')}>{card.excluded?'—':formatMoney(card.amount,card.entry.currency,locale)}</td>
  <td data-label={t('Received')} className={card.received&&!card.missing&&received.amount>0?'positive':undefined}>{card.received&&!card.missing?formatSignedMoney(received.amount,received.currency,locale):'—'}</td>
  <td data-label={t('Progress')}>{!card.excluded&&!card.missing&&<ProgressLine value={card.receivedAmount} target={card.amount} tone="income"/>}</td></tr>;
}

/** Cash flow's overview: the month's income by source beside this month's budget, mortgage payments and what is still to
 * come (`closing`). `rates` converts a payment no rate converted into the display currency into its card's; without one
 * its amount is missing. */
export function CashflowPreview({entries,sources,month,currency,rates,loading,error,onRetry,onIncome,budget,mortgages,watchlists,closing}:{entries:Entry[];sources:EarningSource[];month:string;currency:string;rates?:RateTable|null;loading:boolean;error:string;onRetry:()=>void;onIncome:()=>void;budget:ReactNode;mortgages:ReactNode;watchlists:ReactNode;closing?:ReactNode}){
 const {t,locale}=useLanguage();
 const {convert}=useDisplayMoney();
 // Five sources at first, and every other one that brought money in, so the Received column adds up to the headline;
 // Show more lists the rest (CF-042).
 const [allSources,setAllSources]=useState(false);
 const allCards=monthlyIncomeCards(entries,month,sources,undefined,rates);
 const cards=allSources?allCards:allCards.filter((card,index)=>index<5||card.received);
 // Each card in its source's own currency; the headline adds them in the display currency, what came in at each payment's day's rates.
 const income=incomeCardTotals(allCards,convert,payment=>amountIn({amount:payment.amount,currency:payment.currency},currency,ratesOrPair(payment,rates)));
 if(error)return <InlineError message={t(error)} onRetry={onRetry}/>;
 if(loading)return <CashflowPreviewSkeleton label={t('Loading records…')}/>;
 return <div className="cashflow-preview-grid">
  <section className="panel cashflow-income-preview"><PanelTitle title={<>{t('Income this month')} {allCards.length>0&&<span className="panel-figure">{income.missing?'—':formatMoney(income.received,currency,locale)} / {income.missing?'—':formatMoney(income.estimate,currency,locale)}</span>}</>}><Button variant="link" onClick={onIncome}>{t('View all')}</Button></PanelTitle>
   <div className="table-scroll"><table className="stack-table"><thead><tr><th>{t('Source')}</th><th>{t('Status')}</th><th>{t('Expected')}</th><th>{t('Received')}</th><th>{t('Progress')}</th></tr></thead><tbody>{cards.map(card=><IncomeRow key={card.entry.id} card={card}/>)}</tbody></table></div>
   {income.missing>0&&<p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
   {!allSources&&allCards.length>cards.length&&<Button variant="link" onClick={()=>setAllSources(true)}>{t('Show more')}</Button>}
   {!cards.length&&<p className="muted">{t('No income is included for this month. Add a monthly salary or another income source below.')}</p>}
   <footer><Button variant="ghost" onClick={onIncome}><Plus size={18} aria-hidden="true"/>{t('Add income source')}</Button></footer>
  </section>
  <div className="cashflow-spending-preview">{closing}{budget}{mortgages}</div>
  {watchlists}
 </div>;
}
