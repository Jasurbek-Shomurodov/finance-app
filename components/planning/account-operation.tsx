"use client";
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { useDiscardChanges } from '@/components/discard-changes';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatAccountOption } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
import { Textarea } from '@/components/ui/textarea';
/** A balance correction on a cash account. Payments are the Record payment dialog (`components/payments`); transfers between accounts are `AssetMovementDialog`. */
export type Operation = { action: 'reconcile'; account_id?: string; amount?: number };
/** Adjust balance: the account's balance as its statement shows it, recorded today. It is neither income nor spending. */
export function AccountOperation({ operation, records, save, onClose }: { operation: Operation; records: Entry[]; save: (action: string, data: unknown) => Promise<void>; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const [draft, setDraft] = useState(() => ({ id: crypto.randomUUID(), account_id: operation.account_id ?? '', date: depositToday(), amount: operation.amount ?? 0, notes: '' }));
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [submitted, setSubmitted] = useState(false);
 // A statement balance must be typed: a blank field reads as zero and would empty the account.
 const [balanceBlank, setBalanceBlank] = useState(!(operation.amount && operation.amount > 0));
 const account = records.find(record => record.id === draft.account_id);
 const accounts = records.filter(record => record.kind === 'Cash');
 const blocked = !draft.account_id ? t('Choose a cash account.') : undefined;
 const [initialDraft] = useState(() => JSON.stringify(draft));
 const guard = useDiscardChanges(JSON.stringify(draft) !== initialDraft, onClose, busy);
 async function submit() {
  setBusy(true); setSubmitted(true); setError('');
  try { await save('reconcile', { id: draft.id, account_id: draft.account_id, target_id: null, date: draft.date, amount: draft.amount, fee: 0, notes: draft.notes, received: 0 }); onClose(); }
  catch (reason) { setError((reason as Error).message); if ((reason as Error & { confirmedFailure?: boolean }).confirmedFailure) setSubmitted(false); }
  finally { setBusy(false); }
 }
 return <><Dialog open onOpenChange={open => { if (!open && !busy) guard.close(); }}><DialogContent className="record-dialog" showCloseButton={!busy}><DialogTitle>{t('Adjust balance')}<InfoHint>{t('This records a balance correction today. It is not income or spending.')}</InfoHint></DialogTitle><DialogDescription className="sr-only">{t('Review the amounts before saving. Both balances update together.')}</DialogDescription>
  <form className="record-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
   <fieldset disabled={busy || submitted} className="tracker-fields">
    <div className="form-grid">
     <label>{t('Cash account')}<NativeSelect required value={draft.account_id} onChange={event => {
      // A statement balance belongs to one account: never carry it over to another.
      const balance = Number(records.find(record => record.id === event.target.value)?.amount ?? 0);
      setBalanceBlank(!(balance > 0));
      setDraft({ ...draft, account_id: event.target.value, amount: balance });
     }}><option value="">{t('Select account')}</option>{accounts.map(item => <option key={item.id} value={item.id}>{formatAccountOption(item, locale)}</option>)}</NativeSelect></label>
    </div>
    <div className="form-grid">
     <label>{t('Statement balance')} {account?.currency}<FormattedNumberInput value={draft.amount} requireEntry onValueChange={(amount, blank) => { setBalanceBlank(blank); setDraft({ ...draft, amount }); }}/></label>
    </div>
    <label>{t('Notes (optional)')}<Textarea rows={2} value={draft.notes} maxLength={2000} onChange={event => setDraft({ ...draft, notes: event.target.value })}/></label>
   </fieldset>
   <ErrorPopup message={error}/>
   {/* Why Save is off is said beside it: a disabled button shows no tooltip on most screens. */}
   <FormFooter busy={busy} blocked={blocked} onCancel={guard.close}><Button disabled={busy || !!blocked || balanceBlank}>{t(busy ? 'Saving…' : submitted ? 'Retry' : 'Save')}</Button></FormFooter>
  </form></DialogContent></Dialog>{guard.confirmation}</>;
}
