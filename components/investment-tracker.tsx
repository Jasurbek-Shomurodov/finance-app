"use client";
import { useEffect, useEffectEvent, useState } from 'react';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { showDeleted, showSaved } from '@/lib/feedback';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { useLanguage } from '@/components/language-provider';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { TrackerHistory } from '@/components/investment-tracker-history';
import { TrackerOverview } from '@/components/investment-tracker-overview';
import { TrackerForm, trackerFormHelp, useTrackerForm } from '@/components/investment-tracker-form';
import { formatDate, formatMoney } from '@/lib/format';
import { historyEventLabel, historyValueLabel, isLendingKind, type HistoryUpdateType, type TrackerEvent } from '@/lib/investment-history';
import { AssetMovementDialog, type MovementDraft } from '@/components/planning/asset-movement-dialog';
import type { AssetMovement } from '@/lib/asset-movements';
import { valuedKinds, type Entry } from '@/lib/finance';
import { requestJson } from '@/lib/api-client';

type Tab='overview'|'history'|'update';
type Props={/** What opens a mortgage payment of the History, when its transaction is at hand. */onOpenPayment?:(id:string)=>(()=>void)|undefined;inline?:boolean;onDraftState?:(dirty:boolean,busy:boolean)=>void;initialType?:HistoryUpdateType;/** The tab the dialog opens on. Without it, a preset update type opens the form and anything else the Overview. */startTab?:Tab;accounts?:Entry[];accountsReady?:boolean;record:Entry;onClose:()=>void;onSaved:()=>void;onPayment:()=>void};

/** The record's dated history, read again after each save or delete. */
function useTrackerEvents(recordId:string,onError:(message:string)=>void){
 const report=useEffectEvent(onError);
 const [events,setEvents]=useState<TrackerEvent[]>([]),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/investment-history?record='+recordId,{signal:controller.signal}).then(async r=>{const data=await r.json() as TrackerEvent[] & {error?:string};if(!r.ok)throw Error(data.error);if(!controller.signal.aborted){setEvents(data);setLoading(false);}}).catch(e=>{if(!controller.signal.aborted){report(e.message);setLoading(false);}});
  return ()=>controller.abort();
 },[recordId,reload]);
 return {events,loading,refresh:()=>{setLoading(true);setReload(n=>n+1);}};
}

// Mirrors delete_tracker_update: asset value/cash updates, and lending additions or repayments.
const deletableUpdate=(kind:string,type:string)=>valuedKinds.includes(kind)?['valuation','contribution','withdrawal'].includes(type):['Money lent','Loan','Debt'].includes(kind)&&['contribution','withdrawal'].includes(type);
const trackerAbout=(kind:string)=>isLendingKind(kind)?'Track additions and repayments against the outstanding balance.':kind==='Cash'?'Track your cash balance and transfers between accounts.':'Dated values and actual cash movements. Estimates stay separate.';
/** What the History list holds and which of its entries can be deleted, behind the tracker's ⓘ. */
function historyHelp(kind:string,t:(key:string)=>string):string[]{
 const lending=isLendingKind(kind);
 return [t(lending?'History starts with a balance snapshot. Additions increase the balance; principal repayments reduce it.':kind==='Cash'?'History shows confirmed balances and account movements.':'History starts with a current snapshot. Add older values and contributions if known. Recorded contributions are not a complete purchase cost unless you enter them all.'),...(valuedKinds.includes(kind)||lending?[t(kind==='Mortgage'?'Click a payment to open it: you can edit or delete it there. Balance updates are deleted from the newest.':'Delete newer balance updates first. Starting snapshots and other transaction types are protected.')]:[])];
}

/** Confirms deleting one History entry: a linked payment goes to Recently deleted, a tracker update is reversed. */
function DeleteEntryDialog({record,deleting,busy,onClose,onConfirm}:{record:Entry;deleting:TrackerEvent|null;busy:boolean;onClose:()=>void;onConfirm:()=>void}){
 const {t,locale}=useLanguage();
 const entered=deleting?.entered;
 const description=entered?t('Move {name} to Recently deleted? It will be removed from your records, totals and all planning months. Separate transactions stay unchanged. You can restore it from Recently deleted.',{name:entered.name}):<>{t('This removes the update. If it changed the asset value, the previous value and ownership are restored. Any linked cash movement is reversed using its original amount. This cannot be undone from the app.')}{deleting&&<> {t(historyEventLabel(record.kind,deleting.event_type))} · {formatDate(deleting.occurred_on,locale)}{Number(deleting.amount)>0&&<> · {formatMoney(Number(deleting.amount),record.currency,locale)}</>}</>}</>;
 return <ConfirmDialog deletes open={!!deleting} onClose={onClose} busy={busy} title={t(entered?'Delete this record?':'Delete this tracker update?')} description={description} confirmLabel={t(busy?'Deleting…':entered?'Delete record':'Delete update')} onConfirm={onConfirm}/>;
}

