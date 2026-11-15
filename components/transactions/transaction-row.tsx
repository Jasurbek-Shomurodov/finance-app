"use client";
import type { ReactNode } from 'react';
import { Repeat } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { shiftDay } from '@/lib/calendar-days';
import { income, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatSignedMoney } from '@/lib/format';
import { isMortgagePayment, spendingAmount, transferAmount } from '@/lib/spending';
import { signedAmount } from '@/lib/transaction-list';

/** What a screen reader hears for a row: the action, then its amount (`shown`, the display-currency figure the row shows) and category. */
export const transactionRowLabel = (action: string, record: Entry, category: string, locale: string, shown?: string) => [action, shown ?? formatSignedMoney(signedAmount(record), record.currency, locale), category].join(' · ');

/** The ledger's one heading row: the columns every row below lines up under. Phones stack a row, so it hides there. */
export function TransactionColumns({ selecting }: { selecting?: boolean }) {
 const { t } = useLanguage();
 return <div className="transaction-columns-heading" data-selecting={selecting || undefined} aria-hidden="true"><span>{t('Payee')}</span><span>{t('Category')}</span><span>{t('Account')}</span><span>{t('Amount')}</span></div>;
}

/** One day: its date in the heading, its transactions below. The day's net total shows only when the day has two or more
 * rows (`count`, the whole day's, also across pages); with one row the total would repeat that row's amount. A day with
 * mortgage payments says how much went to principal, which the total leaves out while the rows show whole payments. */
export function DayGroup({ date, total, principal, count, currency, today, children }: { date: string; total: number | null; /** Mortgage principal paid that day, in the display currency. */ principal?: number | null; count: number; currency: string; today: string; children: ReactNode }) {
 const { t, locale } = useLanguage();
 const yesterday = shiftDay(today, -1);
 const label = date === today ? t('Today') : date === yesterday ? t('Yesterday') : formatDate(date, locale);
 return <section className="transaction-day" aria-label={label}>
  <div className="transaction-day-heading"><h3>{label}</h3>{count > 1 && <span className={total !== null && total > 0 ? 'positive' : undefined}>{total === null ? '—' : <RollingText text={formatSignedMoney(total, currency, locale)}/>}{!!principal && <> · {t('{amount} to principal', { amount: formatMoney(principal, currency, locale) })}</>}</span>}</div>
  <ul>{children}</ul>
 </section>;
}

/** Marks a row that paid a schedule (its `occurrence_record_id`, the one link of every scheduled payment). */
export function RecurringChip({ record }: { record: Pick<Entry, 'occurrence_record_id'> }) {
 const { t } = useLanguage();
 if (!record.occurrence_record_id) return null;
 return <span className="transaction-chip"><Repeat size={12} aria-hidden="true"/>{t('Recurring')}</span>;
}

/** A mortgage payment's split: the principal is a transfer to the debt, the interest is spending. */
export function MortgageSplit({ record }: { record: Entry }) {
 const { t } = useLanguage();
 const { entered } = useDisplayMoney();
 if (!isMortgagePayment(record)) return null;
 return <small>{t('Mortgage payment · Principal: {principal} · Interest: {interest}', { principal: entered(transferAmount(record), record.currency), interest: entered(spendingAmount(record), record.currency) })}</small>;
}

/** The row's signed amount as it was entered: income with a plus, spending with a minus. A mortgage payment shows the whole
 * payment; `MortgageSplit` under it says how much was interest (spending) and principal (a transfer, `lib/spending.ts`). */
export function TransactionAmount({ record }: { record: Entry }) {
 const { enteredSigned } = useDisplayMoney();
 const incoming = income.includes(record.kind);
 return <strong className={incoming ? 'transaction-amount positive' : 'transaction-amount'}>{enteredSigned(signedAmount(record), record.currency)}</strong>;
}
