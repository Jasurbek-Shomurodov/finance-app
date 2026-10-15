"use client";
import { Fragment, useState, type ReactNode, type Ref } from 'react';
import { Repeat } from 'lucide-react';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { Count } from '@/components/presentation-foundation/count';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { formatDate, formatSignedMoney } from '@/lib/format';
import type { Category } from '@/lib/planning';
import { groupRecurring, type RecurringGrouping, type RecurringItem } from '@/lib/recurring';
import { customCategory } from './recurring-rows';

const statusLabels: Record<RecurringItem['status'], string> = { overdue: 'Overdue', due: 'Upcoming', paid: 'Paid', skipped: 'Skipped' };
const directionLabels: Record<RecurringItem['direction'], string> = { income: 'Income', expense: 'Expenses' };

type Props = { items: RecurringItem[]; carried: RecurringItem[]; categories: readonly Category[]; listRef: Ref<HTMLUListElement>;
 /** Renders one row; `dated` adds its day under the name when the group heading does not say it, `byCategory` drops the category it does say. */
 row: (item: RecurringItem, dated: boolean, byCategory: boolean) => ReactNode };

/** A group heading: its name, how many items, and their scheduled total in the display currency, income in and bills out.
 * Skipped items count for nothing; a total with an amount that cannot be converted reads "—". */
function GroupHeading({ label, items }: { label: string; items: RecurringItem[] }) {
 const { locale } = useLanguage();
 const { sum, currency } = useDisplayMoney();
 const counted = items.filter(item => item.status !== 'skipped');
 const total = sum(counted.map(item => ({ amount: item.direction === 'income' ? item.amount : -item.amount, currency: item.record.currency })));
 const shown = counted.length === 0 ? null : total === null ? '—' : formatSignedMoney(total, currency ?? counted[0].record.currency, locale);
 return <li className="transaction-day-heading"><h3>{label}<Count value={items.length}/></h3>{shown && <span className={total !== null && total > 0 ? 'positive' : undefined}>{shown}</span>}</li>;
}

/** The month's incomes and bills in groups the person picks: by day (the default), income or expense, category or status.
 * Payments still open from earlier months stay first in every grouping. */
export function RecurringList({ items, carried, categories, listRef, row }: Props) {
 const { t, locale } = useLanguage();
 const [grouping, setGrouping] = useState<RecurringGrouping>('date');
 const categoryOf = (item: RecurringItem) => customCategory(item.record, categories) ?? t(item.record.kind);
 const label = (key: string) => grouping === 'date' ? formatDate(key, locale) : grouping === 'status' ? t(statusLabels[key as RecurringItem['status']]) : grouping === 'direction' ? t(directionLabels[key as RecurringItem['direction']]) : key;
 const groups = groupRecurring(items, grouping, categoryOf);
 return <section className="panel recurring-list" aria-label={t('Recurring')}>
  {items.length || carried.length ? <>
   <div className="recurring-list-tools"><Segmented label={t('Group by')} options={[{ value: 'date', label: t('Date') }, { value: 'direction', label: t('Type') }, { value: 'category', label: t('Category') }, { value: 'status', label: t('Status') }] as const} value={grouping} onChange={setGrouping}/></div>
   <ul ref={listRef}>
    {carried.length > 0 && <GroupHeading label={t('Open from earlier months')} items={carried}/>}
    {carried.map(item => row(item, true, false))}
    {groups.map(group => <Fragment key={group.key}>
     <GroupHeading label={label(group.key)} items={group.items}/>
     {group.items.map(item => row(item, grouping !== 'date', grouping === 'category'))}
    </Fragment>)}
   </ul>
  </> : <EmptyState icon={<Repeat aria-hidden="true"/>} description={t('Nothing is scheduled this month. Add a monthly or weekly income or expense to see it here.')}/>}
 </section>;
}