/** An asset's or loan's tracker: its figures (Overview), every dated entry (History) and the form that adds one
 * (Add update). `inline` is the form alone, inside another dialog. */
export function InvestmentTracker({inline=false,onDraftState,initialType,startTab,record,accounts=[],accountsReady=true,onClose,onSaved,onPayment,onOpenPayment}:Props){
 const {t}=useLanguage();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const history=useTrackerEvents(record.id,setError);
 const [deleting,setDeleting]=useState<TrackerEvent|null>(null);
 // An update type chosen by the caller is a request to add that update; otherwise the figures come first.
 const [tab,setTab]=useState<Tab>(startTab??(initialType?'update':'overview'));
 const [movement,setMovement]=useState<MovementDraft|null>(null);
 const form=useTrackerForm({record,accounts,accountsReady,initialType,inline,history,status:{busy,setBusy,setError},onClose,onSaved,onDone:()=>setTab('overview')});
 const {guard,dirty,submitted}=form,{events,loading}=history;
 useEffect(()=>{onDraftState?.(dirty,busy);},[dirty,busy,onDraftState]);
 async function deleteUpdate(){
  if(!deleting||busy)return;setBusy(true);setError('');
  try{
   // A linked payment is a transaction: it goes to Recently deleted like any other, and its schedule date opens again.
   await requestJson(deleting.entered?'/api/records':'/api/investment-history',{method:'DELETE',body:deleting.entered?{id:deleting.id}:{id:deleting.id,record_id:record.id}});
   setDeleting(null);history.refresh();onSaved();showDeleted();
  }catch(reason){setError((reason as Error).message);setDeleting(null);}finally{setBusy(false);}
 }
 async function saveMovement(payload:AssetMovement){
  await requestJson('/api/asset-movements',{body:payload});
  showSaved();onSaved();onClose();
 }
 const paymentFields=<TrackerForm form={form} inline={inline}/>;
 const alert=<ErrorPopup message={error}/>;
 if(inline)return <>{paymentFields}{alert}{guard.confirmation}</>;
 if(movement)return <AssetMovementDialog initial={movement} records={accounts.some(account=>account.id===record.id)?accounts:[...accounts,record]} save={saveMovement} onClose={()=>setMovement(null)}/>;
 const about=t(trackerAbout(record.kind));
 const help=tab==='history'?historyHelp(record.kind,t):tab==='update'?trackerFormHelp(record,t):[];
 return <><Dialog open onOpenChange={open=>{if(!open&&!busy)guard.close();}}><DialogContent className="record-dialog investment-tracker" showCloseButton={!busy}>
  <DialogTitle>{record.name} · {t('Tracker')}<InfoHint>{[about,...help].map(text=><p key={text}>{text}</p>)}</InfoHint></DialogTitle>
  <DialogDescription className="sr-only">{about}</DialogDescription>
  <Segmented className="tracker-tabs" label={t('Tracker')} options={[{value:'overview',label:t('Overview')},{value:'history',label:t('History')},{value:'update',label:t('Add update')}]} value={tab} onChange={setTab}/>
  {alert}
  {tab==='overview'&&<TrackerOverview record={record} events={events} loading={loading} busy={busy} onMovement={setMovement} onPayment={onPayment}/>}
  {tab==='history'&&(loading?<LoadingPlaceholder label={t('Loading history…')}/>:<TrackerHistory events={events} record={record} accounts={accounts} valueLabel={historyValueLabel(record.kind)} open={e=>e.event_type==='mortgage_payment'?onOpenPayment?.(e.id):undefined} deletable={e=>!!e.entered||deletableUpdate(record.kind,e.event_type)} deleteDisabled={busy||loading||submitted||dirty} onDelete={setDeleting}/>)}
  {tab==='update'&&paymentFields}
 </DialogContent></Dialog>{guard.confirmation}<DeleteEntryDialog record={record} deleting={deleting} busy={busy} onClose={()=>setDeleting(null)} onConfirm={()=>void deleteUpdate()}/></>;
}
