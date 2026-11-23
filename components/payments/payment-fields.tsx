"use client";
import { useId, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { useDueLabel } from '@/components/planning/recurring-rows';
import { AmountCurrencyFields } from '@/components/presentation-foundation/amount-currency-fields';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { ExchangeRatePreview } from '@/components/presentation-foundation/exchange-rate-preview';
import { FieldError } from '@/components/presentation-foundation/field-error';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { CategoryChoiceButton } from '@/components/transactions/pickers';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { formatAccountOption, formatDate, formatMoney } from '@/lib/format';
import { owedBefore, withAmount, withSplit } from '@/lib/payment-plan';
import type { Category } from '@/lib/planning';
import type { PaymentFormState } from './use-payment-form';

type Part = { form: PaymentFormState };

/** Who or what is paid, and how much is still due, in its own currency. */
export function PaymentSummary({ form }: Part) {
 const { t, locale } = useLanguage();
 const { plan } = form, { target } = plan;
 const due = formatMoney(plan.kind === 'mortgage' ? owedBefore(plan) : plan.due, target.currency, locale);
 return <div className="payment-summary"><CategoryIcon kind={target.kind}/><span><strong>{target.name}</strong>
  <small>{plan.kind === 'schedule' ? t('Still due: {amount}', { amount: due }) : t('Outstanding balance: {amount}', { amount: due })}</small></span></div>;
}

/** The whole payment, in the obligation's currency. A scheduled payment may be typed in the currency it arrived in:
 * its schedule's, the cash account's or a preferred one; the schedule's own brings its scheduled amount back. */
export function AmountField({ form, currencies }: Part & { currencies: readonly string[] }) {
 const { plan, draft, setDraft, account, currency, errors, locked } = form;
 const own = plan.target.currency;
 const offered = plan.kind === 'schedule' ? [...new Set([own, account?.currency, ...currencies].filter((code): code is string => !!code))] : [own];
 return <div data-field="amount"><AmountCurrencyFields amount={draft.amount} currency={currency} currencies={offered} currencyLocked={offered.length < 2} disabled={locked} error={errors.amount}
  max={plan.kind === 'debt' ? plan.due : 1e15}
  onAmountChange={amount => setDraft(plan.kind === 'mortgage' ? withAmount(draft, amount) : { ...draft, amount })}
  onCurrencyChange={code => setDraft({ ...draft, currency: code === own ? undefined : code, amount: code === own ? plan.amount : 0 })}/></div>;
}

/** The day it was paid: never ahead of today, nor before the schedule or the mortgage began. */
export function DateField({ form }: Part) {
 const { t } = useLanguage();
 const { plan, draft, setDraft, today, errors } = form;
 const id = useId();
 const min = plan.kind === 'schedule' ? plan.target.date : plan.kind === 'mortgage' ? plan.target.opened_on ?? undefined : undefined;
 return <label data-field="date">{t('Payment date')}<DatePicker value={draft.date} min={min || undefined} max={today} onChange={date => setDraft({ ...draft, date: date || today })}/><FieldError id={id} message={errors.date}/></label>;
}

/** The cash account that pays, or that the money reaches. */
export function AccountField({ form }: Part) {
 const { t, locale } = useLanguage();
 const { plan, draft, setDraft, accounts, errors } = form;
 const id = useId();
 return <label data-field="account">{t(plan.incoming ? 'Received into' : 'Paid from')}
  <NativeSelect value={draft.account_id} aria-invalid={!!errors.account || undefined} aria-describedby={errors.account ? id : undefined} onChange={event => setDraft({ ...draft, account_id: event.target.value })}>
   <option value="">{t('Choose a cash account')}</option>{accounts.map(account => <option key={account.id} value={account.id}>{formatAccountOption(account, locale)}</option>)}
  </NativeSelect>
  <FieldError id={id} message={errors.account}/>
  {!accounts.length && <small className="muted">{t('Add a cash account to record this transaction.')}</small>}
 </label>;
}

/** A mortgage payment's two parts, from the bank statement: only the principal reduces what is owed. */
export function SplitFields({ form }: Part) {
 const { t } = useLanguage();
 const { plan, draft, setDraft, errors } = form;
 const id = useId();
 return <div className="form-grid" data-field="split">
  <label>{t('Principal repayment')}<FormattedNumberInput value={draft.principal} required={false} max={owedBefore(plan)} invalid={!!errors.split} describedBy={errors.split ? id : undefined} onValueChange={principal => setDraft(withSplit(draft, { principal }))}/><FieldError id={id} message={errors.split}/></label>
  <label>{t('Interest paid')}<FormattedNumberInput value={draft.interest} required={false} onValueChange={interest => setDraft(withSplit(draft, { interest }))}/></label>
 </div>;
}

/** Which due date this pays: the one whose row was opened, or another still open, such as last month's. */
export function DueField({ form }: Part) {
 const { t, locale } = useLanguage(), dueLabel = useDueLabel();
 const { plan, draft, setDraft, today } = form;
 const dues = plan.dues ?? [draft.due];
 return <label>{t('Scheduled payment')}<NativeSelect value={draft.due} disabled={dues.length < 2} onChange={event => setDraft({ ...draft, due: event.target.value })}>
  {dues.map(day => <option key={day} value={day}>{formatDate(day, locale)} · {dueLabel(today, day)}</option>)}
 </NativeSelect></label>;
}

/** Rarely needed, folded away: a loan's interest on top of the repayment, a mortgage payment's category, and a note. */
export function PaymentDetails({ form, categories, removed }: Part & { categories?: readonly Category[]; removed?: readonly string[] }) {
 const { t } = useLanguage();
 const { plan, draft, setDraft } = form;
 const [open] = useState(() => !!draft.notes);
 const category = draft.category ?? plan.category;
 return <details className="record-optional-details" open={open || undefined}><summary>{t('Optional details')}</summary><div className="record-optional-fields">
  {plan.kind === 'debt' && <label>{t(plan.incoming ? 'Interest received' : 'Interest paid')} · {plan.target.currency}<FormattedNumberInput value={draft.interest} required={false} onValueChange={interest => setDraft({ ...draft, interest })}/></label>}
  {plan.kind === 'mortgage' && categories && category && <label>{t('Category')}<CategoryChoiceButton categories={categories} removed={removed} direction="expense" value={category} placeholder={t('Category')} onChange={choice => { if (choice) setDraft({ ...draft, category: choice }); }}/></label>}
  <label>{t('Notes (optional)')}<Textarea rows={2} maxLength={2000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })}/></label>
 </div></details>;
}

/** What the payment does: the dated rate and the account's amount when currencies differ, then what is still owed and
 * what the account holds afterwards. */
export function PaymentEffect({ form }: Part) {
 const { t, locale } = useLanguage();
 const { plan, draft, account, fx, needed, cash } = form;
 const own = (amount: number) => formatMoney(amount, plan.target.currency, locale);
 const owed = plan.kind === 'mortgage' ? owedBefore(plan) - draft.principal : plan.due - draft.amount;
 const after = account && cash.moved !== null ? cash.available + (plan.incoming ? cash.moved : -cash.moved) : null;
 const converted = needed && account && cash.moved !== null;
 return <>
  {needed && <ExchangeRatePreview fx={fx}/>}
  {(converted || plan.kind !== 'schedule') && <div className="ownership-summary" aria-live="polite">
   {converted && <p>{t('Account amount')}: {formatMoney(cash.moved ?? 0, account.currency, locale)}</p>}
   {plan.kind !== 'schedule' && <p>{t('Remaining balance: {amount}', { amount: own(owed) })}</p>}
   {plan.kind !== 'schedule' && account && after !== null && <p>{t('Cash balance after update')}: {formatMoney(after, account.currency, locale)}</p>}
  </div>}
 </>;
}
