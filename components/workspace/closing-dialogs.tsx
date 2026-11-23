"use client";
import { CloseAccountDialog, CloseRecordDialog } from '@/components/closing/close-dialogs';
import { DeleteAccountDialog, DeleteHeldDialog } from '@/components/closing/delete-dialogs';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { deletionBlockers, type DeleteBlocker } from '@/lib/account-deletion';
import { isClosable, recordAmong } from '@/lib/closed-records';
import { isLinkedTransaction } from '@/lib/linked-transactions';
import type { Entry } from '@/lib/finance';

const unasked: { blockers: DeleteBlocker[] } = { blockers: [] };
/** Whether deleting this record is the deletion of an account or holding, which has its own confirmation. */
export const deletesHeld = (record: Entry | null): record is Entry => !!record && isClosable(record) && !isLinkedTransaction(record);

/** The delete confirmation of an account or holding. The database says what still points at the record before Delete
 * is offered; the loaded data answers at once, and alone in the sample workspace or when the question cannot be asked. */
function DeleteHeld() {
 const { user, demo, reload, planning, deleting, closeDeleting, busy, error, remove, requestClose } = useWorkspace();
 const held = deletesHeld(deleting) ? deleting : null, asking = !!held && !demo;
 const asked = useOwnerResource('/api/closing?id=' + (held?.id ?? ''), user, asking, reload, unasked);
 const answered = asking && !asked.loading && !asked.error;
 const blockers = answered ? asked.data.blockers : held ? deletionBlockers(held.id, planning.data) : [];
 const closeInstead = () => { if (!held) return; closeDeleting(); requestClose(held); };
 return <DeleteHeldDialog record={held} blockers={blockers} checking={asking && asked.loading} busy={busy} error={error} onClose={closeDeleting} onDelete={() => void remove()} onCloseInstead={closeInstead}/>;
}

/** The dialogs of closing and deleting accounts, which any screen can open: Close for an account, a holding or an
 * investment account, the delete confirmation of an account or holding, and of an empty investment account. */
export function ClosingDialogs() {
 const { planning, closing, endClosing, closeRecord, closeAccount, deleteAccount } = useWorkspace();
 // The record as it is now: after a transfer that went through, its balance is already zero.
 const current = closing && 'record' in closing ? recordAmong(closing.record.id, planning.data) ?? closing.record : null;
 return <>
  <DeleteHeld/>
  {current && <CloseRecordDialog key={current.id} record={current} records={planning.data.records} onClose={endClosing} onSave={(closedOn, targetId) => closeRecord(current, closedOn, targetId)}/>}
  {closing && 'account' in closing && <CloseAccountDialog key={closing.account.id} account={closing.account} records={planning.data.records} accounts={planning.data.holdingAccounts ?? []} onClose={endClosing} onSave={(closedOn, moveTo, closeHoldings) => closeAccount(closing.account, closedOn, moveTo, closeHoldings)}/>}
  {closing && 'remove' in closing && <DeleteAccountDialog key={closing.remove.id} account={closing.remove} onClose={endClosing} onDelete={() => deleteAccount(closing.remove)}/>}
 </>;
}
