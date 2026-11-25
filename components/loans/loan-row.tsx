"use client";
import type { KeyboardEvent, MouseEvent } from 'react';
import { Check } from 'lucide-react';
import { useDisplayMoney } from '@/components/display-money';
import { useLanguage } from '@/components/language-provider';
import { RecordIcon } from '@/components/presentation-foundation/record-icon';
import { RowMenu, type RowMenuItem } from '@/components/presentation-foundation/row-menu';
import { Button } from '@/components/ui/button';
import { daysBetween } from '@/lib/calendar-days';
import type { debtProgress } from '@/lib/debt-plan';
import { liabilities, type Entry } from '@/lib/finance';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';

/** A due date within this many days is marked, so the next thing to pay stands out. */
const dueSoonDays = 14;

type Props = {
 /** The record as stored: its dates, its rate and its monthly payment read as they were entered. */
 record: Entry; name: string;
 /** The balance in the display currency. */
 balance: string; today: string;
 progress: ReturnType<typeof debtProgress>;
 onOpen: () => void;
 /** Record payment, the row's one visible action; `payBlocked` says why it cannot be used. */
 onPay?: () => void; payBlocked?: string;
 menu: readonly (RowMenuItem | false | null | undefined)[];
};

/** The loans table's columns, in order; the row and its heading both read them. */
export const loanColumns = ['Name', 'Rate', 'Start date', 'Due date', 'Paid off', 'Monthly payment', 'Balance'] as const;

/** A cell with nothing to say shows a dash on a wide screen; on a phone card it is left out (`data-empty`). */
const Dash = () => <span className="muted" aria-hidden="true">—</span>;

/** The due date, marked when it is near (with the days left) or past. Money lent without one says so. */
function DueCell({ record, today, label }: { record: Entry; today: string; label: string }) {
 const { t, locale } = useLanguage();
 const owed = liabilities.includes(record.kind);
 if (!record.date) return <td data-label={label} data-empty={owed ? true : undefined}>{owed ? <Dash/> : <span className="muted">{t('No due date')}</span>}</td>;
 const daysLeft = record.amount > 0 ? daysBetween(today, record.date) : null;
 const soon = daysLeft !== null && daysLeft >= 0 && daysLeft <= dueSoonDays;
 const overdue = daysLeft !== null && daysLeft < 0;
 const when = overdue ? t('Overdue') : !soon ? null : daysLeft === 0 ? t('Today') : daysLeft === 1 ? t('Tomorrow') : t('in {count} days', { count: formatNumber(daysLeft!, locale, 0) });
 const tone = overdue ? 'negative' : soon ? 'caution' : undefined;
 return <td data-label={label} className="loan-due"><span className={tone}>{formatDate(record.date, locale)}</span>{when && <small className={tone}>{when}</small>}</td>;
}

/** One loan, debt, mortgage or loan to someone as a table row: name and kind, rate, start and due dates, how far it is
 * paid off, the monthly payment as entered, and what is left in the display currency. The row opens the record. */
export function LoanRow({ record, name, balance, today, progress, onOpen, onPay, payBlocked, menu }: Props) {
 const { t, locale } = useLanguage();
 const { entered } = useDisplayMoney();
 const owed = liabilities.includes(record.kind);
 const percent = progress && formatPercent(progress.share, locale, 0);
 const started = owed ? record.opened_on : record.lent_date;
 const monthly = owed && (record.estimated_monthly_payment ?? 0) > 0 ? entered(record.estimated_monthly_payment!, record.currency) : null;
 const label = (column: typeof loanColumns[number]) => t(column);
 const open = (event: MouseEvent<HTMLTableRowElement>) => { const target = event.target as HTMLElement; /* Menu items are portaled out of the row, but React still bubbles their clicks here. */ if (event.currentTarget.contains(target) && !target.closest('button,a,input')) onOpen(); };
 const openWithKey = (event: KeyboardEvent<HTMLTableRowElement>) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); } };
 return <tr className="loan-row" tabIndex={0} aria-label={t('Open {name}', { name })} onClick={open} onKeyDown={openWithKey}>
  <td><div className="record-name"><RecordIcon record={record}/><div><strong>{name}</strong><small>{t(record.kind)}</small></div></div></td>
  <td data-label={label('Rate')} data-empty={record.rate > 0 ? undefined : true}>{record.rate > 0 ? formatPercent(record.rate, locale, 2) : <Dash/>}</td>
  <td data-label={label('Start date')} data-empty={started ? undefined : true}>{started ? formatDate(started, locale) : <Dash/>}</td>
  <DueCell record={record} today={today} label={label('Due date')}/>
  <td data-label={label('Paid off')} data-empty={progress ? undefined : true} className="loan-progress">{progress ? <>
   <span className="progress-track" data-tone={owed ? 'debt' : undefined} role="img" aria-label={`${t('Paid off')}: ${percent}`}><span style={{ width: `${progress.share}%` }}/></span>
   <small>{owed ? <><b>{entered(progress.paid, record.currency)}</b>{' · '}{t('{percent} of {amount}', { percent: percent!, amount: entered(progress.total, record.currency) })}</> : <b>{t('{percent} repaid', { percent: percent! })}</b>}</small>
  </> : <Dash/>}</td>
  <td data-label={label('Monthly payment')} data-empty={monthly ? undefined : true} className="num">{monthly ?? <Dash/>}</td>
  <td className="num loan-balance"><strong>{balance}</strong></td>
  <td><div className="row-actions">
   {onPay && <Button size="icon-sm" variant="outline" className="loan-row-pay" aria-label={`${t('Record payment')}: ${name}`} title={payBlocked ?? t('Record payment')} aria-disabled={payBlocked ? true : undefined} onClick={() => { if (!payBlocked) onPay(); }}><Check size={16} aria-hidden="true"/></Button>}
   <RowMenu label={t('Actions for {name}', { name })} items={menu}/>
  </div></td>
 </tr>;
}
