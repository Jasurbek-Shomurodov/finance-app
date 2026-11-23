"use client";
import type { KeyboardEvent, ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { Button } from '@/components/ui/button';
import type { PaymentDraft, PaymentPlan } from '@/lib/payment-plan';
import { AccountField, AmountField, DateField, DueField, PaymentDetails, PaymentEffect, PaymentSummary, SplitFields } from './payment-fields';
import { usePaymentForm, type PaymentData, type PaymentSaves } from './use-payment-form';

export type PaymentFormProps = { plan: PaymentPlan; data: PaymentData; /** Preferred currencies a scheduled payment may arrive in. */ currencies?: readonly string[]; saves: PaymentSaves;
 /** The form alone, inside another dialog's form (the expense form's Debt / mortgage tab). */ inline?: boolean;
 /** Puts the form in its dialog: the content, the close that asks before discarding changes, and whether it is saving. */ frame?: (content: ReactNode, close: () => void, busy: boolean) => ReactNode;
 onSaved: (draft: PaymentDraft) => void; onClose: () => void; onDraftState?: (dirty: boolean, busy: boolean) => void };

/** Enter saves from any single-line field; a note keeps its line breaks and a button or menu its own Enter. */
const savesOnEnter = (event: KeyboardEvent<HTMLElement>) => event.key === 'Enter' && !event.shiftKey && (event.target as HTMLElement).tagName === 'INPUT';

/** Record payment, for every kind of obligation: who is paid and what is still due, then Amount, Payment date and
 * Paid from, a mortgage's split or a schedule's due date when there is one, and the optional details folded. Each
 * problem shows under its field and the first one takes the focus; Save is off only while something loads or saves. */
export function PaymentForm({ plan, data, currencies = [], saves, inline = false, frame, onSaved, onClose, onDraftState }: PaymentFormProps) {
 const { t } = useLanguage();
 const form = usePaymentForm({ plan, data, saves, onSaved, onClose, onDraftState });
 const { busy, locked, retrying, waiting, guard, attach, submit } = form;
 const fields: ReactNode = <>
  <PaymentSummary form={form}/>
  <fieldset disabled={locked} className="tracker-fields">
   <AmountField form={form} currencies={currencies}/>
   <div className="form-grid"><DateField form={form}/><AccountField form={form}/></div>
   {plan.kind === 'mortgage' && <SplitFields form={form}/>}
   {plan.kind === 'schedule' && <DueField form={form}/>}
   <PaymentDetails form={form} categories={data.categories} removed={data.removedKinds}/>
  </fieldset>
  <PaymentEffect form={form}/>
  <ErrorPopup message={form.error} detail={retrying ? 'Retry the same payment to avoid duplicates.' : undefined}/>
 </>;
 const blocked = waiting ? t('Loading exchange rate for the selected date…') : undefined;
 const label = t(busy ? 'Saving…' : retrying ? 'Retry' : 'Save payment');
 // Inside another form the payment cannot be a form of its own: Enter and the button save it instead.
 if (inline) return <><div className="record-form payment-form" ref={attach} onKeyDown={event => { if (savesOnEnter(event)) { event.preventDefault(); void submit(); } }}>
  {fields}
  <FormFooter busy={busy} blocked={blocked} onCancel={guard.close}><Button type="button" disabled={busy || waiting} onClick={() => void submit()}>{label}</Button></FormFooter>
 </div>{guard.confirmation}</>;
 const content = <form className="record-form payment-form" noValidate ref={attach} onSubmit={event => { event.preventDefault(); void submit(); }}>
  {fields}
  <FormFooter busy={busy} blocked={blocked} onCancel={guard.close}><Button type="submit" disabled={busy || waiting}>{label}</Button></FormFooter>
 </form>;
 return <>{frame ? frame(content, guard.close, busy) : content}{guard.confirmation}</>;
}
