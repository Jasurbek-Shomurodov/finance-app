"use client";
import { useId } from 'react';
import { InstrumentPicker } from '@/components/instrument-picker';
import { useLanguage } from '@/components/language-provider';
import { FieldError } from '@/components/presentation-foundation/field-error';
import { RecordIcon } from '@/components/presentation-foundation/record-icon';
import { MetalFields } from '@/components/record-dialog/metal-fields';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { choosableAssetKinds, instrumentKind } from '@/lib/add-asset';
import type { Entry } from '@/lib/finance';
import { holdingAccountLabel, type HoldingAccount } from '@/lib/holding-accounts';
import { formatMoney } from '@/lib/format';
import { instrumentFor } from '@/lib/market';
import { namePlaceholder } from '@/lib/record-names';
import { Field, QuoteStatus, type QuoteProps, type StepProps } from './field';

/** Step one: the kinds of asset as tiles. Choosing one moves on; a business starts its own setup instead. */
export function KindStep({ current, onChoose }: { /** The kind chosen before, when the person came back to change it. */ current?: Entry['kind']; onChoose: (kind: Entry['kind']) => void }) {
 const { t } = useLanguage();
 return <section className="goal-setup-select">
  <h1>{t('What are you adding?')}</h1>
  <div className="asset-type-options">{choosableAssetKinds.map(kind => <button key={kind} type="button" aria-pressed={kind === current} onClick={() => onChoose(kind)}><RecordIcon record={{ kind, name: '' }}/><span>{t(kind)}</span></button>)}</div>
 </section>;
}

/** The kind, once chosen: locked on every later step, with the way back to the tiles beside it. */
export function KindChip({ kind, disabled, onChange }: { kind: Entry['kind']; disabled: boolean; onChange: () => void }) {
 const { t } = useLanguage();
 return <p className="asset-kind-chip"><RecordIcon record={{ kind, name: '' }}/><span>{t(kind)}</span><button type="button" disabled={disabled} onClick={onChange}>{t('Change')}</button></p>;
}

/** Step two: what it is. A stock, a coin or vested shares are picked from the market's list and their price is fetched
 * at once; a metal is its metal, unit and purity; anything else is a name. */
export function WhatStep({ draft, change, problems, disabled, quote, onQuote, holdingAccounts }: StepProps & QuoteProps & { holdingAccounts: readonly HoldingAccount[] }) {
 const { t, locale } = useLanguage();
 const errorId = useId();
 const { entry } = draft, picker = instrumentKind(entry.kind);
 /** Another instrument or metal grade is another price: the old one is dropped and the new one asked for. The same
  * instrument picked again changes nothing, so a price on its way still lands. */
 const repriced = (next: Entry) => { change({ ...draft, entry: next }); onQuote(next); };
 const accounts = holdingAccounts.filter(account => account.kind === entry.kind);
 const price = quote.status === 'ready' && entry.amount > 0 ? <p className="muted asset-quote" role="status">{t('Current price: {price}', { price: formatMoney(entry.amount, entry.currency, locale, true) })}</p> : <QuoteStatus entry={entry} quote={quote} onQuote={onQuote}/>;
 if (picker) return <section className="goal-setup-single">
  <h1>{t('What is it?')}</h1>
  <div className="asset-field" data-field="name" aria-describedby={problems.name ? errorId : undefined}>
   <InstrumentPicker key={entry.kind} kind={picker} value={entry.name} disabled={disabled} onChange={name => { if (instrumentFor({ ...entry, name })?.symbol !== instrumentFor(entry)?.symbol) repriced({ ...entry, name, amount: 0 }); }}/>
   <FieldError id={errorId} message={problems.name?.message}/>
  </div>
  {price}
  {accounts.length > 0 && <label className="asset-field">{t('Investment account (optional)')}<NativeSelect disabled={disabled} value={entry.holding_account_id ?? ''} onChange={event => change({ ...draft, entry: { ...entry, holding_account_id: event.target.value || null } })}><option value="">{t('No investment account')}</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {t(holdingAccountLabel(account.kind))}</option>)}</NativeSelect></label>}
 </section>;
 return <section className="goal-setup-single">
  <h1>{t('What is it?')}</h1>
  {entry.kind === 'Precious metals' && <><MetalFields editing={entry} setEditing={repriced} disabled={disabled}/>{price}</>}
  <Field name="name" label={t(entry.kind === 'Precious metals' ? 'Name (optional)' : 'Name')} problem={problems.name}>{aria => <Input maxLength={120} disabled={disabled} value={entry.name} placeholder={t(namePlaceholder(entry.kind, false))} aria-invalid={aria.invalid || undefined} aria-describedby={aria.describedBy} onChange={event => change({ ...draft, entry: { ...entry, name: event.target.value } })}/>}</Field>
 </section>;
}
