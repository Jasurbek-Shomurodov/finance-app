"use client";
import { BusinessSetupFlow, IncomeSourceEditor, JoinHouseholdDialog, MortgagePaymentDialog, RecordDialog, SplitTransactionDialog, StopScheduleDialog } from '@/components/workspace/workspace-lazy';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { InvestmentTracker } from '@/components/investment-tracker-lazy';
import { useLanguage } from '@/components/language-provider';
import { TransactionSankey } from '@/components/workspace/transaction-sankey';
import { MortgagePaymentEditor, WorkspaceTransactionDetails } from '@/components/workspace/transaction-details';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { isLinkedTransaction } from '@/lib/linked-transactions';
import { assetEntryStart } from '@/lib/linked-asset';
import { latestPaymentCategory } from '@/lib/mortgage-payment-edit';

/** Dialogs any screen can open: record editing, trackers, payments, splitting and deletion. */
export function WorkspaceDialogs() {
 const { t } = useLanguage();
 const { setViewing, splitting, setSplitting, editingIncomeSource, setEditingIncomeSource, editing, setEditing, debtPayment, setDebtPayment, tracking, trackingType, closeTracker, payingMortgage, setPayingMortgage, deleting, stopping, setStopping,
  planning, availableBusinesses, businessList, tags, setAccountBusiness, saveBusiness, newBusiness, settingUpBusinesses, setSettingUpBusinesses, transactionTools, preferencesData, earningSources, rows, summary, section, demo, busy, error,
  household, pendingInvite, dismissInvite, addAccountRecord, addCashFlow, readOnly, storedRecord, closeEditing, closeDeleting, navigate, refreshRecords, recordMortgagePayment, save, remove, stopRecord, field, money, editingCashFlow, recordKinds, fetchingPrice, fetchPrice, priceMessage } = useWorkspace();
 return <>
 {/* A transaction row's Sankey; its details open over it. */}
 <TransactionSankey/>
 <WorkspaceTransactionDetails/>
 <MortgagePaymentEditor/>
 {settingUpBusinesses&&<BusinessSetupFlow businesses={businessList} records={planning.data.records} newBusiness={newBusiness} saveBusiness={saveBusiness} setAccountBusiness={setAccountBusiness} guideOnly={settingUpBusinesses==='guide'} hasTags={tags.data.tags.length>0} onAddAccount={()=>addAccountRecord('Cash')} onClose={()=>setSettingUpBusinesses(false)}/>}
 {splitting&&<SplitTransactionDialog key={splitting.id} record={splitting} tools={transactionTools} categories={planning.data.categories} removed={planning.data.removedKinds} onClose={()=>setSplitting(null)}/>}
 {editingIncomeSource&&<IncomeSourceEditor key={editingIncomeSource.id} initial={editingIncomeSource} currencies={preferencesData.currencies} records={planning.data.records} save={earningSources.save} close={()=>setEditingIncomeSource(null)}/>}
 <RecordDialog household={household.state} navigate={navigate} onDebtSaved={refreshRecords} onMortgageSave={recordMortgagePayment} onDebtPayment={record=>{setEditing(null);if(record.kind==='Mortgage')setPayingMortgage(record);else setDebtPayment(record);}} earningSources={earningSources} currencies={preferencesData.currencies} key={editing?.id??'closed'} accountMode={section==='Accounts'&&!!editing&&['Cash','Deposit','Stock','Crypto'].includes(editing.kind)} editing={editing} setEditing={update=>{if(update===null)closeEditing();else setEditing(update);}} busy={busy} rows={planning.data.records.length ? planning.data.records : rows} save={save} editingCashFlow={editingCashFlow} recordKinds={recordKinds} demo={demo} summary={summary} field={field} availableBusinesses={availableBusinesses} money={money} fetchingPrice={fetchingPrice} fetchPrice={fetchPrice} priceMessage={priceMessage} error={error} planning={planning}/>
 {debtPayment&&<InvestmentTracker key={debtPayment.id} initialType="withdrawal" record={debtPayment} accounts={planning.data.records} accountsReady={!planning.loading&&!planning.refreshing&&!planning.error} onClose={()=>setDebtPayment(null)} onSaved={refreshRecords} onPayment={()=>{}}/>}
 {/* An asset's card opens its Tracker to look first: the Overview, with the card's update type ready on the form. */}
 {tracking && <InvestmentTracker onAddEntry={readOnly ? undefined : direction => { const start = assetEntryStart(tracking, direction); if (!start) return; closeTracker(); addCashFlow(start.kind, 'Once', start.preset); }} key={tracking.id + (trackingType ?? '')} initialType={trackingType ?? undefined} startTab="overview" record={tracking} accounts={planning.data.records} accountsReady={!planning.loading&&!planning.refreshing&&!planning.error} onClose={closeTracker} onSaved={refreshRecords} onPayment={() => { setPayingMortgage(storedRecord(tracking)); closeTracker(); }} onOpenPayment={id => { const payment = [...planning.data.records, ...rows].find(row => row.id === id && !!row.mortgage_payment_id); return payment && (() => { closeTracker(); setViewing(payment); }); }}/>}
 {payingMortgage && <MortgagePaymentDialog key={payingMortgage.id} mortgage={payingMortgage} accounts={planning.data.records} category={{ categories: planning.data.categories, removed: planning.data.removedKinds, initial: latestPaymentCategory(planning.data.records.length ? planning.data.records : rows, payingMortgage) }} onClose={() => setPayingMortgage(null)} onSave={recordMortgagePayment}/>}
 <ConfirmDialog deletes open={!!deleting} onClose={closeDeleting} busy={busy} error={error} title={t("Delete this record?")} description={<>{deleting&&isLinkedTransaction(deleting)?t('Move {name} to Recently deleted? It came from a transfer, a mortgage payment or an asset update, so everything that action changed is undone and the balances go back. Restore puts it all back.',{name:deleting.name}):t('Move {name} to Recently deleted? It will be removed from your records, totals and all planning months. Separate transactions stay unchanged. You can restore it from Recently deleted.',{name:deleting?.name||''})}{deleting?.frequency!=='Once'&&<span className="block">{t('To keep past planning and only end future repeats, choose Stop instead.')}</span>}</>} cancelLabel={t("Keep record")} confirmLabel={t("Delete record")} onConfirm={() => void remove()}/>
 {pendingInvite&&!demo&&<JoinHouseholdDialog token={pendingInvite} household={household} onClose={dismissInvite}/>}
 {stopping&&<StopScheduleDialog name={stopping.name} start={stopping.date} onSave={stopRecord} onClose={()=>setStopping(null)}/>}
 </>;
}
