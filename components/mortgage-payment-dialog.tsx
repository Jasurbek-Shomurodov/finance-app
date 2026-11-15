"use client";
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { ExchangeRatePreview } from '@/components/presentation-foundation/exchange-rate-preview';
import { NativeSelect } from '@/components/ui/native-select';
import { depositToday } from '@/lib/deposit-interest';
import { useDiscardChanges } from '@/components/discard-changes';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { formatAccountOption, formatMoney } from '@/lib/format';
import type { Entry } from '@/lib/finance';
import { Textarea } from '@/components/ui/textarea';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { suggestedCashAccount, typicalMortgagePayment } from '@/lib/form-suggestions';
import { CategoryChoiceButton } from '@/components/transactions/pickers';
import type { Category } from '@/lib/planning';
import type { CategoryChoice } from '@/lib/transaction-rules';
import { availableForPayment, type MortgagePayment } from '@/lib/mortgage-payment-edit';
export type { MortgagePayment };
/** The Category field: the categories on offer and the one the payment starts in (the mortgage's latest payment's, or the edited payment's own). */
export type PaymentCategory = { categories: readonly Category[]; removed?: readonly string[]; initial: CategoryChoice };
/** Records a mortgage payment, or with `editing` changes one that was recorded: the form opens on its values and the
 * balances it moved are counted back before the new ones are checked. */
