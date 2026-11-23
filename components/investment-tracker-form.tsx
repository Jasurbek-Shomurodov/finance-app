"use client";
import { useState } from 'react';
import { showSaved } from '@/lib/feedback';
import { useDraftDialog } from '@/components/discard-changes';
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { ExchangeRatePreview } from '@/components/presentation-foundation/exchange-rate-preview';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { AmountCurrencyFields } from '@/components/presentation-foundation/amount-currency-fields';
import { useLanguage } from '@/components/language-provider';
import { formatAccountOption, formatMoney } from '@/lib/format';
import { historyCashDelta, historyEventLabel, historySeries, historyUpdateTypes, isLendingKind, type HistoryUpdateType, type TrackerEvent } from '@/lib/investment-history';
import { depositToday } from '@/lib/deposit-interest';
import { isHolding } from '@/lib/asset-movements';
import { fullValue, interestKinds, valuedKinds, type Entry } from '@/lib/finance';
import { CountedValueFields, OwnershipField, countedUpdate, ownedBalance, ownedDraftReady, ownedDraftStart, ownedPayload, sharedUpdate, type OwnedDraft } from '@/components/investment-tracker-owned';
import { accountAmount } from '@/lib/record-balance';
import { requestJson, type RequestError } from '@/lib/api-client';

type TrackerDraft=OwnedDraft&{exchange_rate?:number;account_id?:string;id:string;record_id:string;type:HistoryUpdateType;date:string;amount:number;balance:number|null;notes:string};
/** What the tracker shares with its form: the loaded history, and the one busy flag and error of the whole dialog. */
type TrackerHistoryState={events:TrackerEvent[];loading:boolean;refresh:()=>void};
type TrackerStatus={busy:boolean;setBusy:(busy:boolean)=>void;setError:(message:string)=>void};
type FormOptions={record:Entry;accounts:Entry[];accountsReady:boolean;initialType?:HistoryUpdateType;inline:boolean;history:TrackerHistoryState;status:TrackerStatus;onClose:()=>void;onSaved:()=>void;/** After a save in the dialog: back to the figures. */onDone:()=>void};

// Each reset draws a new idempotency id; it is not a user edit.
const draftContent=(value:TrackerDraft)=>JSON.stringify({...value,id:undefined});
const withinRange=(amount:number)=>amount>=0&&amount<=1e15;

/** The cash side of an update: the amount in the record's currency and in the cash account's, and what each balance becomes. */
function cashLeg({record,draft,account,typedCurrency,rate,currentBalance}:{record:Entry;draft:TrackerDraft;account:Entry|undefined;typedCurrency:string|undefined;rate:number|null;currentBalance:number}){
 const crossCurrency=!!account&&account.currency!==record.currency;
 // The currency the cash amount is typed in, when it is the cash account's rather than the record's.
 const amountCurrency=account&&crossCurrency&&typedCurrency===account.currency?account.currency:record.currency;
 const inAccount=amountCurrency!==record.currency;
 const converted=rate?draft.amount*rate:null,paid=rate?accountAmount(draft.amount,rate):null;
 const recordAmount=inAccount?converted:draft.amount;
 const cashAmount=inAccount?draft.amount:paid;
 const remainingBalance=currentBalance+(draft.type==='withdrawal'?-1:1)*(recordAmount??0);
 const cashDelta=cashAmount===null?null:historyCashDelta(record.kind,draft.type,cashAmount);
 const cashOutgoing=historyCashDelta(record.kind,draft.type,1)<0;
 const cashAfter=account&&cashDelta!==null?Number(account.amount)+cashDelta:null;
 return {crossCurrency,amountCurrency,inAccount,recordAmount,remainingBalance,cashDelta,cashOutgoing,cashAfter};
}

/** Whether the money an update moves can be saved: a valuation moves none; anything else needs an amount, a cash account
 * that can cover it, and for lending a date after the latest balance and a repayment within what is owed. */
function cashLegReady({draft,leg,lending,cashReady,latestBalanceDate}:{draft:TrackerDraft;leg:ReturnType<typeof cashLeg>;lending:boolean;cashReady:boolean;latestBalanceDate:string}){
 const {recordAmount,remainingBalance,cashAfter}=leg;
 const valued=draft.type==='valuation'||draft.amount>0&&recordAmount!==null&&cashReady&&cashAfter!==null&&withinRange(cashAfter);
 return valued&&(!lending||cashReady&&draft.date>=latestBalanceDate&&remainingBalance>=0&&remainingBalance<=1e15);
}

