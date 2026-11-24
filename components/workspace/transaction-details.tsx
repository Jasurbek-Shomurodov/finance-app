"use client";
import { recordAmong } from '@/lib/closed-records';
import { PaymentDialog, TransactionDetailsDialog } from '@/components/workspace/workspace-lazy';
import { RecordAttachments } from '@/components/record-attachments';
import { useLanguage } from '@/components/language-provider';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useMortgagePaymentSource } from '@/hooks/use-mortgage-payment-source';
import { nextPaletteColor } from '@/lib/business';
import { showError } from '@/lib/feedback';
import { income, type Entry } from '@/lib/finance';
import { ownerOf, workspaceOwners } from '@/lib/household';
import { isLinkedTransaction, linkedSourceLabel } from '@/lib/linked-transactions';
import { propertyOf } from '@/lib/property-totals';
import { trackedKinds } from '@/lib/investment-history';
import { transactionsHref } from '@/lib/transaction-list';
import { isTransactionHistory } from '@/lib/transaction-history';
import { canRecategorize } from '@/lib/transaction-rules';
import { planPayment } from '@/lib/payment-plan';
import { depositToday } from '@/lib/deposit-interest';
import { useEffect } from 'react';

/** What Split takes, as the records table offers it: a recorded transaction that no other action wrote. */
const splittable = (record: Entry) => isTransactionHistory(record) && !isLinkedTransaction(record);

/** The transaction any screen opened (`viewing`), with everything that changes right in its details: category,
 * business, tags and receipts. A transaction written by a larger action names where it came from; a mortgage payment
 * opens its mortgage and its own Edit. */
export function WorkspaceTransactionDetails() {
 const { t } = useLanguage();
 const { viewing, setViewing, setSplitting, setTracking, planning, businessList, tags, attachments, assignTransactionsBusiness, categorize, transactionTools, household, readOnly, removedCategories, demo,
  editRecord, requestDelete, mortgagePaymentSource } = useWorkspace();
 const payment = useMortgagePaymentSource(viewing, mortgagePaymentSource);
 if (!viewing) return null;
 const close = () => setViewing(null);
 /** Closes the details, then opens what the row asked for. */
 const leaveTo = (open: (record: Entry) => void) => () => { const record = viewing; close(); open(record); };
 const records = planning.data.records;
 const mortgage = records.find(record => record.id === payment?.source?.mortgage_id);
 const accountId = viewing.account_id ?? payment?.source?.account_id;
 const owners = workspaceOwners(household.state, { shared: t('Shared'), unnamed: t('Partner') });
 const source = linkedSourceLabel(viewing);
 const account = recordAmong(accountId, planning.data), property = propertyOf(viewing, records);
 /** Leaves the details for a record's own page, its Tracker, where it has one to open. */
 const track = (record?: Entry) => record && !demo && trackedKinds.includes(record.kind) ? () => { close(); setTracking(record); } : undefined;
 const origin = viewing.mortgage_payment_id
  ? { label: t('Payment on {name}', { name: mortgage?.name ?? viewing.name }), openLabel: t('Open mortgage'), onOpen: mortgage ? () => { close(); setTracking(mortgage); } : undefined }
  : source ? { label: `${t(source)}. ${t('To change the amount or date, delete it and record it again.')}` } : undefined;
 return <TransactionDetailsDialog key={viewing.id} record={viewing} incoming={income.includes(viewing.kind)} categoryName={planning.data.categories.find(c => c.id === viewing.custom_category_id)?.name}
  businesses={businessList} onBusiness={business => assignTransactionsBusiness([viewing.id], business)}
  categoryEditing={!readOnly && canRecategorize(viewing, transactionTools.data.splits) ? { categories: planning.data.categories, removed: removedCategories.kinds, onChange: choice => categorize([viewing.id], choice) } : undefined}
  origin={origin}
  tagging={{ tags: tags.data.tags, tagIds: tags.data.links.filter(link => link.record_id === viewing.id).map(link => link.tag_id), onTags: (add, remove) => tags.change([viewing.id], add, remove),
   onCreateTag: async name => { const id = crypto.randomUUID(); await tags.save({ id, name, color: nextPaletteColor(tags.data.tags.map(tag => tag.color)) }); return id; } }}
  accountName={account?.name} propertyName={property?.name}
  opens={{ account: track(account), property: track(property), business: id => track(records.find(record => record.id === id)), categoryHref: category => transactionsHref({ category }) }}
  ownerName={owners.find(owner => owner.id === ownerOf(viewing, household.state!))?.name}
  onSplit={splittable(viewing) && !transactionTools.loading && !transactionTools.error ? leaveTo(setSplitting) : undefined}
  attachments={<RecordAttachments recordId={viewing.id} available={attachments.available} onChange={attachments.refresh}/>}
  editable={!isLinkedTransaction(viewing) || !!viewing.mortgage_payment_id} onEdit={leaveTo(editRecord)} onDelete={leaveTo(requestDelete)} onClose={close}/>;
}

/** Edit for a recorded mortgage payment: its form opens on the payment's own values once they are read. */
export function MortgagePaymentEditor() {
 const { editingPayment, setEditingPayment, mortgagePaymentSource, editMortgagePayment, recordRepayment, planning, removedCategories } = useWorkspace();
 const payment = useMortgagePaymentSource(editingPayment, mortgagePaymentSource);
 const mortgage = planning.data.records.find(record => record.id === payment?.source?.mortgage_id);
 const failed = payment?.error ?? (payment?.source && !mortgage ? 'Mortgage not found.' : undefined);
 useEffect(() => { if (failed) { showError(failed); setEditingPayment(null); } }, [failed, setEditingPayment]);
 if (!editingPayment || !payment?.source || !mortgage) return null;
 const plan = planPayment({ record: mortgage, editing: payment.source, category: { kind: editingPayment.kind, category_id: editingPayment.custom_category_id ?? null } }, planning.data, depositToday());
 if (!plan) return null;
 return <PaymentDialog key={editingPayment.id} plan={plan} data={{ ...planning.data, removedKinds: removedCategories.kinds }}
  saves={{ mortgage: editMortgagePayment, edit: editMortgagePayment, tracker: recordRepayment, planning: planning.save }} onClose={() => setEditingPayment(null)}/>;
}
