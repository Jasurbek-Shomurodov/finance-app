"use client";
import { useState, type ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate, formatMoney } from '@/lib/format';
import { nextPayment, type PaymentDraft, type PaymentPlan } from '@/lib/payment-plan';
import { PaymentForm, type PaymentFormProps } from './payment-form';

type Props = Pick<PaymentFormProps, 'data' | 'currencies' | 'saves'> & { plan: PaymentPlan; /** After each confirmed save, so the row it was opened from can show it at once. */ onPaid?: (plan: PaymentPlan, draft: PaymentDraft) => void; onClose: () => void };

/** After a save, when the same obligation has another open due date: what it is, and Record another. */
function PaymentDone({ next, onAnother, onClose }: { next: PaymentPlan; onAnother: () => void; onClose: () => void }) {
 const { t, locale } = useLanguage();
 return <div className="record-form payment-form">
  <p role="status">{t('Saved.')}</p>
  <div className="ownership-summary"><p>{next.target.name} · {t('Due {date}', { date: formatDate(next.date, locale) })}</p>
   <p>{next.kind === 'schedule' ? t('Still due: {amount}', { amount: formatMoney(next.due, next.target.currency, locale) }) : t('Outstanding balance: {amount}', { amount: formatMoney(next.due, next.target.currency, locale) })}</p></div>
  <FormFooter onCancel={onClose} cancelLabel={t('Done')}><Button type="button" onClick={onAnother}>{t('Record another')}</Button></FormFooter>
 </div>;
}

/** The one Record payment dialog: a scheduled income or bill, a loan, a debt, money lent or a mortgage, opened from any
 * screen. Each kind saves the way it always did; after a save it offers Record another only while the same
 * obligation has another open due date. */
export function PaymentDialog({ plan: opened, data, currencies, saves, onPaid, onClose }: Props) {
 const { t } = useLanguage();
 // The plan is kept as it was opened: the records reload behind the dialog after a save.
 const [plan, setPlan] = useState(opened), [round, setRound] = useState(0);
 const [next, setNext] = useState<PaymentPlan | null>(null);
 const saved = (draft: PaymentDraft) => { onPaid?.(plan, draft); const more = nextPayment(plan, draft, data, depositToday()); if (more) setNext(more); else onClose(); };
 const another = () => { if (next) { setPlan(next); setRound(round + 1); setNext(null); } };
 const mortgage = plan.kind === 'mortgage';
 // Closing by Escape or a click outside asks first when the form has changes, and waits while it saves.
 const shell = (content: ReactNode, close: () => void, busy: boolean) => <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
  <DialogContent className="record-dialog" showCloseButton={!busy} onOpenAutoFocus={event => { const field = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-field="amount"] input:not([disabled])'); if (field) { event.preventDefault(); field.focus(); } }}>
   <DialogTitle>{t(plan.editing ? 'Edit mortgage payment' : 'Record payment')}{mortgage && <InfoHint><p>{t('Enter principal and interest from your bank statement. Only principal reduces your mortgage.')}</p><p>{t('Saved once in Income & expenses. The selected cash account pays the total. To undo a payment, delete it from Transactions; you can restore it from Recently deleted.')}</p></InfoHint>}</DialogTitle>
   <DialogDescription className="sr-only">{t('Review the amounts before saving. Both balances update together.')}</DialogDescription>
   {content}
  </DialogContent>
 </Dialog>;
 if (next) return shell(<PaymentDone next={next} onAnother={another} onClose={onClose}/>, onClose, false);
 return <PaymentForm key={round} plan={plan} data={data} currencies={currencies} saves={saves} onSaved={saved} onClose={onClose} frame={shell}/>;
}
