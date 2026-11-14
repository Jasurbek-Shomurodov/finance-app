"use client";
import { useState } from 'react';
import { Check, Scale } from 'lucide-react';
import { useUnsavedNavigation } from '@/components/discard-changes';
import { useLanguage } from '@/components/language-provider';
import { PayoffChart } from '@/components/loans/loans-lazy';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RecordIcon } from '@/components/presentation-foundation/record-icon';
import { ResourceState } from '@/components/presentation-foundation/resource-state';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { Button } from '@/components/ui/button';
import type { PreferenceResource } from '@/hooks/use-workspace-preferences';
import { methodLabels, otherMethod, payoffDay, payoffPlan, payoffSeries, planFor, type DebtPlan } from '@/lib/debt-plan';
import type { PayoffMethod } from '@/lib/debt-payoff';
import type { Entry } from '@/lib/finance';
import { formatMoney, formatMonthYear, formatNumber, formatPercent } from '@/lib/format';

type Worked = ReturnType<typeof payoffPlan>;
type Money = (amount: number) => string;

export function DebtPayoffPanel({records,currency,today,preferences}:{records:Entry[];currency:string;today:string;preferences:PreferenceResource}){
 const saved=preferences.data.preferences.find(p=>p.key==='debt_plan');
 return <ResourceState loading={preferences.loading} error={preferences.error} onRetry={preferences.retry}><PayoffEditor key={JSON.stringify(saved)+currency} records={records} today={today} initial={planFor(saved?.data,currency)} save={preferences.save}/></ResourceState>;
}

