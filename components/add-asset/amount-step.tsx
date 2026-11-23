"use client";
import { useLanguage } from '@/components/language-provider';
import { CurrencySelect } from '@/components/presentation-foundation/currency-select';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { OwnershipFields } from '@/components/record-dialog/ownership-fields';
import { Button } from '@/components/ui/button';
import { draftWorth, totalPaid, withCost } from '@/lib/add-asset';
import { simpleInterestKinds, unitPricedKinds, type Entry } from '@/lib/finance';
import { formatMoney } from '@/lib/format';
import type { HoldingCostField } from '@/lib/holding-cost';
import { instrumentFor } from '@/lib/market';
import { Field, QuoteStatus, type QuoteProps, type StepProps } from './field';

type AmountProps = StepProps & { today: string };
const quantityLabel = (kind: string) => kind === 'Precious metals' ? 'Weight' : kind === 'Equity compensation' ? 'Vested units' : 'Quantity';

/** The currency the asset is kept in, where the person has more than one; another currency is another price. */
function CurrencyField({ draft, change, disabled, currencies, onQuote }: StepProps & { currencies: string[]; onQuote?: (entry: Entry) => void }) {
 if (currencies.length < 2) return null;
 return <CurrencySelect value={draft.entry.currency} currencies={currencies} disabled={disabled} onChange={currency => {
  const quoted = unitPricedKinds.includes(draft.entry.kind), entry = { ...draft.entry, currency, ...(quoted ? { amount: 0 } : {}) };
  change({ ...draft, entry, pay: { ...draft.pay, account_id: '', debited: 0 } });
  if (quoted) onQuote?.(entry);
 }}/>;
}

/** A holding held in units: how many, and what was paid, as a total or per unit. The two typed last decide the third,
 * which is filled in as they are typed. The current price comes from the market and can be typed over. */
function QuotedFields({ draft, change, problems, disabled, quote, onQuote }: StepProps & QuoteProps) {
 const { t, locale } = useLanguage();
 const { entry } = draft;
 const set = (field: HoldingCostField, amount: number) => change(withCost(draft, field, amount));
 return <>
  <div className="form-grid">
   <Field name="quantity" label={t(quantityLabel(entry.kind))} problem={problems.quantity}>{aria => <FormattedNumberInput value={entry.quantity} max={1e12} displayFractionDigits={8} invalid={aria.invalid} describedBy={aria.describedBy} onValueChange={amount => set('quantity', amount)}/>}</Field>
   <Field label={`${t('Total paid')} (${entry.currency})`}>{() => <FormattedNumberInput value={totalPaid(draft)} required={false} onValueChange={amount => set('total', amount)}/>}</Field>
  </div>
  <div className="form-grid">
   <Field label={`${t('Purchase price per unit')} (${entry.currency})`}>{() => <FormattedNumberInput value={entry.cost} required={false} displayFractionDigits={8} onValueChange={amount => set('cost', amount)}/>}</Field>
   <Field name="price" label={`${t('Current price per unit')} (${entry.currency})`} problem={problems.price}>{aria => <FormattedNumberInput value={entry.amount} displayFractionDigits={8} invalid={aria.invalid} describedBy={aria.describedBy} onValueChange={amount => change({ ...draft, entry: { ...entry, amount } })}/>}</Field>
  </div>
  <QuoteStatus entry={entry} quote={quote} onQuote={onQuote}/>
  {quote.status !== 'loading' && quote.status !== 'failed' && instrumentFor(entry) && <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onQuote(entry)}>{t('Fetch current price')}</Button>}
  {entry.kind === 'Equity compensation' && <Field name="vesting" label={t('Vesting date')} problem={problems.vesting}>{() => <DatePicker value={entry.date} onChange={date => change({ ...draft, entry: { ...entry, date } })}/>}</Field>}
  {entry.quantity > 0 && entry.amount > 0 && <p className="ownership-summary" aria-live="polite">{t('Worth today: {amount}', { amount: formatMoney(draftWorth(draft).full, entry.currency, locale) })}</p>}
 </>;
}

/** A Treasury bill or a bond: what was put in, what it earns, and the two dates it runs between. */
function InterestFields({ draft, change, problems, today }: AmountProps) {
 const { t } = useLanguage();
 const { entry } = draft, bill = entry.kind === 'Treasury bill';
 const set = (patch: Partial<Entry>) => change({ ...draft, entry: { ...entry, ...patch } });
 return <>
  <div className="form-grid">
   <Field name="value" label={`${t(bill ? 'Amount invested' : 'Face value')} (${entry.currency})`} problem={problems.value}>{aria => <FormattedNumberInput value={entry.amount} invalid={aria.invalid} describedBy={aria.describedBy} onValueChange={amount => set({ amount })}/>}</Field>
   <Field label={t(bill ? 'Annual yield (%)' : 'Coupon rate (%)')}>{() => <FormattedNumberInput value={entry.rate} required={false} max={1000} onValueChange={rate => set({ rate })}/>}</Field>
  </div>
  <div className="form-grid">
   <Field name="date" label={t('Purchase date')} problem={problems.date}>{() => <DatePicker value={entry.opened_on ?? today} max={today} onChange={opened_on => set({ opened_on })}/>}</Field>
   <Field name="maturity" label={t('Maturity date')} problem={problems.maturity}>{() => <DatePicker value={entry.date} min={entry.opened_on ?? today} onChange={date => set({ date })}/>}</Field>
  </div>
 </>;
}

/** Something valued by hand: one value, and from the record form's own fields whether it is counted in units and how
 * much of it the person owns. */
function ValuedFields({ draft, change, problems, disabled }: StepProps) {
 const { t } = useLanguage();
 const { entry } = draft;
 const setEntry = (next: Entry) => change({ ...draft, entry: next, pay: { ...draft.pay, paid: null } });
 const problem = problems.units ?? problems.unit ?? problems.ownership;
 return <>
  <Field name="value" label={`${t(entry.unit_label != null ? 'Value per unit' : 'Current value')} (${entry.currency})`} problem={problems.value}>{aria => <FormattedNumberInput value={entry.amount} invalid={aria.invalid} describedBy={aria.describedBy} onValueChange={amount => setEntry({ ...entry, amount })}/>}</Field>
  <div className="asset-owned" data-field={problems.units ? 'units' : problems.unit ? 'unit' : 'ownership'}>
   <OwnershipFields editing={entry} setEditing={setEntry} disabled={disabled}/>
   {problem && <small role="alert" className="field-error">{t(problem.message)}</small>}
  </div>
 </>;
}

/** Step three: how much. Each kind shows only its own fields. */
export function AmountStep(props: AmountProps & QuoteProps & { currencies: string[] }) {
 const { t } = useLanguage();
 const { draft, currencies, onQuote } = props, kind = draft.entry.kind;
 const quoted = unitPricedKinds.includes(kind);
 return <section className="goal-setup-single">
  <h1>{t('How much?')}</h1>
  <CurrencyField {...props} currencies={currencies} onQuote={onQuote}/>
  {quoted ? <QuotedFields {...props}/> : simpleInterestKinds.includes(kind) ? <InterestFields {...props}/> : <ValuedFields {...props}/>}
 </section>;
}
