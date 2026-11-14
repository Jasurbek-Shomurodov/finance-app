"use client";
import type { Entry } from '@/lib/finance';
import { useEffect, useState, type ReactNode } from 'react';
import { liabilities } from '@/lib/finance';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TodayButton } from '@/components/presentation-foundation/today-button';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { Count } from '@/components/presentation-foundation/count';
import { Segmented } from '@/components/presentation-foundation/segmented';
import type { RowMenuItem } from '@/components/presentation-foundation/row-menu';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatNumber } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import { monthEnd, shiftMonth } from '@/lib/calendar-days';
import { convertAmount } from '@/lib/market';
import { upcomingPayments, type DueItem, type PlanningData } from '@/lib/planning';
import { archivedSchedules, carriedOverdue, monthOccurrences, onlyDirection, openDueDates, payRequest, recurringSummary, type ArchiveTarget, type RecurringItem } from '@/lib/recurring';
import { comingUp, dayGroups, type DayEntry, type DayGroup } from '@/lib/recurring-days';
import type { Operation } from './account-operation';
import { RecurringList } from './recurring-list';
import { ArchivedFold, OccurrenceRow, ReminderRow } from './recurring-rows';
import { useScheduleDeletion } from './delete-schedule-dialog';
import { useColumnsFit } from '@/hooks/use-columns-fit';
import { AccountOperation, useRecurringDetails } from './recurring-lazy';
import { paymentsFrom } from '@/lib/payment-account';
import { AddRecurringMenu, type RecurringKind } from './add-recurring-menu';
import { RecurringFlowButton } from './recurring-flow-button';
import { RecurringSummary } from './recurring-summary';
import { DayPanel, RecurringCalendar } from './recurring-calendar';
import { ComingUp } from './coming-up';
import { useRecordDue } from './record-due-dialog';

/** The Recurring page's views, switched from tabs beside its title: the month as a list or a calendar, subscriptions and reminders. */
export type RecurringView = 'list' | 'calendar' | 'subscriptions' | 'reminders';
type Save = (action: string, data: unknown) => Promise<void>;
type Props = { data: PlanningData; save: Save; currency: string; /** Preferred currencies a scheduled payment may arrive in. */ currencies?: readonly string[]; rates?: number | Record<string, number>; view: RecurringView; onView: (view: RecurringView) => void; onEdit?: (record: RecurringItem['record']) => void; onAddRecurring?: (kind: RecurringKind) => void;
 /** Archiving moves a schedule out of the month and back. */
 onArchive?: (target: ArchiveTarget, archived: boolean) => Promise<void>;
 /** Moves a schedule to Recently deleted, keeping its recorded payments in history or deleting them too. */
 onDelete?: (target: ArchiveTarget, removeHistory: boolean) => Promise<void> };
type Direction = RecurringItem['direction'];

/** The debt repayments and deposit maturities of the shown month, with any still open from earlier months. Loan installments
 * are already the month's rows (`monthOccurrences`), so they are not repeated here; nothing is read past the month's end. */
export function monthReminders(data: Pick<PlanningData, 'records' | 'occurrences'>, month: string, today: string) {
 const end = monthEnd(month);
 return upcomingPayments(data.records, data.occurrences, today, end > today ? end : today).filter(item => (item.type === 'repayment' || item.type === 'maturity') && (item.date.slice(0, 7) === month || item.overdue));
}

/** Record payment: `pay` opens it for a scheduled income, bill or loan payment and `payDebt` for a debt itself; `dialog` is the form.
 * The dashboard's Record payment arrives as #pay=<schedule>:<date>. The router sets the address after the page first
 * renders, so it is read after every render until one is found; opening clears it, so it opens once. */
