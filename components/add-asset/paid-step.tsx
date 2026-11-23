"use client";
import { useLanguage } from '@/components/language-provider';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { ExchangeRatePreview } from '@/components/presentation-foundation/exchange-rate-preview';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { amountPaid, debitOf, draftWorth, purchaseKind, totalPaid, withCost, type AssetDraft } from '@/lib/add-asset';
import { holdingQuantity } from '@/lib/asset-movements';
import { unitPricedKinds, type Entry } from '@/lib/finance';
import { formatAccountOption, formatDate, formatMoney } from '@/lib/format';
import type { DatedExchangeRate } from '@/lib/official-rate';
import { Field, type StepProps } from './field';
import type { PartialSave } from './use-asset-save';

type Rate = { rate: number | null; loading: boolean; error?: string; quote?: DatedExchangeRate; retry: () => void };
type PaidProps = StepProps & { today: string; accounts: readonly Entry[]; /** The accounts have loaded; until then none can be chosen. */ accountsReady: boolean; fx: Rate;
 /** The record is saved already and its purchase is not: only what the retry may change stays open. */ partial: PartialSave | null;
 /** The day the record was saved under; its purchase cannot be dated before it. */ minDate?: string };

/** The cash account that pays, what leaves it, and what is left in it afterwards. */
function AccountFields({ draft, change, problems, disabled, accounts, accountsReady, fx }: PaidProps) {
 const { t, locale } = useLanguage();
 const { entry, pay } = draft, cash = accounts.filter(account => account.kind === 'Cash');
 const account = cash.find(item => item.id === pay.account_id), cross = !!account && account.currency !== entry.currency;
 const buy = purchaseKind(entry.kind) === 'buy', leaves = account ? debitOf(draft, account, fx.rate) : null;
 return <>
  <Field name="account" label={t('Cash account')} problem={problems.account}>{aria => <NativeSelect disabled={disabled || !accountsReady} value={pay.account_id} aria-invalid={aria.invalid || undefined} aria-describedby={aria.describedBy} onChange={event => change({ ...draft, pay: { ...pay, account_id: event.target.value, debited: 0 } })}><option value="">{t('Choose a cash account')}</option>{cash.map(item => <option key={item.id} value={item.id}>{formatAccountOption(item, locale)}</option>)}</NativeSelect>}</Field>
  {!accountsReady && <p className="muted" role="status">{t('Waiting for current cash account balances.')}</p>}
  {accountsReady && !cash.length && <p className="muted">{t('Add a cash account to record this transaction.')}</p>}
  {buy ? <div className="form-grid">
   <Field name="total" label={`${t('Total paid')} (${entry.currency})`} problem={problems.total}>{aria => <FormattedNumberInput value={totalPaid(draft)} invalid={aria.invalid} describedBy={aria.describedBy} onValueChange={amount => change(withCost(draft, 'total', amount))}/>}</Field>
   {cross && <Field name="debited" label={`${t('Total amount debited')} (${account.currency})`} problem={problems.debited}>{aria => <FormattedNumberInput value={pay.debited} invalid={aria.invalid} describedBy={aria.describedBy} onValueChange={debited => change({ ...draft, pay: { ...pay, debited } })}/>}</Field>}
  </div> : <>
   <Field name="paid" label={`${t('Amount paid')} (${entry.currency})`} problem={problems.paid}>{aria => <FormattedNumberInput value={amountPaid(draft)} invalid={aria.invalid} describedBy={aria.describedBy} onValueChange={paid => change({ ...draft, pay: { ...pay, paid } })}/>}</Field>
   {cross && <ExchangeRatePreview fx={fx}/>}
  </>}
  {account && leaves !== null && <p className="ownership-summary" aria-live="polite">{t('{account} after this: {amount}', { account: account.name, amount: formatMoney(Number(account.amount) - leaves, account.currency, locale) })}</p>}
 </>;
}

/** Step four: where the money came from. Owned already records the asset alone; a cash account and a day record the
 * purchase too, so the account pays and the Tracker shows it. */
export function PaidStep(props: PaidProps) {
 const { t } = useLanguage();
 const { draft, change, problems, disabled, today, partial, minDate } = props, { entry, pay } = draft;
 // Once the record is saved, the choice is made; a refused purchase may still change its account, day and amounts.
 const locked = disabled || (!!partial && !partial.confirmed);
 return <section className="goal-setup-single">
  <h1>{t('How did you pay for it?')}</h1>
  {!partial && <Segmented className="asset-paid-choice" label={t('Paid from')} value={pay.from} onChange={from => change({ ...draft, pay: { ...pay, from } })} options={[{ value: 'owned', label: t('Already owned') }, { value: 'account', label: t('Paid from an account') }]}/>}
  <Field name="date" label={t(pay.from === 'account' ? 'Date' : unitPricedKinds.includes(entry.kind) ? 'Purchase date' : 'Record date')} problem={problems.date}>{() => <DatePicker value={pay.date} max={today} min={minDate} disabled={locked} onChange={date => change({ ...draft, pay: { ...pay, date } })}/>}</Field>
  {pay.from === 'account' && <AccountFields {...props} disabled={locked}/>}
 </section>;
}

/** What one Save will record, in a line, above the button that does it. */
export function ReviewLine({ draft, accounts }: { draft: AssetDraft; accounts: readonly Entry[] }) {
 const { t, locale } = useLanguage();
 const { entry, pay } = draft, account = pay.from === 'account' ? accounts.find(item => item.id === pay.account_id) : undefined;
 const quoted = unitPricedKinds.includes(entry.kind);
 const parts = [entry.name.trim() || t(entry.kind), ...(quoted ? [holdingQuantity(t, entry, entry.quantity, locale)] : []), formatMoney(draftWorth(draft).owned, entry.currency, locale),
  account ? t('paid from {account} on {date}', { account: account.name, date: formatDate(pay.date, locale) }) : t('Already owned')];
 return <p className="asset-review"><strong>{t('Review')}</strong><span>{parts.join(' · ')}</span></p>;
}

/** The record was saved and its purchase was not: exactly that, in words, with the way to finish it. */
export function PartialNotice({ draft, accounts, partial, onClose }: { draft: AssetDraft; accounts: readonly Entry[]; partial: PartialSave; onClose: () => void }) {
 const { t } = useLanguage();
 const buy = purchaseKind(draft.entry.kind) === 'buy', values = { name: draft.entry.name.trim() || t(draft.entry.kind), account: accounts.find(item => item.id === draft.pay.account_id)?.name ?? t('Cash account'), reason: t(partial.reason) };
 return <div className="asset-partial" role="alert">
  <p>{t(buy ? '{name} is saved, with nothing in it yet. The purchase from {account} was not recorded: {reason}' : '{name} is saved at its value. The payment from {account} was not recorded: {reason}', values)}</p>
  <p className="muted">{t('Retry records only the purchase. Nothing is recorded twice.')}</p>
  <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('Finish without the purchase')}</Button>
 </div>;
}