/** The update form's draft and everything derived from it. It lives in the tracker itself, so the draft survives a
 * switch to another tab and the dialog's discard guard sees it from any of them. */
export function useTrackerForm({record,accounts,accountsReady,initialType,inline,history,status,onClose,onSaved,onDone}:FormOptions){
 const {busy,setBusy,setError}=status,{events,loading}=history;
 const lending=isLendingKind(record.kind);
 const updateTypes=historyUpdateTypes(record.kind);
 const makeDraft=():TrackerDraft=>{const type=initialType&&updateTypes.includes(initialType)?initialType:updateTypes[0];return {id:crypto.randomUUID(),record_id:record.id,type,date:depositToday(),amount:0,balance:lending||initialType==='contribution'||initialType==='withdrawal'?null:0,notes:'',...ownedDraftStart(record,type)};};
 const [draft,setDraft]=useState<TrackerDraft>(makeDraft);
 // A blank value field reads as zero; saving it would silently wipe the asset's value.
 const [balanceBlank,setBalanceBlank]=useState(true);
 const [typedCurrency,setTypedCurrency]=useState<string>();
 const [submitted,setSubmitted]=useState(false);
 const guard=useDraftDialog(draft,onClose,busy);
 const [initialDraft]=useState(()=>draftContent(draft));
 const dirty=draftContent(draft)!==initialDraft;
 const stats=historySeries(events);
 const optionalValuation=valuedKinds.includes(record.kind)&&['contribution','withdrawal'].includes(draft.type);
 const hasBalance=!lending&&(draft.type==='valuation'||optionalValuation&&draft.balance!==null);
 const latestBalanceDate=events.filter(event=>event.balance!==null).reduce((latest,event)=>event.occurred_on>latest?event.occurred_on:latest,'');
 const currentBalance=stats.balance??Number(record.amount);
 // The whole asset's value today, and the one this update saves (a counted asset's two numbers, or the value typed).
 const currentFull=stats.fullBalance??fullValue(record);
 const counted=countedUpdate(record,draft.type);
 const savedBalance=ownedBalance(record,draft,balanceBlank,currentFull);
 const valueEntered=counted||!balanceBlank||savedBalance!==draft.balance;
 const cashAccounts=accounts.filter(account=>account.kind==='Cash');
 const selectedAccount=cashAccounts.find(account=>account.id===draft.account_id);
 const fx=useDatedExchangeRate(selectedAccount?.currency,record.currency,draft.date);
 const leg=cashLeg({record,draft,account:selectedAccount,typedCurrency,rate:fx.rate,currentBalance});
 const {recordAmount,crossCurrency}=leg;
 const dated=!loading&&!!draft.date&&draft.date<=depositToday()&&updateTypes.includes(draft.type);
 const canSave=!busy&&(submitted||dated&&(!hasBalance||valueEntered)&&ownedDraftReady(record,draft)&&cashLegReady({draft,leg,lending,cashReady:accountsReady&&!!selectedAccount,latestBalanceDate}));
 async function save(){
  if(!canSave)return;setBusy(true);setSubmitted(true);setError('');
  try{
   // The update is saved in the record's currency, whichever currency the amount was typed in.
   const payload=submitted?draft:{...draft,amount:recordAmount!,...(hasBalance?{balance:savedBalance}:{}),...ownedPayload(record,draft),...(crossCurrency?{exchange_rate:fx.rate!}:{})};
   setDraft(payload);setTypedCurrency(undefined);
   await requestJson(payload.exchange_rate!==undefined?'/api/investment-history/exchange':'/api/investment-history',{body:payload});
   showSaved();setDraft(makeDraft());setBalanceBlank(true);setSubmitted(false);history.refresh();onSaved();if(inline)onClose();else onDone();
  }catch(e){if((e as RequestError).confirmedFailure){setSubmitted(false);if(crossCurrency)fx.retry();}setError((e as Error).message);}finally{setBusy(false);}
 }
 return {...leg,counted,currentFull,savedBalance,record,accountsReady,busy,loading,lending,updateTypes,draft,setDraft,setBalanceBlank,setTypedCurrency,submitted,guard,dirty,stats,optionalValuation,hasBalance,latestBalanceDate,currentBalance,cashAccounts,selectedAccount,fx,canSave,save};
}
export type TrackerFormState=ReturnType<typeof useTrackerForm>;