function usePay({ data, today, month, setMonth, open, currencies, save }: { data: PlanningData; today: string; month: string; setMonth: (month: string) => void; /** The rows a #pay address may name. */open: RecurringItem[]; currencies: readonly string[]; save: Save }) {
 const [operation, setOperation] = useState<Operation | null>(null);
 const payDebt = (record: Entry, date = today) => setOperation({ action: record.kind === 'Mortgage' ? 'mortgage' : 'repayment', target_id: record.id, date, amount: 0 });
 // A recorded occurrence takes another payment, starting at what is still to come.
 // A loan month is settled by a payment dated in it, so one carried from an earlier month starts on its own due date.
 const pay = (item: RecurringItem) => item.installment ? payDebt(item.record, item.date.slice(0, 7) < today.slice(0, 7) ? item.date : today) : setOperation({ action: 'occurrence', target_id: item.record.id, date: item.date, ...(item.status === 'paid' ? { extra: true, amount: Math.max(Math.ceil(item.amount - (item.recorded ?? item.amount)), 0) } : { amount: item.amount, dues: [...new Set([...openDueDates(data.records, data.occurrences, item.record.id, today), item.date])].sort() }) });
 useEffect(() => {
  const read = () => {
   const request = payRequest(window.location.hash);
   if (!request || !data.records.length) return;
   const item = open.find(entry => entry.record.id === request.recordId && entry.date === request.date);
   const debt = item ? undefined : data.records.find(record => record.id === request.recordId && liabilities.includes(record.kind));
   if (!item && !debt && request.date.slice(0, 7) !== month) { setMonth(request.date.slice(0, 7)); return; }
   window.history.replaceState(null, '', window.location.pathname);
   if (item && item.status !== 'skipped') pay(item); else if (debt) payDebt(debt);
  };
  read();
 });
 const dialog = operation && <AccountOperation operation={operation} records={data.records} activity={paymentsFrom(data.activity, data.debtPayments)} currencies={currencies} save={save} onClose={() => setOperation(null)}/>;
 return { pay, payDebt, dialog };
}

type ReminderActions = { today: string; busy: boolean; onOpen?: (record: Entry) => void; onPay: (record: Entry) => void; onDismiss: (item: DueItem) => void };
/** Debt repayments and deposit maturities as one more group of the list: its heading, then a row each. */
function ReminderGroup({ reminders, ...actions }: { reminders: DueItem[] } & ReminderActions) {
 const { t, locale } = useLanguage();
 return <>
  <li className="transaction-day-heading"><h3>{t('Debt repayments and deposit maturities')}</h3><Count value={reminders.length} label={t('{count} payments', { count: formatNumber(reminders.length, locale, 0) })}/></li>
  {reminders.map(item => <ReminderRow key={item.key} item={item} {...actions}/>)}
 </>;
}

/** Beside the month: the day picked on the calendar with its payments, or else what is coming up after today. */
function RecurringSide({ picked, upcoming, today, busy, recordAll, onClose, onOpen, onDay, onCalendar, onPay, onEdit, reminder }: { picked?: DayGroup; upcoming: DayGroup[]; today: string; busy: boolean; recordAll: ReactNode; onClose: () => void; onOpen: (entry: DayEntry) => void; onDay: (day: string) => void; onCalendar: () => void; onPay: (item: RecurringItem) => void; onEdit?: (record: Entry) => void; reminder: ReminderActions }) {
 const { t } = useLanguage();
 // A payment's ⋯ menu: Record payment as on its list row (a skipped one takes none), a maturity only dismisses its reminder.
 const menu = ({ item, reminder: due, record }: DayEntry): RowMenuItem[] => [
  ...(item && item.status !== 'skipped' ? [{ label: t('Record payment'), onSelect: () => onPay(item) }] : []),
  ...(item && onEdit ? [{ label: t('Edit'), onSelect: () => onEdit(record) }] : []),
  ...(due && due.type !== 'maturity' ? [{ label: t('Record payment'), onSelect: () => reminder.onPay(record) }] : []),
  ...(due?.type === 'maturity' ? [{ label: t('Dismiss reminder'), disabled: busy || due.date > today, onSelect: () => reminder.onDismiss(due) }] : []),
 ];
 return <aside className="recurring-side">{picked
  ? <DayPanel group={picked} today={today} onClose={onClose} onOpen={onOpen} menu={menu}>{picked.date === today && recordAll}</DayPanel>
  : <ComingUp days={upcoming} today={today} onOpen={onOpen} onDay={onDay} onCalendar={onCalendar}/>}</aside>;
}

