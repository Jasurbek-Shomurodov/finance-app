"use client";
import { Fragment, useState, type ReactNode, type Ref } from 'react';
import { Repeat } from 'lucide-react';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { Count } from '@/components/presentation-foundation/count';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { formatDate, formatMoney, formatNumber, formatSignedMoney } from '@/lib/format';
import type { Category } from '@/lib/planning';
import { groupRecurring, type RecurringGrouping, type RecurringItem } from '@/lib/recurring';
import { customCategory, useDueLabel } from './recurring-rows';

const statusLabels: Record<RecurringItem['status'], string> = { overdue: 'Overdue', due: 'Upcoming', paid: 'Paid', skipped: 'Skipped' };
const directionLabels: Record<RecurringItem['direction'], string> = { income: 'Income', expense: 'Expenses' };
/** Inside a day, money in reads "Income" and money out "Bills". */
const sides = [['income', 'Income'], ['expense', 'Bills']] as const;

type Props = { items: RecurringItem[]; carried: RecurringItem[]; categories: readonly Category[]; listRef: Ref<HTMLUListElement>; /** Today's group names itself "Today" and carries `dayAction`. */today?: string;
 /** Renders one row; `dated` adds its day under the name when the group heading does not say it, `byCategory` drops the category it does say. */
 row: (item: RecurringItem, dated: boolean, byCategory: boolean) => ReactNode;
 /** One action for everything due today, shown in today's heading. */
 dayAction?: ReactNode;
 /** More groups after the month's own, such as debt repayments: list items. */
 children?: ReactNode };

/** A group heading: its name, how many items as a pill with its own spoken label (never run into the name), and their
 * scheduled total in the display currency, income in and bills out. Skipped items count for nothing; a total with an
 * amount that cannot be converted reads "—". `sub` is the smaller Income or Bills line inside a day. */
function GroupHeading({ label, items, sub = false, children }: { label: string; items: RecurringItem[]; sub?: boolean; children?: ReactNode }) {
 const { t, locale } = useLanguage();
 const { sum, currency } = useDisplayMoney();
 const counted = items.filter(item => item.status !== 'skipped');
 const total = sum(counted.map(item => ({ amount: item.direction === 'income' ? item.amount : -item.amount, currency: item.record.currency })));
 // A day's net carries its sign; Income and Bills inside it read as plain amounts, income with its plus.
 const figure = (value: number, unit: string) => sub && value < 0 ? formatMoney(-value, unit, locale) : formatSignedMoney(value, unit, locale);
 const shown = counted.length === 0 ? null : total === null ? '—' : figure(total, currency ?? counted[0].record.currency);
 const Title = sub ? 'h4' : 'h3';
 return <li className={sub ? 'transaction-day-heading recurring-subgroup' : 'transaction-day-heading'}>
  <Title>{label}</Title><Count value={items.length} label={t('{count} payments', { count: formatNumber(items.length, locale, 0) })}/>
  {shown && <span className={total !== null && total > 0 ? 'recurring-group-total positive' : 'recurring-group-total'}><RollingText text={shown}/></span>}
  {children}
 </li>;
}

/** The month's incomes and bills in groups the person picks: by day (the default), income or expense, category or status.
 * A day with both money in and bills splits into Income and Bills, each with its count and total. Payments still open from
 * earlier months stay first in every grouping. */
export function RecurringList({ items, carried, categories, listRef, today, row, dayAction, children }: Props) {
 const { t, locale } = useLanguage();
 const dueLabel = useDueLabel();
 const [grouping, setGrouping] = useState<RecurringGrouping>('date');
 const categoryOf = (item: RecurringItem) => customCategory(item.record, categories) ?? t(item.record.kind);
 const day = (key: string) => today ? dueLabel(today, key) + ' · ' + formatDate(key, locale) : formatDate(key, locale);
 const label = (key: string) => grouping === 'date' ? day(key) : grouping === 'status' ? t(statusLabels[key as RecurringItem['status']]) : grouping === 'direction' ? t(directionLabels[key as RecurringItem['direction']]) : key;
 const groups = groupRecurring(items, grouping, categoryOf);
 const rows = (group: RecurringItem[]) => group.map(item => row(item, grouping !== 'date', grouping === 'category'));
 // A day holding only bills (or only income) would repeat its own heading's count and total.
 const split = (group: RecurringItem[]) => grouping === 'date' && sides.every(([side]) => group.some(item => item.direction === side));
 return <section className="panel recurring-list" aria-label={t('Recurring')}>
  {items.length || carried.length || children ? <>
   <div className="recurring-list-tools"><Segmented label={t('Group by')} options={[{ value: 'date', label: t('Date') }, { value: 'direction', label: t('Type') }, { value: 'category', label: t('Category') }, { value: 'status', label: t('Status') }] as const} value={grouping} onChange={setGrouping}/></div>
   <ul ref={listRef}>
    {carried.length > 0 && <GroupHeading label={t('Open from earlier months')} items={carried}/>}
    {carried.map(item => row(item, true, false))}
    {groups.map(group => <Fragment key={group.key}>
     <GroupHeading label={label(group.key)} items={group.items}>{grouping === 'date' && group.key === today && dayAction}</GroupHeading>
     {split(group.items) ? sides.map(([side, name]) => { const part = group.items.filter(item => item.direction === side); return <Fragment key={side}><GroupHeading sub label={t(name)} items={part}/>{rows(part)}</Fragment>; }) : rows(group.items)}
    </Fragment>)}
    {children}
   </ul>
  </> : <EmptyState icon={<Repeat aria-hidden="true"/>} description={t('Nothing is scheduled this month. Add a monthly or weekly income or expense to see it here.')}/>}
 </section>;
}
