"use client";
import { offeredKinds } from '@/lib/removed-categories';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { ScheduleFields } from '@/components/presentation-foundation/schedule-fields';
import { MonthDayField } from '@/components/presentation-foundation/month-day-field';
import { RecordNameInput } from '@/components/record-name-input';
import { isStandInName } from '@/lib/record-names';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { ScheduledPaymentField } from '@/components/presentation-foundation/scheduled-payment-field';
import { openPaymentSchedules } from '@/lib/planning';
import { changedFields, recentCategories, scheduleChoice } from '@/lib/form-suggestions';
import { RecentCategories } from './recent-categories';
import { chooseLinked, linkedValue } from '@/lib/linked-asset';
import { GroupedPicker } from '@/components/presentation-foundation/grouped-picker';
import { CategoryBadge } from '@/components/presentation-foundation/category-badge';
import { frequencyLabels } from '@/lib/finance';
import { selectTransactionCategory } from '@/lib/transaction-categories';
import { InvestmentTracker } from '@/components/investment-tracker-lazy';
import { MortgagePaymentDialog } from '@/components/mortgage-payment-dialog';
import { AmountCurrencyFields } from '@/components/presentation-foundation/amount-currency-fields';
import Link from 'next/link';
import { useState } from 'react';
import { CashAccountField } from '@/components/cash-account-field';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatDate as sharedFormatDate } from '@/lib/format';
import { budgetKey, liabilities, type Entry } from '@/lib/finance';
import { depositToday as today } from '@/lib/deposit-interest';
import type { RecordDialogProps } from '../record-dialog';
import { withAccountAndOwner } from './record-form';
import { Textarea } from '@/components/ui/textarea';

/** The expense form: an expense in a category, or a payment on a debt. */
/** What every part of the expense form reads: the dialog's props with the expense being entered, and the form's own state. */
type ExpenseContext=Pick<RecordDialogProps,'onLeave'|'onSuggest'|'onDebtSaved'|'onMortgageSave'|'onMortgageDone'|'onPaymentDraftState'|'requestPaymentSwitch'|'onDebtPayment'|'household'|'setEditing'|'busy'|'save'|'planning'|'error'|'demo'|'currencies'|'rows'|'original'>&{schedule:boolean;editing:Entry;locale:string;paymentId:string;setPaymentId:(id:string)=>void;debts:Entry[];selectedDebt?:Entry;mode:'expense'|'debt';setMode:(mode:'expense'|'debt')=>void;update:(patch:Partial<Entry>)=>void;savedCurrency?:string};

