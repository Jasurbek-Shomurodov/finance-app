"use client";
import type { CSSProperties, ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { useCategoryHue } from '@/components/category-icons-context';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { RowMenu } from '@/components/presentation-foundation/row-menu';
import { Button } from '@/components/ui/button';
import { shiftDay } from '@/lib/calendar-days';
import { deletedItemType, type DeletedItem } from '@/lib/deleted-items';
import { frequencyLabels, income, unitPricedKinds } from '@/lib/finance';
import { formatDate } from '@/lib/format';
import { goalEmoji } from '@/lib/goal-emoji';
import { shownName } from '@/lib/record-names';

/** How a row reads an item's category; the screen passes the workspace's own names (`useRestorePreview`). */
export type ItemNames = { categoryName: (entry: Extract<DeletedItem, { source: 'finance_records' }>['data']) => string };

/** The name a person reads: a transaction saved without a name reads by its category in the current language, as Transactions shows it. */
export const deletedName = (item: DeletedItem, t: (key: string) => string) => item.source === 'finance_records' ? shownName(item.data, t) : item.data.name;

/** The item's kind of record, the first part of its meta line and of the side panel's subtitle. */
export function deletedTypeLabel(item: DeletedItem) {
 const type = deletedItemType(item);
 if (item.source === 'finance_records' && type === 'recurring') return income.includes(item.data.kind) ? 'Recurring income' : 'Recurring bill';
 if (item.source === 'finance_records' && type === 'accounts') return item.data.kind;
 return type === 'transactions' ? 'Transaction' : type === 'goals' ? 'Savings goal' : 'Monthly expense plan';
}

/** Type, category and the record's own date (or schedule) on one line. */
export function deletedMeta(item: DeletedItem, names: ItemNames, t: (key: string) => string, locale: string) {
 const parts = [t(deletedTypeLabel(item))];
 if (item.source === 'finance_records') {
  const type = deletedItemType(item);
  if (type !== 'accounts') parts.push(names.categoryName(item.data));
  if (type === 'recurring') parts.push(t(frequencyLabels[item.data.frequency]));
  else if (item.data.date) parts.push(formatDate(item.data.date, locale));
 } else if (item.source === 'savings_goals' && item.data.target_date) parts.push(formatDate(item.data.target_date, locale));
 return parts.join(' · ');
}

/** The amount as it was entered, in its own currency: a holding counts its units, a goal its target, income in green. */
export function DeletedAmount({ item }: { item: DeletedItem }) {
 const { entered } = useDisplayMoney();
 if (item.source === 'savings_goals') return <strong className="recovery-amount">{entered(Number(item.data.target), String(item.data.currency ?? 'USD'))}</strong>;
 if (item.source === 'expense_plans') return <strong className="recovery-amount">{entered(Number(item.data.amount), item.data.currency)}</strong>;
 const units = unitPricedKinds.includes(String(item.data.kind)) ? Number(item.data.quantity || 1) : 1;
 const incoming = income.includes(item.data.kind);
 return <strong className={incoming ? 'recovery-amount positive' : 'recovery-amount'}>{entered(Number(item.data.amount) * units, String(item.data.currency))}</strong>;
}

/** A category's emoji tile for a record, a goal's cover for a goal. */
export function DeletedIcon({ item, names, size }: { item: DeletedItem; names: ItemNames; size?: 'sm' | 'md' }) {
 const hue = useCategoryHue();
 if (item.source === 'finance_records') return <CategoryIcon kind={item.data.custom_category_id ? names.categoryName(item.data) : item.data.kind} size={size}/>;
 if (item.source === 'expense_plans') return <CategoryIcon kind="Other expense" size={size}/>;
 return <span className="category-icon" data-size={size} style={{ '--category-hue': hue('Deposit') } as CSSProperties} aria-hidden="true">{goalEmoji(item.data)}</span>;
}

/** One day of the bin: the day it was deleted on, then its items. */
export function DeletedDay({ day, today, children }: { day: string; today: string; children: ReactNode }) {
 const { t, locale } = useLanguage();
 const label = day === today ? t('Today') : day === shiftDay(today, -1) ? t('Yesterday') : formatDate(day, locale);
 return <section className="recovery-day" aria-label={label}><h3>{label}</h3><ul>{children}</ul></section>;
}

type RowProps = { item: DeletedItem; names: ItemNames; selected: boolean; busy: boolean; onSelect: () => void; onRestore: () => void; onDiscard: () => void };
/** A deleted item: pressing it shows what restoring it changes; Restore is its one action and Delete permanently waits in ⋯. */
export function DeletedRow({ item, names, selected, busy, onSelect, onRestore, onDiscard }: RowProps) {
 const { t, locale } = useLanguage();
 const name = deletedName(item, t);
 return <li className="recovery-row" data-selected={selected || undefined}>
  <button type="button" className="recovery-select" aria-pressed={selected} onClick={onSelect}>
   <DeletedIcon item={item} names={names}/>
   <span className="recovery-info"><strong>{name}</strong><small>{deletedMeta(item, names, t, locale)}</small></span>
   <DeletedAmount item={item}/>
  </button>
  <div className="row-actions">
   <Button size="sm" variant="outline" disabled={busy} onClick={onRestore}><RotateCcw size={15} aria-hidden="true"/>{t('Restore')}</Button>
   <RowMenu label={t('Actions for {name}', { name })} items={[{ label: t('Delete permanently'), deletes: true, disabled: busy, onSelect: onDiscard }]}/>
  </div>
 </li>;
}
