"use client";
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatPercent } from '@/lib/format';
import { ownedPercent, shareOf, type Entry } from '@/lib/finance';

type Basis = NonNullable<Entry['amount_basis']>;

/** The share a transaction of `business` counts at: the one it was linked at when it is kept, otherwise the
 * business's share today. Null when the transaction names no part-owned business, so there is nothing to choose. */
export function basisShare(editing: Pick<Entry, 'business_id' | 'business_share' | 'frequency'>, records: readonly Entry[], saved?: Pick<Entry, 'business_id'> | null): number | null {
 if (!editing.business_id || editing.frequency !== 'Once') return null;
 const business = records.find(record => record.id === editing.business_id && record.kind === 'Business');
 // A kept share belongs to the business it was read from; moved to another business, the new one's share applies.
 const kept = saved?.business_id === editing.business_id && editing.business_share != null ? Number(editing.business_share) : null;
 const share = kept ?? (business ? ownedPercent(business) : null);
 return share !== null && share > 0 && share < 100 ? share : null;
}

/** Whole business or My share: whether the amount typed is the business's own figure or the owner's part of it. It
 * shows only for a one-time income or expense of a business the person owns part of. A whole-business figure is
 * reported at the owner's share, which is shown as it is typed. */
export function BusinessBasisField({ editing, records, saved, disabled, onChange }: { editing: Entry; records: readonly Entry[]; saved?: Entry | null; disabled: boolean; onChange: (basis: Basis) => void }) {
 const { t, locale } = useLanguage();
 const share = basisShare(editing, records, saved);
 if (share === null) return null;
 const basis: Basis = editing.amount_basis ?? 'mine';
 return <div className="basis-field" data-field="basis">
  <span className="basis-field-label">{t('Amount is for')}<InfoHint><p>{t('Choose Whole business when the amount is the business’s own figure: reports then count your share of it. Choose My share when it is only the money that is yours.')}</p></InfoHint></span>
  {/* The pressed state is read from the form: a disabled form leaves the choice visible. */}
  <fieldset disabled={disabled}><Segmented label={t('Amount is for')} value={basis} onChange={onChange} options={[{ value: 'mine', label: t('My share') }, { value: 'whole', label: t('Whole business') }]}/></fieldset>
  {basis === 'whole' && <small className="muted" aria-live="polite">{t('You own {percent} · your share {amount}', { percent: formatPercent(share, locale, 8), amount: formatMoney(shareOf(editing.amount, share), editing.currency, locale) })}</small>}
 </div>;
}
