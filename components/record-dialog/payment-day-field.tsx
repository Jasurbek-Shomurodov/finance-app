"use client";
import { MonthDayField } from '@/components/presentation-foundation/month-day-field';
import { addMonths } from '@/lib/calendar-days';
import { depositToday as today } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
import { installmentAnchor } from '@/lib/planning';

/** The day of the month a loan's payments fall on. It is the start date's day, else the day the record was added, so a loan
 * saved without a start date still shows (and can change) its day. Choosing a day sets the start date to that day of the
 * same month, or of the month before when that day is still ahead. */
export function PaymentDayField({ record, onChange }: { record: Entry & { created_at?: string | null }; onChange: (date: string) => void }) {
 const anchor = record.opened_on || installmentAnchor(record) || today();
 if (!(Number(record.estimated_monthly_payment ?? 0) > 0)) return null;
 return <MonthDayField date={anchor} onChange={date => onChange(date > today() ? addMonths(date, -1) : date)}/>;
}
