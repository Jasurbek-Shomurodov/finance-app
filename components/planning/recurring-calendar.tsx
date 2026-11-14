"use client";
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RowMenu, type RowMenuItem } from '@/components/presentation-foundation/row-menu';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { formatDate, formatMoney, formatNumber, formatSignedMoney, weekdayLabels } from '@/lib/format';
import { calendarWeeks } from '@/lib/recurring';
import { ofTone, type DayEntry, type DayGroup, type DayTone } from '@/lib/recurring-days';

const tones: readonly DayTone[] = ['income', 'bill', 'debt'];
export const toneLabels: Record<DayTone, string> = { income: 'Income', bill: 'Bills', debt: 'Debt payments' };

/** A day's total for one tone: one payment reads as it was entered, several are added in the display currency (— when one
 * cannot be converted). Money in carries its plus. */
function useToneTotal() {
 const { locale } = useLanguage();
 const { sum, currency } = useDisplayMoney();
 return (entries: readonly DayEntry[], tone: DayTone) => {
  const format = tone === 'income' ? formatSignedMoney : formatMoney;
  if (entries.length === 1) return format(entries[0].amount, entries[0].record.currency, locale);
  const total = sum(entries.map(entry => ({ amount: entry.amount, currency: entry.record.currency })));
  return total === null ? '—' : format(total, currency ?? entries[0].record.currency, locale);
 };
}
/** Settled once everything is; overdue as soon as one payment is. */
const chipStatus = (entries: readonly DayEntry[]) => entries.every(entry => entry.status === 'paid') ? 'paid' : entries.some(entry => entry.status === 'overdue') ? 'overdue' : 'due';

/** The month as a Monday-first grid. A day carries one chip for its income, one for its bills and one, in caution, for
 * its debt payments, with how many payments they add up; pressing the day opens its list beside the month. */
export function RecurringCalendar({ month, days, today, selected, onSelect }: { month: string; days: readonly DayGroup[]; today: string; selected: string | null; onSelect: (day: string) => void }) {
 const { t, locale } = useLanguage();
 const total = useToneTotal();
 const byDay = new Map(days.map(group => [group.date, group.entries]));
 const cell = (day: string) => {
  const entries = byDay.get(day), date = <span className="recurring-calendar-date">{formatNumber(Number(day.slice(8)), locale, 0)}</span>;
  if (!entries) return date;
  const count = t('{count} payments', { count: formatNumber(entries.length, locale, 0) });
  return <button type="button" className="recurring-calendar-open" aria-pressed={selected === day} aria-label={formatDate(day, locale) + ' · ' + count} onClick={() => onSelect(day)}>
   {date}
   {tones.map(tone => { const part = ofTone(entries, tone); return part.length > 0 && <span key={tone} className="recurring-chip" data-tone={tone} data-status={chipStatus(part)}>{total(part, tone)}</span>; })}
   <small className="recurring-calendar-more">{entries.length === 1 ? entries[0].record.name : count}</small>
  </button>;
 };
 return <section className="panel recurring-calendar" aria-label={t('Calendar')}>
  <div className="recurring-calendar-grid" role="grid">
   <div role="row" className="recurring-calendar-week">{weekdayLabels(locale).map(day => <span role="columnheader" key={day}>{day}</span>)}</div>
   {calendarWeeks(month).map((week, index) => <div role="row" className="recurring-calendar-week" key={index}>{week.map((day, position) => <div role="gridcell" key={day ?? 'empty' + position} className="recurring-calendar-day" data-empty={!day || undefined} data-today={day === today || undefined} data-selected={(day && day === selected) || undefined}>
    {day && cell(day)}
   </div>)}</div>)}
  </div>
  <ul className="recurring-calendar-legend">{tones.map(tone => <li key={tone} data-tone={tone}>{t(toneLabels[tone])}</li>)}</ul>
 </section>;
}

/** The day picked on the calendar, beside the month: what comes in and goes out that day, then each payment as it was
 * entered. A payment's name opens it; recording it is in its ⋯ menu, and `children` holds an action for the whole day. */
export function DayPanel({ group, today, onClose, onOpen, menu, children }: { group: DayGroup; today: string; onClose: () => void; onOpen: (entry: DayEntry) => void; menu: (entry: DayEntry) => RowMenuItem[]; children?: ReactNode }) {
 const { t, locale } = useLanguage();
 const total = useToneTotal();
 return <section className="panel recurring-day" aria-label={formatDate(group.date, locale)}>
  <PanelTitle title={formatDate(group.date, locale)} count={group.date === today && <span className="status-badge is-paid">{t('Today')}</span>}>
   <Button variant="ghost" size="icon" aria-label={t('Close')} onClick={onClose}><X size={16} aria-hidden="true"/></Button>
  </PanelTitle>
  <dl className="recurring-day-totals">{tones.map(tone => { const part = ofTone(group.entries, tone); return part.length > 0 && <div key={tone}><dt>{t(toneLabels[tone])}</dt><dd className={tone === 'income' ? 'positive' : undefined}>{total(part, tone)}</dd></div>; })}</dl>
  <ul className="recurring-day-list">{group.entries.map(entry => <li key={entry.key} data-status={entry.status}>
   <CategoryIcon kind={entry.record.kind}/>
   <button type="button" className="recurring-edit" onClick={() => onOpen(entry)}>{entry.record.name}</button>
   <strong className={entry.tone === 'income' ? 'positive' : undefined}>{formatMoney(entry.amount, entry.record.currency, locale)}</strong>
   <RowMenu label={t('Actions for {name}', { name: entry.record.name })} items={menu(entry)}/>
  </li>)}</ul>
  {children}
 </section>;
}
