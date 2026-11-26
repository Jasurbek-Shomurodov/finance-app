"use client";
import { useId, useState } from 'react';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { HintedLabel } from '@/components/presentation-foundation/hinted-label';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatPercent } from '@/lib/format';
import { ownedPercent, shareOf, type Entry } from '@/lib/finance';
import { coOwnersOf } from '@/lib/co-owners';
import { CoOwnerFields } from './co-owner-fields';

type Props = { editing: Entry; setEditing: (entry: Entry) => void; disabled: boolean; /** Off where the form names its problems itself (Add asset). */ inlineProblem?: boolean };

/** What a valued asset (a business, a property, a vehicle…) is made of beyond its value: whether it is counted in
 * units (1,300 sheep at a value each) and how much of it the person owns. The value field itself stays in the record
 * form; counted, it holds the value of one unit. The total and the owned share are shown as they are typed. */
export function OwnershipFields({ editing, setEditing, disabled, inlineProblem = true }: Props) {
 const { t, locale } = useLanguage();
 const switchId = useId();
 // The switch is the form's own state: a unit name still being typed is empty (not null), and is a count already.
 const [counted, setCounted] = useState(() => editing.unit_label != null);
 const total = counted ? editing.amount * editing.quantity : editing.amount;
 const percent = ownedPercent(editing);
 // With co-owners named, the breakdown under them gives every share, the person's included.
 const named = coOwnersOf(editing).length > 0;
 const money = (amount: number) => formatMoney(amount, editing.currency, locale);
 const toggle = (on: boolean) => {
  setCounted(on);
  // Turning it off keeps what the asset is worth: the total becomes its value again.
  setEditing(on ? { ...editing, quantity: editing.quantity > 0 ? editing.quantity : 1, unit_label: editing.unit_label ?? '' } : { ...editing, amount: total, quantity: 1, unit_label: null });
 };
 return <>
  <div className="record-switch-row">
   <label htmlFor={switchId}>{t('Counted in units')}</label>
   <InfoHint><p>{t('Turn this on for an asset you count, such as animals, hectares or machines. It is worth the quantity times the value per unit, and each value update keeps both numbers.')}</p></InfoHint>
   <Switch id={switchId} checked={counted} disabled={disabled} onCheckedChange={toggle}/>
  </div>
  {counted && <div className="form-grid">
   <label>{t('Quantity')}<FormattedNumberInput key={editing.id + ':units'} value={editing.quantity} max={1e12} displayFractionDigits={8} onValueChange={quantity => setEditing({ ...editing, quantity })}/></label>
   <label>{t('Unit name')}<Input required maxLength={40} disabled={disabled} value={editing.unit_label ?? ''} placeholder={t('e.g. sheep, hectares or machines')} onChange={event => setEditing({ ...editing, unit_label: event.target.value })}/></label>
  </div>}
  <HintedLabel label={t('Ownership (%)')} hint={t(editing.kind === 'Business' ? 'Enter the full business value and your ownership percentage. Record your share of revenue and costs separately as linked income and expenses.' : 'Enter the full value and the percentage you own. Totals and net worth count your share.')}>
   <FormattedNumberInput key={editing.id + ':ownership'} value={editing.ownership_percentage ?? 100} max={100} displayFractionDigits={8} onValueChange={percentage => setEditing({ ...editing, ownership_percentage: percentage })}/>
  </HintedLabel>
  {(counted || (percent < 100 && !named)) && <div className="ownership-summary owned-summary" aria-live="polite">
   {counted && <p>{t('Total value: {amount}', { amount: money(total) })}</p>}
   {percent < 100 && !named && <p>{t('You own {percent} · your share {amount}', { percent: formatPercent(percent, locale, 8), amount: money(shareOf(total, percent)) })}</p>}
  </div>}
  <CoOwnerFields editing={editing} setEditing={setEditing} disabled={disabled} inlineProblem={inlineProblem}/>
 </>;
}
