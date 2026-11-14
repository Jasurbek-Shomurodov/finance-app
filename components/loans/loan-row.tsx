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

/** The line under the name: the kind, the rate, when it was lent, and the due date, marked when it is near or past. */
function LoanFacts({ record, today }: { record: Entry; today: string }) {
 const { t, locale } = useLanguage();
 const owed = liabilities.includes(record.kind);
 const daysLeft = record.date && record.amount > 0 ? daysBetween(today, record.date) : null;
 const due = record.date ? t('Due: {date}', { date: formatDate(record.date, locale) }) : owed ? null : t('No due date');
 const soon = daysLeft !== null && daysLeft >= 0 && daysLeft <= dueSoonDays;
 const overdue = daysLeft !== null && daysLeft < 0;
 const when = !soon ? null : daysLeft === 0 ? t('Today') : daysLeft === 1 ? t('Tomorrow') : t('in {count} days', { count: formatNumber(daysLeft!, locale, 0) });
 const facts = [t(record.kind), record.rate > 0 && formatPercent(record.rate, locale, 2), !owed && record.lent_date && t('Lent: {date}', { date: formatDate(record.lent_date, locale) })].filter(Boolean);
 return <small>{facts.join(' · ')}{due && <>{' · '}<span className={overdue ? 'negative' : soon ? 'caution' : undefined}>{overdue ? `${t('Overdue')} · ${due}` : due}{when && ` · ${when}`}</span></>}</small>;
}

/** One loan, debt, mortgage or loan to someone: icon, name and a line of facts, how far it is paid off, and what is left. */
export function LoanRow({ record, name, balance, today, progress, onOpen, onPay, payBlocked, menu }: Props) {
 const { t, locale } = useLanguage();
 const { entered } = useDisplayMoney();
 const owed = liabilities.includes(record.kind);
 const percent = progress && formatPercent(progress.share, locale, 0);
 const open = (event: MouseEvent<HTMLLIElement>) => { const target = event.target as HTMLElement; /* Menu items are portaled out of the row, but React still bubbles their clicks here. */ if (event.currentTarget.contains(target) && !target.closest('button,a,input')) onOpen(); };
 const openWithKey = (event: KeyboardEvent<HTMLLIElement>) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); } };
 return <li className="loan-row" tabIndex={0} aria-label={t('Open {name}', { name })} onClick={open} onKeyDown={openWithKey}>
  <div className="loan-row-name"><RecordIcon record={record}/><div>
   <strong>{name}</strong>
   <LoanFacts record={record} today={today}/>
  </div></div>
  <div className="loan-row-progress">{progress && <>
   <span className="progress-track" data-tone={owed ? 'debt' : undefined} role="img" aria-label={`${t('Paid off')}: ${percent}`}><span style={{ width: `${progress.share}%` }}/></span>
   <small>{owed ? <><b>{entered(progress.paid, record.currency)}</b>{' · '}{t('{percent} of {amount}', { percent: percent!, amount: entered(progress.total, record.currency) })}</> : <b>{t('{percent} repaid', { percent: percent! })}</b>}</small>
  </>}</div>
  <div className="loan-row-amount"><strong>{balance}</strong>{owed && (record.estimated_monthly_payment ?? 0) > 0 && <small>{t('{amount} per month', { amount: entered(record.estimated_monthly_payment!, record.currency) })}</small>}</div>
  <div className="row-actions">
   {onPay && <Button size="icon-sm" variant="outline" className="loan-row-pay" aria-label={`${t('Record payment')}: ${name}`} title={payBlocked ?? t('Record payment')} aria-disabled={payBlocked ? true : undefined} onClick={() => { if (!payBlocked) onPay(); }}><Check size={16} aria-hidden="true"/></Button>}
   <RowMenu label={t('Actions for {name}', { name })} items={menu}/>
  </div>
 </li>;
}