/** A payment on a loan, debt or mortgage, chosen from the outstanding debts. */
function DebtPayment({form}:{form:ExpenseContext}){
 const {t}=useLanguage();
 const {onDebtSaved,onMortgageSave,onMortgageDone,onPaymentDraftState,requestPaymentSwitch,onDebtPayment,busy,planning,demo,locale,paymentId,setPaymentId,debts,selectedDebt}=form;
 return <>    <p className="muted">{t('Choose a debt to record a payment.')}</p>
    {planning.loading?<LoadingPlaceholder label={t('Loading records…')} rows={2}/>:planning.error?<p role="alert" className="error">{t(planning.error)}</p>:debts.length?<>
     <label>{t('Loans & debts')}<NativeSelect value={paymentId} disabled={busy} onChange={event=>{const id=event.target.value;const change=()=>{onPaymentDraftState?.(false,false);setPaymentId(id);};if(requestPaymentSwitch)requestPaymentSwitch(change);else change();}}><option value="">{t('Choose a debt')}</option>{debts.map(record=><option key={record.id} value={record.id}>{record.name} · {t(record.kind)} · {formatMoney(record.amount,record.currency,locale)}</option>)}</NativeSelect></label>
     {demo&&selectedDebt&&selectedDebt.kind!=='Mortgage'&&<p className="muted">{t('Debt repayments are available in your signed-in workspace.')}</p>}
     {selectedDebt?.kind==='Mortgage'&&onMortgageSave?<MortgagePaymentDialog inline key={selectedDebt.id} mortgage={selectedDebt} accounts={planning.data.records} onClose={()=>onMortgageDone?.()} onSave={onMortgageSave} onDraftState={onPaymentDraftState}/>:selectedDebt&&!demo?<InvestmentTracker inline key={selectedDebt.id} initialType="withdrawal" record={selectedDebt} accounts={planning.data.records} accountsReady={!planning.loading&&!planning.error} onClose={()=>onMortgageDone?.()} onSaved={()=>onDebtSaved?.()} onPayment={()=>{}} onDraftState={onPaymentDraftState}/>:<Button type="button" disabled={busy||!selectedDebt||(demo&&selectedDebt.kind!=='Mortgage')} onClick={()=>{if(selectedDebt)onDebtPayment?.(selectedDebt);}}>{t('Record payment')}</Button>}
    </>:<p className="muted">{t('No outstanding debts. Add one in Loans & debts first.')}</p>}</>;
}
/** The bill it pays when one is due, the amount spent and its category: what someone came to enter, first. A schedule leads with its name. */
function CategoryAmount({form}:{form:ExpenseContext}){
 const {t}=useLanguage();
 const {editing,setEditing,busy,planning,currencies,mode,update,savedCurrency,onLeave,schedule,original}=form;
 const removed=planning.data.removedKinds??[];
 const kinds=offeredKinds('expense',removed,editing.kind);
 const added=planning.data.categories.filter(category=>category.direction==='expense');
 const label=(key:string)=>added.find(category=>category.id===key)?.name??t(key);
 // Another category leaves a bill of the old one: the payment no longer settles it.
 const bill=planning.data.records.find(record=>record.id===editing.occurrence_record_id);
 const choose=(key:string)=>{const next=selectTransactionCategory(editing,key,planning.data.categories,'expense');setEditing(bill&&!original?.occurrence_record_id&&budgetKey(bill)!==budgetKey(next)?{...next,occurrence_record_id:null}:next);};
 const recent=schedule?[]:recentCategories(planning.data.records,'expense',key=>kinds.includes(key as typeof kinds[number])||added.some(category=>category.id===key));
 return <>   {schedule&&<RecordNameInput label={t('Name')} entry={editing} rows={planning.data.records} original={original} placeholder={t('e.g. Rent or internet subscription')} onChange={name=>update({name})}/>}
   <BillChoice form={form}/>
   <AmountCurrencyFields prominent amount={editing.amount} currency={editing.currency} currencies={currencies} savedCurrency={savedCurrency} disabled={busy} onAmountChange={amount=>update({amount})} onCurrencyChange={currency=>update({currency,account_exchange_rate:null,account_rate_date:null,account_currency:null})}/>
   {mode==='expense'&&<div className="field-with-links"><label>{t('Category')}<NativeSelect disabled={busy||planning.loading||!!planning.error} value={editing.custom_category_id??editing.kind} onChange={event=>choose(event.target.value)}>{kinds.map(kind=><option key={kind} value={kind}>{t(kind)}</option>)}{added.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</NativeSelect></label>
    <RecentCategories keys={recent} value={editing.custom_category_id??editing.kind} label={label} disabled={busy||planning.loading||!!planning.error} onChoose={choose}/>
    <div className="field-links"><Link className="panel-link" href="/settings#categories" onNavigate={event=>{if(busy){event.preventDefault();return;}if(onLeave)onLeave(event,'/settings#categories');else setEditing(null);}}>{t('Manage categories in Settings')}</Link></div></div>}</>;
}
/** A one-time expense may pay a bill that is still due, of any category, named by its id; choosing one moves the expense
 * into the bill's category and fills a blank name and amount. Also a saved one that named none yet; a saved payment keeps its schedule. */
function BillChoice({form}:{form:ExpenseContext}){
 const {editing,setEditing,busy,planning,mode,currencies,original,savedCurrency}=form;
 const schedules=mode==='expense'&&editing.frequency==='Once'&&(savedCurrency===undefined||!original?.occurrence_record_id)?openPaymentSchedules(planning.data.records,planning.data.occurrences??[],editing,true):[];
 return <ScheduledPaymentField schedules={schedules} value={editing.occurrence_record_id} saved={!!original?.occurrence_record_id} disabled={busy||planning.loading} onChange={bill=>{
  const moved=bill&&budgetKey(bill)!==budgetKey(editing)?selectTransactionCategory(editing,budgetKey(bill),planning.data.categories,'expense'):editing;
  setEditing({...moved,...scheduleChoice(moved,bill,currencies)});
 }}/>;
}
/** The day and the cash account, or how a schedule repeats; then the bill it pays, a name and the folded details. */
function DateDetails({form}:{form:ExpenseContext}){
 const {t}=useLanguage();
 const {household,editing,setEditing,busy,planning,locale,update,schedule,original}=form;
 // A saved schedule keeps its start date; an every-month one may move to another day of its month.
 const started=schedule&&!!original&&original.frequency!=='Once';
 return <>   <div className="form-grid"><label>{t(editing.frequency==='Once'?'Record date':'Start date')}<DatePicker value={editing.date} disabled={started} max={editing.frequency==='Once'?today():undefined} onChange={date=>update({date})}/></label>{schedule?<><ScheduleFields frequency={editing.frequency} days={editing.recurrence_days} disabled={busy} onChange={(frequency,recurrence_days)=>update({frequency,recurrence_days})}/>{editing.frequency==='Monthly'&&<MonthDayField date={editing.date} disabled={busy} onChange={date=>update({date})}/>}</>:<CashAccountField entry={editing} records={planning.data.records} loading={planning.loading} error={planning.error} busy={busy} onSuggest={form.onSuggest&&!original?account_id=>form.onSuggest?.(changedFields(editing,withAccountAndOwner(editing,account_id,planning.data.records,household))):undefined} onChange={account_id=>setEditing(withAccountAndOwner(editing,account_id,planning.data.records,household))}/>}</div>
   {planning.error&&<p className="error" role="alert">{t(planning.error)}</p>}
   <PaymentNameDetails form={form}/>
   {editing.frequency!=='Once'&&<p className="muted">{t('{amount} {frequency} from {date}. This is a recurring plan; it does not automatically create transactions or change account balances.',{amount:formatMoney(editing.amount,editing.currency,locale),frequency:t(frequencyLabels[editing.frequency]),date:sharedFormatDate(editing.date,locale)})}</p>}</>;
}
/** The optional details, folded away: the business or property it is for (one choice), an end date and notes. */
function OptionalDetails({form}:{form:ExpenseContext}){
 const {t}=useLanguage();
 const {editing,busy,planning,update}=form;
 // Repairs, tax or a service charge may be paid for one of the person's properties.
 const properties=planning.data.records.filter(record=>record.kind==='Property');
 const businesses=planning.data.records.filter(record=>record.kind==='Business');
 // A business's cash account gives its expenses that business; a property chosen for one keeps it.
 const accountBusiness=planning.data.records.find(record=>record.id===editing.account_id)?.business_id;
 // The details open by themselves only when one of them is already filled in.
 const [detailsOpen]=useState(()=>!!(editing.business_id||editing.property_id||editing.notes||editing.end_date));
 return <details className="record-optional-details" open={detailsOpen}><summary>{t('Optional details')}</summary><div className="record-optional-fields">
    {(businesses.length>0||properties.length>0||!!editing.business_id||!!editing.property_id)&&<GroupedPicker label={t('Linked to (optional)')} placeholder={t('Not linked')} searchLabel={t('Business or property')} allLabel={t('All')} emptyText={t('No matching records')}
     groups={['Business','Property']} groupLabel={kind=>t(kind)} value={linkedValue(editing)} disabled={busy} onChange={value=>update(chooseLinked(value,accountBusiness))}
     items={[{id:'',name:t('Not linked'),group:''},...[...businesses,...properties].map(record=>({id:`${record.kind==='Business'?'business':'property'}:${record.id}`,name:record.name,group:record.kind,badge:<CategoryBadge kind={record.kind} label={t(record.kind)}/>}))]}/>}
    {editing.frequency!=='Once'&&<label>{t('End date (optional)')}<DatePicker value={editing.end_date||''} required={false} min={editing.date} onChange={end_date=>update({end_date:end_date||null})}/></label>}
    <label>{t('Notes (optional)')}<Textarea value={editing.notes} maxLength={2000} rows={2} onChange={event=>update({notes:event.target.value})}/></label>
   </div></details>;
}
/** The expense's name and the optional details. */
function PaymentNameDetails({form}:{form:ExpenseContext}){
 const {t}=useLanguage();
 const {editing,planning,mode,update,schedule,original}=form;
 // A one-time expense may be named; left blank it stands in with its category, which the field shows as empty.
 const categoryName=planning.data.categories.find(category=>category.id===editing.custom_category_id)?.name;
 return <>   {!schedule&&mode==='expense'&&<RecordNameInput optional label={t('Name (optional)')} entry={isStandInName(editing,categoryName)?{...editing,name:''}:editing} rows={planning.data.records} original={original} placeholder={t('e.g. Groceries or Mum’s allowance')} onChange={name=>update({name})}/>}
   {mode==='expense'&&<OptionalDetails form={form}/>}
</>;
}
/** The error and the Save and Cancel buttons; a debt payment that saves on its own shows none. */
function ExpenseActions({form}:{form:ExpenseContext}){
 const {t}=useLanguage();
 const {onMortgageSave,setEditing,busy,error,demo,selectedDebt,mode}=form;
 return <>  {!(mode==='debt'&&selectedDebt&&((selectedDebt.kind==='Mortgage'&&onMortgageSave)||(!demo&&selectedDebt.kind!=='Mortgage')))&&<div className="expense-form-actions"><ErrorPopup message={error}/><FormFooter busy={busy} onCancel={()=>setEditing(null)}>{mode!=='debt'&&<Button className="primary" disabled={busy}>{t(busy?'Saving…':demo?'Save in demo':'Save expense')}</Button>}</FormFooter></div>}</>;
}

export function ExpenseRecordForm({onLeave,onSuggest,onDebtSaved,onMortgageSave,onMortgageDone,onPaymentDraftState,requestPaymentSwitch,onDebtPayment,household,editing,setEditing,busy,save,planning,error,demo,currencies,rows,original}:RecordDialogProps){
 const {t,locale}=useLanguage();
 const [paymentId,setPaymentId]=useState('');
 const debts=planning.data.records.filter(record=>liabilities.includes(record.kind)&&record.amount>0);
 const selectedDebt=debts.find(record=>record.id===paymentId);
 const [mode,setMode]=useState<'expense'|'debt'>('expense');
 // A bill opened as a schedule (Recurring's Add recurring, or editing one) sets how it repeats and takes no cash account;
 // every other expense form records one payment.
 const [schedule]=useState(()=>!!editing&&editing.frequency!=='Once');
 if(!editing)return null;
 const update=(patch:Partial<Entry>)=>setEditing({...editing,...patch});
 const savedCurrency=original?.currency;
 const form:ExpenseContext={schedule,onLeave,onSuggest,onDebtSaved,onMortgageSave,onMortgageDone,onPaymentDraftState,requestPaymentSwitch,onDebtPayment,household,editing,setEditing,busy,save,planning,error,demo,currencies,rows,original,locale,paymentId,setPaymentId,debts,selectedDebt,mode,setMode,update,savedCurrency};
 return <form className="record-form expense-form" onSubmit={event=>{if(mode==='debt'){event.preventDefault();return;}save(event);}}>
  <Tabs className="expense-mode-tabs" value={mode} onValueChange={next=>{const change=()=>{onPaymentDraftState?.(false,false);setMode(next as 'expense'|'debt');};if(requestPaymentSwitch)requestPaymentSwitch(change);else change();}}>
   {!schedule&&onDebtPayment&&<TabsList aria-label={t('Expense type')}><TabsTrigger value="expense" disabled={busy}>{t('Expense')}</TabsTrigger><TabsTrigger value="debt" disabled={busy}>{t('Debt / mortgage')}</TabsTrigger></TabsList>}
    <TabsContent value="debt" className="expense-form-scroll"><DebtPayment form={form}/></TabsContent>
   <TabsContent value={mode==='debt'?'expense':mode} className="expense-form-scroll">
    <CategoryAmount form={form}/><DateDetails form={form}/>
  </TabsContent></Tabs>
   <ExpenseActions form={form}/>
 </form>;
}
