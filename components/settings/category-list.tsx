"use client";
import type { CSSProperties } from 'react';
import { Pencil, Repeat } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { SortableItem, SortableList } from '@/components/presentation-foundation/sortable';
import { Button } from '@/components/ui/button';
import type { CategoryPlan } from '@/lib/category-plans';
import { formatMoney, formatNumber } from '@/lib/format';
import type { Category } from '@/lib/planning';

export type CategoryItem = { id: string; name: string; direction: Category['direction']; category?: Category };
/** One row as the list draws it: the category, its translated name, its look and what is planned under it. */
export type CategoryRowView = { item: CategoryItem; label: string; emoji: string; hue: number; plan: CategoryPlan; /** Deletes it; absent for the last category of its direction. */ onDelete?: () => void };
type Props = { direction: Category['direction']; rows: CategoryRowView[]; currency: string; disabled: boolean; moveDisabled: boolean;
 onMove: (id: string, target: string, visible: string[]) => void; onEdit: (item: CategoryItem) => void };

/** One direction's categories as a single list the person orders by dragging: grip, icon tile, name and colour, this
 * month's budget and the recurring bill. The whole row opens the editor; Edit and the bin show on hover and focus. */
export function CategoryList({ direction, rows, currency, disabled, moveDisabled, onMove, onEdit }: Props) {
 const { t } = useLanguage();
 const ids = rows.map(row => row.item.id);
 const recurring = t(direction === 'income' ? 'Recurring income' : 'Recurring bill');
 return <div className="category-list">
  <div className="category-row category-list-head" aria-hidden="true"><span/><span/><span>{t('Category')}</span><span>{t('Monthly budget')}</span><span>{recurring}</span><span/></div>
  <SortableList id={`categories-${direction}`} items={ids} nameOf={id => rows.find(row => row.item.id === id)?.label ?? ''} onMove={(moved, over) => onMove(moved, over, ids)} disabled={moveDisabled}>
   <ul className="category-rows">{rows.map(row => <SortableItem as="li" key={row.item.id} id={row.item.id} label={row.label} className="category-row" onOpen={disabled ? undefined : () => onEdit(row.item)}>
    <span className="category-icon" data-size="sm" style={{ '--category-hue': row.hue } as CSSProperties} aria-hidden="true">{row.emoji}</span>
    <span className="category-row-name">{row.label}<i className="category-row-dot" style={{ '--category-hue': row.hue } as CSSProperties} aria-hidden="true"/></span>
    <CategoryBudget plan={row.plan} currency={currency} label={t('Monthly budget')}/>
    <CategorySchedules plan={row.plan} label={recurring}/>
    <span className="category-row-actions">
     <Button type="button" variant="ghost" size="icon" disabled={disabled} title={t('Edit {name}', { name: row.label })} aria-label={t('Edit {name}', { name: row.label })} onClick={() => onEdit(row.item)}><Pencil size={16} aria-hidden="true"/></Button>
     <DeleteButton variant="ghost" disabled={disabled} label={t('Delete {name}', { name: row.label })} reason={row.onDelete ? undefined : t('Keep at least one category of this type.')} onClick={row.onDelete}/>
    </span>
   </SortableItem>)}</ul>
  </SortableList>
 </div>;
}

/** This month's budget in the display currency; a dash without one, and "Exchange rate unavailable" when no rate converts it. */
function CategoryBudget({ plan, currency, label }: { plan: CategoryPlan; currency: string; label: string }) {
 const { t, locale } = useLanguage();
 if (plan.budget === undefined) return <span className="category-row-plan" data-label={label} data-empty>—</span>;
 if (plan.budget === null) return <span className="category-row-plan" data-label={label} data-empty title={t('Exchange rate unavailable.')} aria-label={t('Exchange rate unavailable.')}>—</span>;
 return <span className="category-row-plan" data-label={label}>{formatMoney(plan.budget, currency, locale)}</span>;
}

/** The recurring bill (or income) counted under the category: its name, and how many more when there are several. */
function CategorySchedules({ plan, label }: { plan: CategoryPlan; label: string }) {
 const { t, locale } = useLanguage();
 const [first, ...rest] = plan.schedules;
 if (!first) return <span className="category-row-plan" data-label={label} data-empty>—</span>;
 return <span className="category-row-plan category-row-schedule" data-label={label}><Repeat size={14} aria-hidden="true"/><span>{first.name}</span>{rest.length > 0 && <small>{t('{count} more', { count: formatNumber(rest.length, locale, 0) })}</small>}</span>;
}