/** Skipped occurrences and archived schedules, folded at the foot of the page; each only when there are some: an empty fold is just noise. */
function RecurringFolds({ data, busy, onRestoreSkipped, onRestoreArchived }: { data: PlanningData; busy: boolean; onRestoreSkipped: (recordId: string, date: string) => void; onRestoreArchived?: (target: ArchiveTarget) => void }) {
 const { t, locale } = useLanguage();
 const skipped = data.occurrences.filter(o => o.status === 'dismissed' && data.records.some(r => r.id === o.record_id && r.frequency !== 'Once'));
 return <>
  {skipped.length > 0 && <details className="panel tools-panel"><summary>{t('Skipped occurrences')}<Count value={skipped.length}/></summary><ul className="tool-list">{skipped.map(o => <li key={o.id}><span>{data.records.find(r => r.id === o.record_id)?.name} · {formatDate(o.due_on, locale)}{o.notes && <> · {o.notes}</>}</span><Button size="sm" disabled={busy} variant="outline" onClick={() => onRestoreSkipped(o.record_id, o.due_on)}>{t('Restore occurrence')}</Button></li>)}</ul></details>}
  {onRestoreArchived && <ArchivedFold records={archivedSchedules(data.records)} busy={busy} onRestore={onRestoreArchived}/>}
 </>;
}