export function MortgagePaymentDialog({ mortgage, accounts = [], onClose, onSave, inline=false, onDraftState, editing, category }: { inline?:boolean;onDraftState?:(dirty:boolean,busy:boolean)=>void; accounts?:Entry[]; mortgage: Entry; onClose: () => void; onSave: (payment: MortgagePayment) => Promise<void>; editing?: MortgagePayment; category?: PaymentCategory }) {
 const { t, locale } = useLanguage();
 // It starts as a normal month (the estimated payment split into interest and principal) from the cash account last used in
 // the mortgage's currency, or the only one; that is not a change to discard.
 const [payment, setPayment] = useState<MortgagePayment>(() => editing ? { ...editing } : ({ id: crypto.randomUUID(), mortgage_id: mortgage.id, principal: 0, interest: 0, ...typicalMortgagePayment(mortgage), date: depositToday(), notes: '', account_id: suggestedCashAccount(accounts, mortgage.currency, 'expense') ?? undefined }));
 // What the mortgage owes and the account holds without the payment being edited.
 const owed=mortgage.amount+(editing?.principal??0);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [submitted, setSubmitted] = useState(false);
 const money = (amount: number) => formatMoney(amount, mortgage.currency, locale);
 const selectedAccount=accounts.find(account=>account.id===payment.account_id&&account.kind==='Cash');
 const fx=useDatedExchangeRate(selectedAccount?.currency,mortgage.currency,payment.date);
 const crossCurrency=!!selectedAccount&&selectedAccount.currency!==mortgage.currency;
 const debit=fx.rate?(payment.principal+payment.interest)/fx.rate:null;
 const available=selectedAccount?availableForPayment(selectedAccount,mortgage,editing):0;
 // An edited payment from an account in another currency took an amount only the server knows: it decides.
 const enough=debit!==null&&(debit<=available||(!!editing&&crossCurrency));
 const valid = submitted||( payment.principal <= owed && payment.principal + payment.interest > 0 && !!payment.date && payment.date<=depositToday() && (!mortgage.opened_on||payment.date>=mortgage.opened_on)&&(!!selectedAccount&&enough));
 const blocked=valid?undefined:paymentBlocker({payment,mortgage,owed,account:selectedAccount,debit,rateError:!!fx.error});
 const [initialDraft]=useState(()=>JSON.stringify(payment));
 const dirty=JSON.stringify(payment)!==initialDraft;
 useEffect(()=>{onDraftState?.(dirty,busy);},[dirty,busy,onDraftState]);
 const guard=useDiscardChanges(dirty,onClose,busy);
 const submit=async () => { if (!valid || busy) return;
   setBusy(true); setSubmitted(true); setError('');
   try { const payload=submitted?payment:{...payment,...(crossCurrency?{exchange_rate:fx.rate!}:{})};setPayment(payload);await onSave(payload); onClose(); } catch (error) { setError((error as Error).message);if((error as Error & {confirmedFailure?:boolean}).confirmedFailure){setSubmitted(false);fx.retry();} } finally { setBusy(false); }
  };

 const content=<div className="record-form">
   {inline&&<p className="muted">{t('Enter principal and interest from your bank statement. Only principal reduces your mortgage.')}</p>}
   <fieldset disabled={busy || submitted} className="grid gap-5 border-0 p-0 m-0 min-w-0">
    <div className="form-grid"><label>{t('Principal repayment')}<FormattedNumberInput value={payment.principal} required={false} max={owed} onValueChange={principal => setPayment({ ...payment, principal })}/></label>
    <label>{t('Interest paid')}<FormattedNumberInput value={payment.interest} required={false} onValueChange={interest => setPayment({ ...payment, interest })}/></label></div>
    <label>{t('Cash account')}<NativeSelect required value={payment.account_id??''} onChange={e=>setPayment({...payment,account_id:e.target.value||undefined,exchange_rate:undefined})}><option value="" disabled>{t('Choose a cash account')}</option>{accounts.filter(a=>a.kind==='Cash').map(a=><option key={a.id} value={a.id}>{formatAccountOption(a,locale)}</option>)}</NativeSelect></label><label>{t('Payment date')}<DatePicker value={payment.date} min={mortgage.opened_on??undefined} max={depositToday()} onChange={date => setPayment({ ...payment, date,exchange_rate:undefined })}/></label>
    {!accounts.some(account=>account.kind==='Cash')&&<p className="muted">{t('Add a cash account to record this transaction.')}</p>}
    {crossCurrency&&<ExchangeRatePreview fx={fx}/>}
    {category&&<label>{t('Category')}<CategoryChoiceButton categories={category.categories} removed={category.removed} direction="expense" value={payment.category??category.initial} placeholder={t('Category')} onChange={choice=>{if(choice)setPayment({...payment,category:choice});}}/></label>}
    {selectedAccount&&debit!==null&&<div className="ownership-summary"><p>{t('Cash deducted from {account}: {amount}',{account:selectedAccount.name,amount:formatMoney(debit,selectedAccount.currency,locale)})}</p><p>{t('Cash balance after update')}: {formatMoney(available-debit,selectedAccount.currency,locale)}</p>{!enough&&<p className="error">{t('Not enough money in the selected cash account.')}</p>}</div>}
    <label>{t('Notes (optional)')}<Textarea rows={2} maxLength={2000} value={payment.notes} onChange={e => setPayment({ ...payment, notes: e.target.value })}/></label>
   </fieldset>
   <div className="ownership-summary"><p>{t('Total payment: {amount}', { amount: money(payment.principal + payment.interest) })}</p><p>{t('Remaining balance: {amount}', { amount: money(owed - payment.principal) })}</p></div>
   {inline&&<p className="muted">{t('Saved once in Income & expenses. The selected cash account pays the total. To undo a payment, delete it from Transactions; you can restore it from Recently deleted.')}</p>}
   <ErrorPopup message={error} detail="Retry the same payment to avoid duplicates."/>
   <FormFooter busy={busy} onCancel={guard.close}><span title={busy||!blocked?undefined:t(blocked)}><Button disabled={busy || !valid} type="button" onClick={()=>void submit()}>{t(busy ? 'Saving…' : 'Save payment')}</Button></span></FormFooter>
  </div>;
 if(inline)return <>{content}{guard.confirmation}</>;
 return <><Dialog open onOpenChange={open=>{if(!open&&!busy)guard.close();}}><DialogContent className="record-dialog" showCloseButton={!busy}>
  <DialogTitle>{t(editing?'Edit mortgage payment':'Record mortgage payment')}<InfoHint><p>{t('Enter principal and interest from your bank statement. Only principal reduces your mortgage.')}</p><p>{t('Saved once in Income & expenses. The selected cash account pays the total. To undo a payment, delete it from Transactions; you can restore it from Recently deleted.')}</p></InfoHint></DialogTitle>
  <DialogDescription>{mortgage.name} · {t('Outstanding balance: {amount}',{amount:money(mortgage.amount)})}</DialogDescription>
  {content}
 </DialogContent></Dialog>{guard.confirmation}</>;
}

/** The first reason Save payment is unavailable, as an English key: a missing amount, too much principal, no cash account, a date out of range or too little cash. */
function paymentBlocker({payment,mortgage,owed,account,debit,rateError}:{payment:MortgagePayment;mortgage:Entry;/** What the mortgage owes without the payment being edited. */owed:number;account?:Entry;debit:number|null;rateError:boolean}){
 if(payment.principal+payment.interest<=0)return 'Enter an amount greater than zero.';
 if(payment.principal>owed)return 'Principal exceeds the outstanding balance.';
 if(!payment.date||payment.date>depositToday())return 'Actual income and expenses cannot be dated in the future.';
 if(mortgage.opened_on&&payment.date<mortgage.opened_on)return 'Payment date cannot precede the start date.';
 if(!account)return 'Choose a cash account.';
 if(debit===null)return rateError?'Check the dated exchange rate.':'Loading exchange rate for the selected date…';
 return 'Not enough money in the selected cash account.';
}
