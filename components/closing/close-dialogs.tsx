"use client";
import { useState, type ReactNode } from 'react';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { accountHoldings, closesWithTransfer, closingTargets, isEmptyRecord } from '@/lib/closed-records';
import { depositToday } from '@/lib/deposit-interest';
import { value, type Entry } from '@/lib/finance';
import { formatAccountOption, formatMoney } from '@/lib/format';
import type { HoldingAccount } from '@/lib/holding-accounts';

/** What Close does, in one sentence; the delete confirmation says it beside what Delete does. */
export const closeMeaning = 'Close keeps its history and past transactions; from the closing day it counts as nothing and leaves your lists.';
/** What Delete does, in one sentence. */
export const deleteMeaning = 'Delete is for mistakes: every past day reads as if it never existed, until you restore it from Recently deleted.';
const notEmpty = 'Bring the balance to zero before closing.';

type Shell = { name: string; blocked?: string; onClose: () => void; save: (closedOn: string) => Promise<void>; children?: (busy: boolean) => ReactNode };
/** The frame both Close dialogs share: the closing day, what the dialog itself asks, and a Close that says why it waits. */
function CloseShell({ name, blocked, onClose, save, children }: Shell) {
 const { t } = useLanguage();
 const today = depositToday();
 const [date, setDate] = useState(today), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const submit = async (event: React.FormEvent) => {
  event.preventDefault();
  if (blocked || !date || date > today) return;
  setBusy(true); setError('');
  try { await save(date); onClose(); }
  catch (failure) { setError((failure as Error).message); }
  finally { setBusy(false); }
 };
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent showCloseButton={!busy}>
  <DialogTitle>{t('Close {name}', { name })}</DialogTitle>
  <DialogDescription>{t(closeMeaning)}</DialogDescription>
  <form onSubmit={submit}>
   <fieldset disabled={busy} className="tracker-fields"><label>{t('Closing date')}<DatePicker value={date} max={today} onChange={setDate}/></label>{children?.(busy)}</fieldset>
   <ErrorPopup message={error}/>
   <FormFooter busy={busy} onCancel={onClose} blocked={blocked ? t(blocked) : undefined}><Button disabled={busy || !!blocked || !date || date > today}>{t(busy ? 'Saving…' : 'Close {name}', { name })}</Button></FormFooter>
  </form>
 </DialogContent></Dialog>;
}

/** Closing an account or holding. An empty one only asks for the day. A cash account or deposit that still holds money
 * asks where it goes: a transfer to another account in its currency, dated the closing day. Anything else is brought
 * to zero first, and the dialog says so. */
export function CloseRecordDialog({ record, records, onClose, onSave }: { record: Entry; /** The open records: where a remaining balance can go. */ records: readonly Entry[]; onClose: () => void; onSave: (closedOn: string, targetId: string | null) => Promise<void> }) {
 const { t, locale } = useLanguage();
 const empty = isEmptyRecord(record), targets = empty || !closesWithTransfer(record) ? [] : closingTargets(record, records);
 const [chosen, setChosen] = useState('');
 const target = targets.find(item => item.id === chosen) ?? targets[0];
 const blocked = empty || target ? undefined : notEmpty;
 return <CloseShell name={record.name} blocked={blocked} onClose={onClose} save={closedOn => onSave(closedOn, empty ? null : target!.id)}>{() => empty ? null : <>
  <dl className="closing-balance"><div><dt>{t('Balance')}</dt><dd>{formatMoney(value(record), record.currency, locale)}</dd></div></dl>
  {target && <label>{t('Move the remaining balance to')}<NativeSelect value={target.id} onChange={event => setChosen(event.target.value)}>{targets.map(item => <option key={item.id} value={item.id}>{formatAccountOption(item, locale)}</option>)}</NativeSelect></label>}
 </>}</CloseShell>;
}

/** Closing an investment account. Its holdings move to another account of its kind (or to none), or close with it,
 * which needs every one of them sold out. */
export function CloseAccountDialog({ account, records, accounts, onClose, onSave }: { account: HoldingAccount; records: readonly Entry[]; /** The open investment accounts. */ accounts: readonly HoldingAccount[]; onClose: () => void; onSave: (closedOn: string, moveTo: string | null, closeHoldings: boolean) => Promise<void> }) {
 const { t } = useLanguage();
 const { holdings, allEmpty } = accountHoldings(account, records);
 const others = accounts.filter(item => item.id !== account.id && item.kind === account.kind && !item.closed_on);
 const [mode, setMode] = useState<'move' | 'close'>(allEmpty ? 'close' : 'move'), [moveTo, setMoveTo] = useState(others[0]?.id ?? '');
 const closeThem = mode === 'close';
 return <CloseShell name={account.name} blocked={holdings.length && closeThem && !allEmpty ? notEmpty : undefined} onClose={onClose} save={closedOn => onSave(closedOn, closeThem ? null : moveTo || null, closeThem)}>{() => holdings.length ? <>
  <div className="closing-choice"><span>{t('Its holdings')}</span><Segmented label={t('Its holdings')} value={mode} onChange={setMode} options={[{ value: 'move', label: t('Move to another account') }, { value: 'close', label: t('Close them too') }]}/></div>
  {!closeThem && <label>{t('Account')}<NativeSelect value={moveTo} onChange={event => setMoveTo(event.target.value)}>{others.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="">{t('No account')}</option></NativeSelect></label>}
 </> : null}</CloseShell>;
}