/** What the form's choices mean, per kind of record: behind the tracker's ⓘ in the dialog, under the fields where the form stands alone. */
export function trackerFormHelp(record:Entry,t:(key:string)=>string):string[]{
 const lending=isLendingKind(record.kind),cash=record.kind==='Cash',deposit=interestKinds.includes(record.kind);
 return [
  ...(deposit?[t('Use Top-up or Withdraw to move money between accounts. Use Record capitalized interest when interest stays in the deposit; Income received is for interest paid out.')]:[]),
  t(lending?'Select the cash account used for this transaction. The cash balance and outstanding principal change together; principal is not income or an expense.':cash?'Use Balance update to confirm a cash balance, or Transfer money to move funds between accounts.':isHolding(record)?'Use Value update for a valuation, Buy or Sell / convert for trades, and income or expenses for actual cash payments.':deposit?'Use Balance update for a confirmed bank balance. Record paid-out interest and fees separately.':'Use Value update for a valuation. Record invested money, sale proceeds, income and expenses separately.'),
  t(lending?'Enter updates on or after the latest balance date. Repayments cannot exceed the outstanding balance.':record.kind==='Business'?'Past valuations do not replace a newer balance. Business valuations use the current ownership share.':'Past valuations do not replace a newer balance.'),
 ];
}

/** The asset's value: kept or replaced for a cash movement, and the new value itself with the current one under it. */
function ValueFields({form}:{form:TrackerFormState}){
 const {t,locale}=useLanguage();
 const {record,draft,setDraft,setBalanceBlank,optionalValuation,hasBalance,busy,submitted,loading,stats,counted,currentFull,savedBalance}=form;
 const account=record.kind==='Cash'||interestKinds.includes(record.kind);
 const choice=draft.balance===null?'keep':'change';
 return <>
  {optionalValuation&&<div className="tracker-value-choice"><span className="tracker-value-label">{t('Asset value')}</span><ToggleGroup type="single" aria-label={t('Asset value')} value={choice} disabled={busy||submitted||loading} onValueChange={next=>{if(next&&next!==choice){setBalanceBlank(true);setDraft({...draft,balance:next==='change'?0:null});}}}><ToggleGroupItem value="keep">{t('Keep current value')}</ToggleGroupItem><ToggleGroupItem value="change">{t('Enter new value')}</ToggleGroupItem></ToggleGroup>{draft.balance===null&&<small className="muted">{t('The asset value stays unchanged. Only the cash movement is recorded.')}</small>}</div>}
  {hasBalance&&counted&&<CountedValueFields record={record} draft={draft} setDraft={setDraft} currentFull={currentFull}/>}
  {hasBalance&&!counted&&<label>{t(account?'Account balance after update':'Full asset value after update')}<FormattedNumberInput value={draft.balance??0} requireEntry onValueChange={(balance,blank)=>{setBalanceBlank(blank);setDraft({...draft,balance});}}/><small className="muted" aria-live="polite">{t(account?'Account balance':'Current value')}: {stats.fullBalance===null?'—':formatMoney(stats.fullBalance,record.currency,locale)}</small><small className="muted">{t('Enter 0 only when the asset is worth nothing.')}</small></label>}
  {sharedUpdate(record,draft.type)&&<OwnershipField record={record} draft={draft} setDraft={setDraft} full={savedBalance}/>}
 </>;
}

/** What the update does to the chosen cash account: the money that moves and the balance it leaves. */
function CashSummary({form}:{form:TrackerFormState}){
 const {t,locale}=useLanguage();
 const {selectedAccount,cashAfter,cashDelta,cashOutgoing}=form;
 if(!selectedAccount||cashAfter===null||cashDelta===null)return null;
 const accountMoney=(amount:number)=>formatMoney(amount,selectedAccount.currency,locale);
 return <div className="ownership-summary" aria-live="polite"><p>{t(cashOutgoing?'Cash deducted from {account}: {amount}':'Cash added to {account}: {amount}',{account:selectedAccount.name,amount:accountMoney(Math.abs(cashDelta))})}</p><p>{t('Cash balance after update')}: {accountMoney(cashAfter)}</p>{cashAfter<0&&<InlineError message={t('Not enough money in the selected cash account.')}/>}</div>;
}

