"use client";
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import type { Entry } from '@/lib/finance';
import { formatAccountOption, formatMoney, formatNumber } from '@/lib/format';
import { paymentsFrom } from '@/lib/payment-account';
import type { PlanningData } from '@/lib/planning';
import type { RecurringItem } from '@/lib/recurring';
import { duePaymentData, dueTodayPayments, withAccount } from '@/lib/recurring-days';

type Save = (action: string, data: unknown) => Promise<void>;
type Due = ReturnType<typeof dueTodayPayments>;

/** The question before everything due today is recorded: each payment with its account and its amount as entered, and
 * the ones that stay on their rows. Payments nothing suggests an account for take the one picked here, when it holds
 * their currency. Payments are saved one after another exactly as Record payment saves each; when one fails the rest
 * wait, the popup says how many went through, and the button carries on from there. */
function RecordDueDialog({ due, accounts, today, save, onClose }: { due: Due; accounts: Entry[]; today: string; save: Save; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(0);
 const [accountId, setAccountId] = useState('');
 const chosen = withAccount(due.choose, accounts.find(account => account.id === accountId));
 const payments = [...due.ready, ...chosen.payments], separate = [...chosen.rest, ...due.separate];
 const count = (value: number) => formatNumber(value, locale, 0);
 async function record() {
  setBusy(true); setError('');
  let saved = done;
  try {
   for (const payment of payments.slice(done)) { await save('occurrence', duePaymentData(crypto.randomUUID(), payment, today)); setDone(++saved); }
   onClose();
  } catch (e) { setError([saved > 0 && t('Recorded {done} of {count}.', { done: count(saved), count: count(payments.length) }), (e as Error).message].filter(Boolean).join(' ')); } finally { setBusy(false); }
 }
 return <AlertDialog open onOpenChange={next => { if (!next && !busy) onClose(); }}><AlertDialogContent className="record-due-dialog">
  <AlertDialogTitle>{t('Record all due today')}</AlertDialogTitle>
  <AlertDialogDescription>{t('Each payment is recorded today at its scheduled amount, from the account shown.')}</AlertDialogDescription>
  {/* Once a payment went through the list is settled: the account no longer changes. */}
  {due.choose.length > 0 && <label className="record-due-account">{t('Cash account')}<NativeSelect value={accountId} disabled={busy || done > 0} onChange={event => setAccountId(event.target.value)}><option value="">{t('Select account')}</option>{accounts.map(account => <option key={account.id} value={account.id}>{formatAccountOption(account, locale)}</option>)}</NativeSelect></label>}
  {payments.length > 0 && <ul className="record-due-list">{payments.map(({ item, account }, index) => <li key={item.key} data-done={index < done || undefined}>
   <span><strong>{item.record.name}</strong><small>{account.name}</small></span>
   <strong className={item.direction === 'income' ? 'positive' : undefined}>{formatMoney(item.amount, item.record.currency, locale)}</strong>
  </li>)}</ul>}
  {separate.length > 0 && <div className="record-due-separate"><h3>{t(accountId || !due.choose.length ? 'Record these one by one' : 'Choose a cash account.')}</h3><p>{separate.map(item => item.record.name).join(' · ')}</p></div>}
  <ErrorPopup message={error}/>
  <AlertDialogFooter>
   <AlertDialogCancel disabled={busy}>{t('Cancel')}</AlertDialogCancel>
   <AlertDialogAction disabled={busy || payments.length <= done} onClick={event => { event.preventDefault(); void record(); }}>{t(busy ? 'Saving…' : payments.length > done ? 'Record {count} payments' : 'Record payment', { count: count(payments.length - done) })}</AlertDialogAction>
  </AlertDialogFooter>
 </AlertDialogContent></AlertDialog>;
}

/** "Record all due today": `button` (absent unless at least two payments can be saved as they stand, or with an account
 * named for them) opens `dialog`. The list is fixed when the question opens, so rows do not vanish from it while they are being saved. */
export function useRecordDue(data: Pick<PlanningData, 'records' | 'activity' | 'debtPayments'>, items: readonly RecurringItem[], today: string, save: Save) {
 const { t } = useLanguage();
 const [asked, setAsked] = useState<Due | null>(null);
 const due = dueTodayPayments(items, data.records, paymentsFrom(data.activity, data.debtPayments), today);
 const button = due.ready.length + due.choose.length > 1 && <Button size="sm" variant="outline" className="recurring-record-all" onClick={() => setAsked(due)}><Check size={16} aria-hidden="true"/>{t('Record all due today')}</Button>;
 return { button, dialog: asked && <RecordDueDialog due={asked} accounts={data.records.filter(record => record.kind === 'Cash')} today={today} save={save} onClose={() => setAsked(null)}/> };
}
