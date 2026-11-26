"use client";
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { isCounted, ownedPercent, shareOf, valuedKinds, type Entry } from '@/lib/finance';
import { coOwnedPercent, coOwnersOf, maxOwnPercent } from '@/lib/co-owners';

/** What a value update of an owned asset adds to the tracker's draft: a counted asset's two numbers and a new share. */
export type OwnedDraft = { quantity?: number; unit_value?: number; ownership?: number };
type Draft = OwnedDraft & { type: string; balance: number | null };

/** A value update of a counted asset is entered as its two numbers. */
export const countedUpdate = (record: Entry, type: string) => type === 'valuation' && isCounted(record);
/** Only a value update of an asset valued by hand can change the share. */
export const sharedUpdate = (record: Entry, type: string) => type === 'valuation' && valuedKinds.includes(record.kind);
/** The share the update is saved at when it differs from the record's own; undefined leaves the share alone. */
export const changedOwnership = (record: Entry, draft: Draft) => sharedUpdate(record, draft.type) && draft.ownership !== undefined && draft.ownership !== ownedPercent(record) ? draft.ownership : undefined;
/** The numbers a new draft starts from: today's count and value per unit, ready to be changed. */
export const ownedDraftStart = (record: Entry, type: string): OwnedDraft => countedUpdate(record, type) ? { quantity: record.quantity, unit_value: record.amount } : {};
/** The whole asset's value the update saves: the product of a counted asset's numbers; the typed value; or, when only
 * the share changes and no value was typed, the value it already has. */
export function ownedBalance(record: Entry, draft: Draft, blank: boolean, current: number): number | null {
 if (countedUpdate(record, draft.type)) return (draft.quantity ?? 0) * (draft.unit_value ?? 0);
 return blank && changedOwnership(record, draft) !== undefined ? current : draft.balance;
}
/** Whether the owned part of the draft can be saved: a share above 0 up to 100, and for a counted asset both numbers in range. */
export function ownedDraftReady(record: Entry, draft: Draft) {
 const share = draft.ownership ?? ownedPercent(record);
 // Co-owners keep their shares, so the person's can grow only into what nobody holds.
 if (sharedUpdate(record, draft.type) && !(share > 0 && share <= maxOwnPercent(record) + 1e-9)) return false;
 if (!countedUpdate(record, draft.type)) return true;
 const quantity = draft.quantity ?? 0, unit = draft.unit_value ?? 0;
 return quantity >= 0 && quantity <= 1e12 && unit >= 0 && unit <= 1e15 && quantity * unit <= 1e15;
}
/** What the saved update carries beyond its seven fields. */
export function ownedPayload(record: Entry, draft: Draft): { quantity?: number; unit_value?: number; ownership?: number } {
 const ownership = changedOwnership(record, draft);
 return { ...(countedUpdate(record, draft.type) ? { quantity: draft.quantity ?? 0, unit_value: draft.unit_value ?? 0 } : {}), ...(ownership === undefined ? {} : { ownership }) };
}

type FieldsProps<D extends Draft> = { record: Entry; draft: D; setDraft: (draft: D) => void; currentFull: number | null };

/** A counted asset's value update: how many and the value of one, with the total and the owned share as they are typed. */
export function CountedValueFields<D extends Draft>({ record, draft, setDraft, currentFull }: FieldsProps<D>) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, record.currency, locale);
 const total = (draft.quantity ?? 0) * (draft.unit_value ?? 0);
 return <>
  <div className="form-grid">
   <label>{t('Quantity')}<FormattedNumberInput value={draft.quantity ?? 0} max={1e12} displayFractionDigits={8} onValueChange={quantity => setDraft({ ...draft, quantity })}/></label>
   <label>{t('Value per unit')}<FormattedNumberInput value={draft.unit_value ?? 0} max={1e15} onValueChange={unit_value => setDraft({ ...draft, unit_value })}/></label>
  </div>
  <div className="ownership-summary owned-summary" aria-live="polite">
   <p>{t('{quantity} {unit} × {value}', { quantity: formatNumber(draft.quantity ?? 0, locale, 8), unit: record.unit_label ?? '', value: money(draft.unit_value ?? 0) })}</p>
   <p>{t('Total value: {amount}', { amount: money(total) })}</p>
   <p className="muted">{t('Current value')}: {currentFull === null ? '—' : money(currentFull)}</p>
  </div>
 </>;
}

/** The share the asset is owned at from this update on. Left as it is, the update keeps the current share. */
export function OwnershipField<D extends Draft>({ record, draft, setDraft, full }: Omit<FieldsProps<D>, 'currentFull'> & { /** The whole value the update saves, to show the share of. */ full: number | null }) {
 const { t, locale } = useLanguage();
 const share = draft.ownership ?? ownedPercent(record);
 const others = coOwnedPercent(coOwnersOf(record));
 return <label>{t('Ownership (%)')}<FormattedNumberInput value={share} max={maxOwnPercent(record)} maxMessage={others > 0 ? t('Co-owners hold {percent}. Change their shares in Edit first.', { percent: formatPercent(others, locale, 8) }) : undefined} displayFractionDigits={8} onValueChange={ownership => setDraft({ ...draft, ownership })}/>
  {full !== null && share > 0 && share < 100 && <small className="muted" aria-live="polite">{t('You own {percent} · your share {amount}', { percent: formatPercent(share, locale, 8), amount: formatMoney(shareOf(full, share), record.currency, locale) })}</small>}
 </label>;
}