/** The cash account an update moves money through, and the amount in either currency. */
function CashFields({form}:{form:TrackerFormState}){
 const {t,locale}=useLanguage();
 const {record,accountsReady,lending,draft,setDraft,setTypedCurrency,cashAccounts,selectedAccount,fx,crossCurrency,amountCurrency,inAccount,currentBalance,remainingBalance,cashOutgoing}=form;
 const money=(amount:number)=>formatMoney(amount,record.currency,locale);
 const accountLabel=lending?(cashOutgoing?'Pay from cash account':'Receive into cash account'):'Cash account';
 const available=selectedAccount&&cashOutgoing&&fx.rate?(inAccount?formatMoney(Number(selectedAccount.amount),selectedAccount.currency,locale):money(Number(selectedAccount.amount)*fx.rate)):null;
 return <>
  <label>{t(accountLabel)}<NativeSelect required disabled={!accountsReady} value={draft.account_id??''} onChange={e=>setDraft({...draft,account_id:e.target.value||undefined,exchange_rate:undefined})}><option value="" disabled>{t('Choose a cash account')}</option>{cashAccounts.map(a=><option key={a.id} value={a.id}>{formatAccountOption(a,locale)}</option>)}</NativeSelect>{accountsReady&&!cashAccounts.length&&<small>{t('Add a cash account to record this transaction.')}</small>}{!accountsReady&&<small>{t('Waiting for current cash account balances.')}</small>}</label>
  <AmountCurrencyFields amount={draft.amount} currency={amountCurrency} currencies={selectedAccount?[record.currency,selectedAccount.currency]:[record.currency]} currencyLocked={!crossCurrency} max={lending&&draft.type==='withdrawal'?(inAccount?accountAmount(currentBalance,fx.rate):currentBalance):undefined} label={t(lending?'Principal amount':'Cash amount (your share)')} onAmountChange={amount=>setDraft({...draft,amount})} onCurrencyChange={setTypedCurrency}/>
  {crossCurrency&&<ExchangeRatePreview fx={fx}/>}
  {available!==null&&<p className="muted">{t('Available for this payment')}: {available}</p>}
  {lending&&<p aria-live="polite">{t('Outstanding balance after update')}: {money(remainingBalance)}</p>}
  <CashSummary form={form}/>
 </>;
}

/** The dated update itself: its type and date, the value or the cash it moves, and a note. `inline` is the form on its
 * own inside another dialog (a debt repayment): no type to choose, and its guidance under the fields. */
export function TrackerForm({form,inline}:{form:TrackerFormState;inline:boolean}){
 const {t}=useLanguage();
 const {record,draft,setDraft,setBalanceBlank,busy,submitted,loading,lending,updateTypes,latestBalanceDate,guard,canSave,save}=form;
 const changeType=(type:HistoryUpdateType)=>{setBalanceBlank(true);setDraft({...draft,type,account_id:undefined,exchange_rate:undefined,amount:0,balance:!lending&&type==='valuation'?0:null,quantity:undefined,unit_value:undefined,ownership:undefined,...ownedDraftStart(record,type)});};
 return <div className="record-form">
  {inline&&<p className="muted">{t('Enter any amount up to the outstanding balance. You can repay the rest later.')}</p>}
  <fieldset disabled={busy||submitted||loading} className="tracker-fields">
   <div className="form-grid">{!inline&&<label>{t('Update type')}<NativeSelect value={draft.type} onChange={e=>changeType(e.target.value as HistoryUpdateType)}>
    {updateTypes.map(type=><option key={type} value={type}>{t(historyEventLabel(record.kind,type))}</option>)}
   </NativeSelect></label>}<label>{t(inline?'Payment date':'Date')}<DatePicker value={draft.date} min={lending?latestBalanceDate:undefined} max={depositToday()} onChange={date=>setDraft({...draft,date,exchange_rate:undefined})}/></label></div>
   <ValueFields form={form}/>
   {draft.type!=='valuation'&&<CashFields form={form}/>}
   <label>{t('Notes (optional)')}<Textarea rows={2} maxLength={2000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
  </fieldset>
  {inline&&trackerFormHelp(record,t).map(text=><p key={text} className="muted tracker-help">{text}</p>)}
  {submitted&&<p className="muted tracker-help">{t('Retry with the same details to avoid duplicates.')}</p>}
  <FormFooter busy={busy} onCancel={guard.close} cancelLabel={t('Close')}><Button type="button" onClick={()=>void save()} disabled={!canSave}>{t(busy?'Saving…':submitted?'Retry update':inline?'Save payment':'Save update')}</Button></FormFooter>
 </div>;
}
