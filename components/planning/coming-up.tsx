"use client";
import { CalendarClock } from 'lucide-react';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { formatDate, formatMoney, formatMonthShort, formatNumber, formatSignedMoney } from '@/lib/format';
import { signedAmounts, type DayEntry, type DayGroup } from '@/lib/recurring-days';
import { useDueLabel } from './recurring-rows';

/** What is due after today, day by day, each under a date tile: incomes, bills, loan payments, debt repayments and deposit
 * maturities. A day with one payment names it, as entered, and opens it; a day with several gives their count and net
 * total in the display currency and opens that day on the calendar. */
export function ComingUp({ days, today, onOpen, onDay, onCalendar }: { days: readonly DayGroup[]; today: string; onOpen: (entry: DayEntry) => void; onDay: (day: string) => void; onCalendar: () => void }) {
 const { t, locale } = useLanguage();
 const { sum, currency } = useDisplayMoney();
 const dueLabel = useDueLabel();
 const net = (entries: readonly DayEntry[]) => { const total = sum(signedAmounts(entries)); return { text: total === null ? '—' : formatSignedMoney(total, currency ?? entries[0].record.currency, locale), positive: total !== null && total > 0 }; };
 const row = ({ date, entries }: DayGroup) => {
  const [only] = entries, single = entries.length === 1;
  const amount = single ? { text: formatMoney(only.amount, only.record.currency, locale), positive: only.tone === 'income' } : net(entries);
  return <li key={date}><button type="button" className="recurring-coming-row" onClick={() => single ? onOpen(only) : onDay(date)}>
   <span className="recurring-date-tile" aria-hidden="true"><b>{formatNumber(Number(date.slice(8)), locale, 0)}</b><small>{formatMonthShort(date, locale)}</small></span>
   <span className="recurring-coming-text"><strong>{single ? only.record.name : t('{count} payments', { count: formatNumber(entries.length, locale, 0) })}</strong>
    <small><span className="sr-only">{formatDate(date, locale)} · </span>{[dueLabel(today, date), single ? t(only.record.kind) : null].filter(Boolean).join(' · ')}</small></span>
   <strong className={amount.positive ? 'transaction-amount positive' : 'transaction-amount'}>{amount.text}</strong>
  </button></li>;
 };
 return <section className="panel recurring-coming" aria-label={t('Coming up')}>
  <PanelTitle title={t('Coming up')}><Button variant="link" onClick={onCalendar}>{t('Calendar')}</Button></PanelTitle>
  {days.length ? <ul>{days.map(row)}</ul> : <EmptyState icon={<CalendarClock aria-hidden="true"/>} description={t('No payments due in the next 31 days.')}/>}
 </section>;
}
