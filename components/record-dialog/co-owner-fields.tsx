"use client";
import type { CSSProperties } from 'react';
import { UserPlus, X } from 'lucide-react';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { OwnershipBreakdown, partColor } from '@/components/presentation-foundation/ownership-breakdown';
import { SortableItem, SortableList } from '@/components/presentation-foundation/sortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { formatMoney } from '@/lib/format';
import { fullValue, type CoOwner, type Entry } from '@/lib/finance';
import { coOwnerNameLength, coOwnersOf, coOwnersProblem, maxCoOwners, moveCoOwner, newCoOwner, ownershipParts } from '@/lib/co-owners';

type Props = { editing: Entry; setEditing: (entry: Entry) => void; disabled: boolean; /** Show why the list cannot be saved under it; a form that names problems itself turns this off. */ inlineProblem?: boolean };

/** The other people who own the asset: a row each with a name and a share, in an order the person can drag, and the
 * split of the whole value as a bar and a table as it is typed. The person's own share stays the field above. */
export function CoOwnerFields({ editing, setEditing, disabled, inlineProblem = true }: Props) {
 const { t, locale } = useLanguage();
 const owners = coOwnersOf(editing);
 const set = (co_owners: CoOwner[]) => setEditing({ ...editing, co_owners });
 const change = (id: string, patch: Partial<CoOwner>) => set(owners.map(owner => owner.id === id ? { ...owner, ...patch } : owner));
 const nameOf = (owner: CoOwner | undefined) => owner?.name.trim() || t('Co-owner');
 const parts = ownershipParts(editing, fullValue(editing));
 const problem = coOwnersProblem(editing);
 return <fieldset className="co-owners" disabled={disabled}>
  <legend>{t('Co-owners')}<InfoHint><p>{t('Name the people who own the rest of this asset and their shares. Your totals still count only your share; the others are shown for reference.')}</p></InfoHint></legend>
  {owners.length > 0 && <SortableList id={`co-owners-${editing.id}`} items={owners.map(owner => owner.id)} nameOf={id => nameOf(owners.find(owner => owner.id === id))} onMove={(active, over) => set(moveCoOwner(owners, active, over))} disabled={disabled}>
   <ul className="co-owner-list">{owners.map((owner, index) => <SortableItem key={owner.id} as="li" id={owner.id} label={nameOf(owner)} className="co-owner-row">
    <i className="ownership-swatch" style={{ '--part': partColor({ role: 'co-owner', color: index + 1 }) } as CSSProperties} aria-hidden="true"/>
    <Input aria-label={t('Co-owner name')} maxLength={coOwnerNameLength} value={owner.name} placeholder={t('Name')} onChange={event => change(owner.id, { name: event.target.value })}/>
    <span className="co-owner-share"><FormattedNumberInput ariaLabel={t('Share of {name} (%)', { name: nameOf(owner) })} value={owner.percentage} max={100} displayFractionDigits={8} onValueChange={percentage => change(owner.id, { percentage })}/><span aria-hidden="true">%</span></span>
    <Button type="button" size="icon" variant="ghost" aria-label={t('Remove {name}', { name: nameOf(owner) })} onClick={() => set(owners.filter(item => item.id !== owner.id))}><X size={16} aria-hidden="true"/></Button>
   </SortableItem>)}</ul>
  </SortableList>}
  <Button type="button" variant="outline" size="sm" className="co-owner-add" disabled={disabled || owners.length >= maxCoOwners} onClick={() => set([...owners, newCoOwner(editing)])}><UserPlus size={16} aria-hidden="true"/>{t('Add co-owner')}</Button>
  {owners.length > 0 && <OwnershipBreakdown parts={parts} money={amount => formatMoney(amount, editing.currency, locale)}/>}
  {inlineProblem && problem && <small role="alert" className="field-error">{t(problem)}</small>}
 </fieldset>;
}
