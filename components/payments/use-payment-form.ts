"use client";
import { useEffect, useRef, useState } from 'react';
import { useDiscardChanges } from '@/components/discard-changes';
import { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
import { depositToday } from '@/lib/deposit-interest';
import { suggestedCashAccount } from '@/lib/form-suggestions';
import type { MortgagePayment } from '@/lib/mortgage-payment-edit';
import { paymentsFrom, suggestedPaymentAccount } from '@/lib/payment-account';
import { cashSide, draftCurrency, paymentDraft, paymentProblems, paymentSave, type PaymentDraft, type PaymentField, type PaymentPlan, type PaymentProblems, type PaymentSave } from '@/lib/payment-plan';
import type { PlanningData } from '@/lib/planning';

/** Where a payment goes once the form is right: the existing save of each kind, unchanged. */
export type PaymentSaves = { mortgage: (payment: MortgagePayment) => Promise<void>; /** A loan's repayment as an update of its Tracker history. */ tracker: (data: Record<string, unknown>) => Promise<void>; /** Changes a recorded mortgage payment. */ edit?: (payment: MortgagePayment) => Promise<void>; planning: (action: string, data: unknown) => Promise<void> };
export type PaymentData = Pick<PlanningData, 'records' | 'occurrences' | 'debtPayments' | 'activity' | 'categories' | 'removedKinds'>;
type Options = { plan: PaymentPlan; data: PaymentData; saves: PaymentSaves; /** After a confirmed save, with the values that were saved. */ onSaved: (draft: PaymentDraft) => void; onClose: () => void; onDraftState?: (dirty: boolean, busy: boolean) => void };

/** Where each field's control sits, in the order the form shows them. */
const controls: Record<PaymentField, string> = {
 amount: '[data-field="amount"] input:not([disabled])',
 date: '[data-field="date"] button:not([disabled])',
 account: '[data-field="account"] select:not([disabled])',
 split: '[data-field="split"] input:not([disabled])',
};
/** Moves focus to the first field with a problem. */
export function focusFirstProblem(form: Pick<ParentNode, 'querySelector'> | null, problems: PaymentProblems) {
 const [first] = (Object.keys(controls) as PaymentField[]).filter(field => problems[field]);
 if (first) form?.querySelector<HTMLElement>(controls[first])?.focus();
}

/** The account a payment starts from, so it is ready to save: the one that last paid this obligation, else the only
 * one that fits; a mortgage falls back to the account last used for spending in its currency. */
function startAccount(plan: PaymentPlan, data: PaymentData) {
 const cash = data.records.filter(record => record.kind === 'Cash');
 return suggestedPaymentAccount(cash, plan.target, data.records, paymentsFrom(data.activity, data.debtPayments))
  || (plan.kind === 'mortgage' ? suggestedCashAccount(data.records, plan.target.currency, 'expense') ?? '' : '');
}

/** One payment form's state: its draft, what stops the save by field, the dated rate when the account is in another
 * currency, and the save itself. A save whose outcome is unknown locks the form on what was sent, so Retry sends the
 * same payment again; a refusal unlocks it. */
export function usePaymentForm({ plan, data, saves, onSaved, onClose, onDraftState }: Options) {
 const today = depositToday();
 const [draft, setDraft] = useState(() => paymentDraft(plan, crypto.randomUUID(), startAccount(plan, data), today));
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [attempted, setAttempted] = useState(false);
 const [sent, setSent] = useState<PaymentSave | null>(null);
 const root = useRef<HTMLElement | null>(null);
 const accounts = data.records.filter(record => record.kind === 'Cash');
 const account = accounts.find(record => record.id === draft.account_id);
 const currency = draftCurrency(plan, draft);
 const needed = !!account && account.currency !== currency;
 const fx = useDatedExchangeRate(needed ? account.currency : undefined, currency, draft.date);
 const rate = { needed, value: needed ? fx.rate : null, loading: fx.loading };
 const problems = sent ? {} : paymentProblems({ plan, draft, account, rate, today });
 // The one thing Save waits for: the day's rate, while it loads.
 const waiting = needed && fx.loading && !fx.rate;
 const [initial] = useState(() => JSON.stringify(draft));
 const dirty = JSON.stringify(draft) !== initial;
 useEffect(() => { onDraftState?.(dirty, busy); }, [dirty, busy, onDraftState]);
 const guard = useDiscardChanges(dirty, onClose, busy);
 async function submit() {
  if (busy || waiting) return;
  if (Object.keys(problems).length) { setAttempted(true); focusFirstProblem(root.current, problems); return; }
  const save = sent ?? paymentSave(plan, draft, needed ? fx.rate : null);
  setBusy(true); setSent(save); setError('');
  try {
   if (save.path === 'planning') await saves.planning(save.action, save.data);
   else if (save.path === 'tracker') await saves.tracker(save.data);
   else await (plan.editing && saves.edit ? saves.edit : saves.mortgage)(save.payment);
   onSaved(draft);
  } catch (reason) {
   setError((reason as Error).message);
   if ((reason as Error & { confirmedFailure?: boolean }).confirmedFailure) { setSent(null); if (needed) fx.retry(); }
  } finally { setBusy(false); }
 }
 return { plan, today, draft, setDraft, accounts, account, currency, fx, needed, cash: cashSide(plan, draft, account, rate), errors: attempted ? problems : {} as PaymentProblems,
  busy, error, locked: busy || !!sent, retrying: !!sent, waiting, guard, /** The form's own element, so the first field at fault can take the focus. */ attach: (node: HTMLElement | null) => { root.current = node; }, submit };
}
export type PaymentFormState = ReturnType<typeof usePaymentForm>;