function PayoffEditor({records,today,initial,save}:{records:Entry[];today:string;initial:DebtPlan;save:PreferenceResource['save']}){
 const {t,locale}=useLanguage();
 const [draft,setDraft]=useState(initial),[saved,setSaved]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const guard=useUnsavedNavigation(JSON.stringify(draft)!==JSON.stringify(saved));
 const worked=payoffPlan(records,draft),{debts,result,minimums}=worked;
 const money:Money=amount=>formatMoney(amount,draft.currency,locale);
 if(!result||!debts.length)return <section className="panel"><EmptyState icon={<Scale/>} description={t('Add a debt to compare payoff strategies.')}/>{guard}</section>;
 const submit=async()=>{setBusy(true);setError('');try{await save({key:'debt_plan',data:draft});setSaved(draft);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const hint=<><p>{t('Compare fixed-rate monthly scenarios. Minimum payments are planning assumptions; this does not record payments. Fees, new borrowing and rate changes are excluded.')}</p><p>{t('Only debts in {currency} are included.',{currency:draft.currency})}</p></>;
 return <>
  <PayoffTiles worked={worked} extra={draft.extra} today={today} money={money}/>
  <div className="loans-layout">
   <div className="loans-main">
    <section className="panel">
     <PanelTitle title={t('Balance owed')} hint={hint}><div className="payoff-legend"><span><i/>{t('Your plan')}</span>{draft.extra>0&&<span><i data-guide=""/>{t('Minimums only')}</span>}</div></PanelTitle>
     <p className="payoff-today"><strong><RollingText text={money(result.balances[0])}/></strong><span>{t('Today')}</span></p>
     <PayoffChart points={payoffSeries(today,result,draft.extra>0?minimums:null)} currency={draft.currency}/>
    </section>
    <PayoffOrder worked={worked} plan={draft} today={today} money={money}/>
   </div>
   <form className="loans-side" onSubmit={event=>{event.preventDefault();void submit();}}>
    <PayoffMethods worked={worked} plan={draft} today={today} money={money} onChange={method=>setDraft({...draft,method})}/>
    <section className="panel"><PanelTitle title={t('Payments')}/>
     <fieldset disabled={busy} className="payoff-payments">
      <label>{t('Extra monthly payment')}<FormattedNumberInput value={draft.extra} required={false} onValueChange={extra=>setDraft({...draft,extra})}/></label>
      {debts.map(debt=><label key={debt.id} className="payoff-payment"><span><RecordIcon record={debt}/>{debt.name}</span><FormattedNumberInput ariaLabel={`${debt.name} · ${t('Minimum monthly payment')}`} value={draft.payments[debt.id]??debt.estimated_monthly_payment??0} required={false} onValueChange={minimum=>setDraft({...draft,payments:{...draft.payments,[debt.id]:minimum}})}/></label>)}
     </fieldset>
     <Button disabled={busy}>{t('Save plan')}</Button>{error&&<p role="alert">{t(error)}</p>}
    </section>
   </form>
  </div>
  {guard}
 </>;
}

/** The plan's three answers: when it ends, what it costs in interest, and what it takes each month. */
function PayoffTiles({worked,extra,today,money}:{worked:Worked;extra:number;today:string;money:Money}){
 const {t,locale}=useLanguage();
 const result=worked.result!,minimums=worked.minimums;
 const day=payoffDay(today,result.months),minimumsDay=payoffDay(today,minimums?.months);
 const less=minimums?.months!=null&&result.months!==null?minimums.interest-result.interest:0;
 return <StatTiles columns={3}>
  <StatTile label={t('Estimated debt-free date')} rolling={false} value={day?formatMonthYear(day,locale):t('Not repaid within 50 years')}>{minimumsDay&&minimumsDay!==day&&<p>{t('{date} with minimums only',{date:formatMonthYear(minimumsDay,locale)})}</p>}</StatTile>
  <StatTile label={t('Estimated interest')} value={result.months===null?'—':money(result.interest)}>{less>=1&&<p>{t('{amount} less than minimums only',{amount:money(less)})}</p>}</StatTile>
  <StatTile label={t('Monthly payment budget')} value={money(result.budget)}>{extra>0&&<p>{t('{minimums} minimums + {extra} extra',{minimums:money(result.budget-extra),extra:money(extra)})}</p>}</StatTile>
 </StatTiles>;
}

/** The order the plan clears each debt in, with the month it is gone. */
function PayoffOrder({worked,plan,today,money}:{worked:Worked;plan:DebtPlan;today:string;money:Money}){
 const {t,locale}=useLanguage();
 const byId=new Map(worked.debts.map(debt=>[debt.id,debt]));
 const order=[...worked.result!.debts].sort((a,b)=>(a.paidOn??Infinity)-(b.paidOn??Infinity));
 return <section className="panel"><PanelTitle title={t('Payoff order')}><span className="status-badge payoff-method-badge">{t(methodLabels[plan.method])}</span></PanelTitle>
  <ol className="payoff-order">{order.map((row,index)=>{
   const debt=byId.get(row.id)!,day=payoffDay(today,row.paidOn);
   return <li key={row.id}>
    <span className="payoff-order-step">{formatNumber(index+1,locale,0)}</span>
    <RecordIcon record={debt}/>
    <div><strong>{debt.name}</strong><small>{formatPercent(debt.rate,locale,2)}{' · '}{money(debt.amount)}{plan.extra>0&&worked.first===row.id&&<>{' · '}{t('Gets the extra payment first')}</>}</small></div>
    <div className="payoff-order-when">{day?<><strong>{formatMonthYear(day,locale)}</strong><small>{t('{count} months',{count:formatNumber(row.paidOn!,locale,0)})}</small></>:<strong>—</strong>}</div>
   </li>;})}
  </ol>
 </section>;
}

/** Both methods side by side for the same payments; the pressed one is the plan. */
function PayoffMethods({worked,plan,today,money,onChange}:{worked:Worked;plan:DebtPlan;today:string;money:Money;onChange:(method:PayoffMethod)=>void}){
 const {t,locale}=useLanguage();
 const results={[plan.method]:worked.result,[otherMethod(plan.method)]:worked.alternative} as Record<PayoffMethod,Worked['result']>;
 const methods:PayoffMethod[]=['avalanche','snowball'];
 const [a,b]=[results.avalanche,results.snowball];
 const cheaper=a?.months!=null&&b?.months!=null&&Math.abs(a.interest-b.interest)>=1?(a.interest<b.interest?'avalanche':'snowball'):null;
 return <section className="panel"><PanelTitle title={t('Payoff method')}/>
  <div className="payoff-methods" role="group" aria-label={t('Payoff method')}>{methods.map(method=>{
   const result=results[method],day=payoffDay(today,result?.months);
   return <button type="button" key={method} aria-pressed={plan.method===method} onClick={()=>onChange(method)}>
    <span>{plan.method===method&&<Check size={14} aria-hidden="true"/>}{t(methodLabels[method])}</span>
    <strong>{day?formatMonthYear(day,locale):'—'}</strong>
    <small>{result&&result.months!==null?t('interest {amount}',{amount:money(result.interest)}):t('Not repaid within 50 years')}</small>
   </button>;})}
  </div>
  {cheaper&&<p className="payoff-saving">{t('{method} saves {amount}',{method:t(methodLabels[cheaper]),amount:money(Math.abs(a!.interest-b!.interest))})}</p>}
 </section>;
}
