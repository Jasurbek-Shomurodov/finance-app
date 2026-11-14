"use client";
import { useLanguage } from '@/components/language-provider';
import { AnimatedMoney } from '@/components/presentation-foundation/animated-money';
import { Count } from '@/components/presentation-foundation/count';
import { categoryColor } from '@/lib/category-colors';
import { formatNumber, formatPercent } from '@/lib/format';

export type AllocationGroup = { kind: string; amount: number };
/** A kind holding less than this share of the total counts as part of the long tail. */
export const allocationFoldPercent = 2;

/** The kinds that lead the list and the long tail that folds into "Other kinds": kinds under 2% of the total, once
 * there are three of them. Fewer stay in the list, since a fold of one or two rows saves nothing. */
export function foldAllocation<T extends AllocationGroup>(groups: readonly T[], total: number): { lead: T[]; folded: T[] } {
 const tail = total > 0 ? groups.filter(group => group.amount / total * 100 < allocationFoldPercent) : [];
 const folded = tail.length >= 3 ? tail : [];
 return { lead: groups.filter(group => !folded.includes(group)), folded };
}

type Props = { groups: readonly AllocationGroup[]; total: number; currency: string; loading: boolean; selected: string; onSelect: (kind: string) => void };

/** The allocation beside the donut: one row a kind with its amount, share and bar. A long tail of small kinds is one
 * "Other kinds" row that opens them, so it does not push the accounts down the page; the donut still draws every kind. */
export function AssetAllocationList({ groups, total, currency, loading, selected, onSelect }: Props) {
 const { t, locale } = useLanguage();
 const { lead, folded } = foldAllocation(groups, total);
 const foldedAmount = folded.reduce((sum, group) => sum + group.amount, 0);
 const share = (amount: number) => loading || total <= 0 ? '—' : formatPercent(amount / total * 100, locale, 1, 1);
 const money = (amount: number) => loading ? '—' : <AnimatedMoney value={amount} currency={currency}/>;
 const row = (group: AllocationGroup) => <li key={group.kind}><button type="button" className="allocation-option" aria-pressed={selected === group.kind} onClick={() => onSelect(group.kind)}>
  <i style={{ background: categoryColor(group.kind) }} aria-hidden="true"/><span>{t(group.kind)}</span><strong>{money(group.amount)}</strong><small>{share(group.amount)}</small>
  <span className="allocation-share" aria-hidden="true"><span style={{ inlineSize: `${total > 0 ? Math.max(group.amount, 0) / total * 100 : 0}%`, background: categoryColor(group.kind) }}/></span>
 </button></li>;
 return <ul className="overview-list">{lead.map(row)}{folded.length > 0 && <li><details className="allocation-other" open={folded.some(group => group.kind === selected) || undefined}>
  <summary><span>{t('Other kinds')}</span><Count value={folded.length} label={t('{count} kinds', { count: formatNumber(folded.length, locale, 0) })}/><strong>{money(foldedAmount)}</strong><small>{share(foldedAmount)}</small></summary>
  <ul className="overview-list">{folded.map(row)}</ul>
 </details></li>}</ul>;
}
