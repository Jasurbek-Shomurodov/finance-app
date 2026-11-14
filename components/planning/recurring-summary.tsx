"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { formatMoney, formatMonthYear, formatNumber, formatSignedMoney } from '@/lib/format';
import type { RecurringItem, recurringSummary } from '@/lib/recurring';

type Direction = RecurringItem['direction'];
type Side = ReturnType<typeof recurringSummary>['income'];

/** One side of the month as a tile: its total, how much of it already came in (or went out) as a bar, and what is still
 * to come. Tapping it shows only that side in the list and calendar; tapping again shows everything.
 * `missing` counts amounts of this side no rate converts: its figures then read —, never a smaller total. */
function SummaryTile({ label, side, doneLabel, currency, tone, pressed, onPress }: { label: string; side: Side; doneLabel: string; currency: string; tone: Direction; pressed: boolean; onPress: () => void }) {
 const { t, locale } = useLanguage();
 const total = side.done + side.remaining, money = (amount: number) => side.missing ? '—' : formatMoney(amount, currency, locale);
 const figure = side.missing ? '—' : tone === 'income' ? formatSignedMoney(total, currency, locale) : formatMoney(total, currency, locale);
 return <button type="button" className="recurring-bar" data-tone={tone} aria-pressed={pressed} onClick={onPress}>
  <span className="recurring-bar-label">{label}</span>
  <strong className={tone === 'income' && total > 0 && !side.missing ? 'positive' : undefined}><RollingText text={figure}/></strong>
  <span className="progress-track"><span style={{ width: `${total > 0 && !side.missing ? side.done / total * 100 : 0}%` }}/></span>
  <small>{t(doneLabel, { amount: money(side.done) })} · {t('{amount} remaining', { amount: money(side.remaining) })}</small>
 </button>;
}

/** The month's name with its tools, then three tiles: income, bills, and what the bills leave of the income, with how many
 * payments are due today. */
export function RecurringSummary({ month, summary, currency, only, onToggle, dueToday, children }: { month: string; summary: ReturnType<typeof recurringSummary>; currency: string; only: Direction | null; onToggle: (direction: Direction) => void; /** Open payments dated today in the shown month. */dueToday: number; /** Tools beside the month's name. */children?: ReactNode }) {
 const { t, locale } = useLanguage();
 const left = summary.income.done + summary.income.remaining - summary.expense.done - summary.expense.remaining;
 return <section className="recurring-summary" aria-label={formatMonthYear(month, locale)}>
  <div className="recurring-summary-head"><h2>{formatMonthYear(month, locale)}</h2>{children}</div>
  <SummaryTile label={t('Income')} side={summary.income} doneLabel="{amount} received" currency={currency} tone="income" pressed={only === 'income'} onPress={() => onToggle('income')}/>
  <SummaryTile label={t('Bills')} side={summary.expense} doneLabel="{amount} paid" currency={currency} tone="expense" pressed={only === 'expense'} onPress={() => onToggle('expense')}/>
  <article className="recurring-left">
   <h3>{t('Left after bills')}</h3>
   <strong><RollingText text={summary.missing ? '—' : formatMoney(left, currency, locale)}/></strong>
   {dueToday > 0 && <span className="status-badge is-caution">{t('{count} due today', { count: formatNumber(dueToday, locale, 0) })}</span>}
  </article>
  {summary.missing > 0 && <p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
 </section>;
}