/** The month's incomes and bills, as a list or a calendar, with what came in and went out, and what is coming up beside it. */
export function UpcomingPage({ data, save, currency, currencies = [], rates, view, onView, onEdit, onAddRecurring, onArchive, onDelete }: Props) {
 const { t } = useLanguage(), today = depositToday();
 const [error, setError] = useState(''), [busy, setBusy] = useState(false);
 const [month, setMonth] = useState(today.slice(0, 7));
 // The calendar opens on today's payments; picking a day shows that day's instead, closing it brings Coming up back.
 const [day, setDay] = useState<string | null>(today);
 const items = monthOccurrences(data.records, data.occurrences, month, today, data.debtPayments);
 // Payments left open in earlier months stay at the top of every month shown until they are recorded (0 counts) or skipped, so none is forgotten. They are not that month's totals.
 const carried = carriedOverdue(data.records, data.occurrences, month, today, data.debtPayments);
 const convert = (amount: number, unit: string) => convertAmount(amount, unit, currency, rates);
 // Tapping Income or Bills narrows the list and calendar to that side.
 const [only, setOnly] = useState<Direction | null>(null);
 const { shown, shownCarried } = onlyDirection(items, carried, only);
 const reminders = monthReminders(data, month, today);
 async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
 const paying = usePay({ data, today, month, setMonth, open: [...carried, ...items], currencies, save });
 // Tapping a row shows its history and totals; Edit is in its ⋯ menu and Record payment on the row.
 const details = useRecurringDetails(data, today);
 const archive = onArchive && ((target: ArchiveTarget, archived = true) => run(() => onArchive(target, archived)));
 const deletion = useScheduleDeletion(data, onDelete);
 const recordDue = useRecordDue(data, shown, today, save);
 // Rows stay on one line while their name keeps room beside status, amount and actions; two lines only when this month's content needs it.
 const rows = useColumnsFit<HTMLUListElement>('.recurring-row');
 const skip = (recordId: string, date: string, skipped = true) => run(() => save('exception', { target_id: recordId, date, skip: skipped }));
 const row = (item: RecurringItem, dated = false, grouped = false) => <OccurrenceRow key={item.key} item={item} dated={dated} grouped={grouped} today={today} busy={busy} categories={data.categories} onEdit={onEdit} onOpen={details.open} onPay={paying.pay} onSkip={item => skip(item.record.id, item.date)} onRestore={item => skip(item.record.id, item.date, false)} onArchive={archive && (() => archive({ source: 'record', record: item.record }))} onDelete={deletion.open}/>;
 const reminder: ReminderActions = { today, busy, onOpen: onEdit, onPay: record => paying.payDebt(record), onDismiss: item => run(() => save('dismiss', { id: crypto.randomUUID(), target_id: item.record.id, date: item.date })) };
 // Only when a debt payment or deposit maturity is due this month; an empty group is just noise.
 const reminderGroup = reminders.length > 0 && <ReminderGroup reminders={reminders} {...reminder}/>;
 const days = dayGroups(shown, reminders, month + '-01', monthEnd(month));
 const showDay = (date: string) => { setMonth(date.slice(0, 7)); setDay(date); onView('calendar'); };
 const scheduled = view === 'list' || view === 'calendar';
 return <>
  <PageHeader title={t('Recurring')} tabs={<Segmented className="page-tabs" as="nav" label={t('Recurring view')} options={[{ value: 'list', label: t('List') }, { value: 'calendar', label: t('Calendar') }, { value: 'subscriptions', label: t('Subscriptions') }, { value: 'reminders', label: t('Reminders') }] as const} value={view} onChange={onView}/>} hint={<><p>{t('Every scheduled income and bill, month by month. Record a payment only after it happens; a reminder never moves money.')}</p><p>{t('Debt amounts show the outstanding balance; enter the actual principal and interest when paying.')}</p></>}>
   {scheduled && <div className="budget-month-nav">
    <Button variant="outline" size="icon" aria-label={t('Previous month')} onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16}/></Button>
    <Button variant="outline" size="icon" aria-label={t('Next month')} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16}/></Button>
    <TodayButton current={month === today.slice(0, 7)} onClick={() => setMonth(today.slice(0, 7))}/>
   </div>}
   {onAddRecurring && <AddRecurringMenu onAdd={onAddRecurring}/>}
  </PageHeader>
  <ErrorPopup message={error}/>
  {scheduled && <>
   <RecurringSummary month={month} summary={recurringSummary(items, convert)} currency={currency} only={only} onToggle={direction => setOnly(only === direction ? null : direction)} dueToday={items.filter(item => item.date === today && item.status === 'due').length}>
    <RecurringFlowButton items={items} month={month} currency={currency} convert={convert}/>
   </RecurringSummary>
   <div className="recurring-layout">
    <div className="recurring-main">
     {view === 'list' ? <RecurringList items={shown} carried={shownCarried} categories={data.categories} listRef={rows} today={today} row={row} dayAction={recordDue.button}>{reminderGroup}</RecurringList> : <>
      <RecurringCalendar month={month} days={days} today={today} selected={day} onSelect={setDay}/>
      {reminderGroup && <section className="panel recurring-list" aria-label={t('Debt repayments and deposit maturities')}><ul ref={rows}>{reminderGroup}</ul></section>}
     </>}
    </div>
    <RecurringSide picked={view === 'calendar' ? days.find(group => group.date === day) : undefined} upcoming={comingUp(data, today)} today={today} busy={busy} recordAll={recordDue.button} onClose={() => setDay(null)} onOpen={entry => entry.item ? details.open(entry.item) : onEdit?.(entry.record)} onDay={showDay} onCalendar={() => onView('calendar')} onPay={paying.pay} onEdit={onEdit} reminder={reminder}/>
   </div>
   <RecurringFolds data={data} busy={busy} onRestoreSkipped={(recordId, date) => skip(recordId, date, false)} onRestoreArchived={archive && (target => archive(target, false))}/>
  </>}
  {details.dialog}
  {deletion.dialog}
  {recordDue.dialog}
  {paying.dialog}
 </>;
}
