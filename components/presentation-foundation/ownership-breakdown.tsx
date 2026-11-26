"use client";
import type { CSSProperties } from 'react';
import { useLanguage } from '@/components/language-provider';
import { formatPercent } from '@/lib/format';
import { paletteColor, type PaletteColor } from '@/lib/business';
import type { OwnershipPart } from '@/lib/co-owners';

/** Co-owners take these in turn after the person, whose slice is the mark colour; a 13th would start again. */
const coOwnerColors: readonly PaletteColor[] = ['blue', 'amber', 'violet', 'pink', 'orange', 'indigo', 'green', 'red', 'teal', 'slate'];
/** The colour of a slice: the person's in the mark colour, a co-owner's from the palette, the unassigned rest hatched. */
export const partColor = (part: Pick<OwnershipPart, 'role' | 'color'>) => part.role === 'you' ? 'var(--mark-bg)' : part.role === 'unassigned' ? 'transparent' : paletteColor(coOwnerColors[(part.color - 1) % coOwnerColors.length]);

/** A slice's name as the person reads it: "You", the co-owner's own name, or "Not assigned". */
export function usePartName() {
 const { t } = useLanguage();
 return (part: Pick<OwnershipPart, 'role' | 'name'>) => part.role === 'you' ? t('You') : part.role === 'unassigned' ? t('Not assigned') : part.name;
}

/** Who owns how much of an asset, as one thin stacked bar; the slices read out for screen readers. */
export function OwnershipBar({ parts, size = 'md' }: { parts: readonly OwnershipPart[]; size?: 'sm' | 'md' }) {
 const { locale } = useLanguage();
 const nameOf = usePartName();
 const label = parts.map(part => `${nameOf(part)} ${formatPercent(part.percentage, locale, 2)}`).join(', ');
 return <span className="ownership-bar" data-size={size} role="img" aria-label={label}>
  {parts.map(part => <i key={part.key} data-role={part.role} style={{ inlineSize: `${Math.max(part.percentage, 0)}%`, '--part': partColor(part) } as CSSProperties}/>)}
 </span>;
}

/** The bar with a row per owner under it: colour, name, share and, where the whole value is known, the value of that
 * share. `extra` adds one more figure per row (a share of the income), under its own heading. */
export function OwnershipBreakdown({ parts, money, extra }: { parts: readonly OwnershipPart[]; money: (amount: number) => string; extra?: { label: string; value: (part: OwnershipPart) => string } }) {
 const { t, locale } = useLanguage();
 const nameOf = usePartName();
 return <div className="ownership-breakdown">
  <OwnershipBar parts={parts}/>
  <table>
   <thead><tr><th scope="col">{t('Owner')}</th><th scope="col">{t('Share')}</th><th scope="col">{t('Value')}</th>{extra && <th scope="col">{extra.label}</th>}</tr></thead>
   <tbody>{parts.map(part => <tr key={part.key} data-role={part.role}>
    <th scope="row"><i className="ownership-swatch" data-role={part.role} style={{ '--part': partColor(part) } as CSSProperties} aria-hidden="true"/>{nameOf(part)}</th>
    <td>{formatPercent(part.percentage, locale, 2)}</td>
    <td>{part.value === null ? '—' : money(part.value)}</td>
    {extra && <td>{part.role === 'unassigned' ? '—' : extra.value(part)}</td>}
   </tr>)}</tbody>
  </table>
 </div>;
}
