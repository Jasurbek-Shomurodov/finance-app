"use client";
import { useState } from 'react';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { useLanguage } from '@/components/language-provider';
import { blockerLabels, linkedRecordMessage, type DeleteBlocker } from '@/lib/account-deletion';
import type { Entry } from '@/lib/finance';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { closeMeaning, deleteMeaning } from './close-dialogs';

type Props = {
 record: Entry | null;
 /** What still points at it, as the database answered (or the loaded data, in the sample workspace). */
 blockers: readonly DeleteBlocker[];
 /** The answer is still on its way: Delete waits for it. */
 checking: boolean; busy: boolean; error: string;
 onClose: () => void; onDelete: () => void;
 /** Opens the Close dialog for the same record. */
 onCloseInstead: () => void;
};

/** The confirmation before an account or holding is deleted. It says what Close and Delete each do, and it offers
 * Delete only when nothing else points at the record: otherwise it names what does and offers Close, so nobody presses
 * Delete to read a refusal. */
export function DeleteHeldDialog({ record, blockers, checking, busy, error, onClose, onDelete, onCloseInstead }: Props) {
 const { t } = useLanguage();
 const linked = blockers.length > 0;
 return <ConfirmDialog deletes={!linked} open={!!record} onClose={onClose} busy={busy || checking} error={error} title={t('Delete this record?')}
  description={<>
   {linked
    ? <span className="block" role="status">{t('Still linked to it: {items}.', { items: blockers.map(key => t(blockerLabels[key])).join(', ') })} {t(linkedRecordMessage)}</span>
    : <span className="block">{t('Move {name} to Recently deleted? It will be removed from your records, totals and all planning months. Separate transactions stay unchanged. You can restore it from Recently deleted.', { name: record?.name ?? '' })}</span>}
   <span className="block">{t(closeMeaning)}</span>
   <span className="block">{t(deleteMeaning)}</span>
  </>}
  cancelLabel={t('Keep record')} confirmLabel={linked ? t('Close instead') : t('Delete record')} onConfirm={linked ? onCloseInstead : onDelete}/>;
}

/** The confirmation before an empty investment account is deleted. */
export function DeleteAccountDialog({ account, onClose, onDelete }: { account: HoldingAccount; onClose: () => void; onDelete: () => Promise<void> }) {
 const { t } = useLanguage();
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 const confirm = async () => {
  setBusy(true); setError('');
  try { await onDelete(); onClose(); }
  catch (failure) { setError((failure as Error).message); }
  finally { setBusy(false); }
 };
 return <ConfirmDialog deletes open onClose={onClose} busy={busy} error={error} title={t('Delete this account?')} description={<><span className="block">{account.name}</span><span className="block">{t('It has no holdings, so nothing else changes. This cannot be undone.')}</span></>} confirmLabel={t('Delete account')} onConfirm={confirm}/>;
}
