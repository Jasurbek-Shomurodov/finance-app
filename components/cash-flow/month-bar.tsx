"use client";
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { TodayButton } from '@/components/presentation-foundation/today-button';
import { Button } from '@/components/ui/button';
import { shiftMonth } from '@/lib/calendar-days';
import type { MonthOutlook } from '@/lib/cash-flow-outlook';
import { depositToday } from '@/lib/deposit-interest';
import { formatMoney } from '@/lib/format';

/** The month Cash flow shows, at the page's start: step a month back or forward, pick any month, or return to today.
 * In the running month it also says how far the month is and how much income is still expected. */
export function CashFlowMonthBar({ month, onChange, outlook, currency }: { month: string; onChange: (month: string) => void; outlook: MonthOutlook | null; currency: string }) {
 const { t, locale } = useLanguage();
 const today = depositToday(), current = month === today.slice(0, 7);
 return <div className="cashflow-month-bar">
  <div className="budget-month-nav">
   <Button variant="outline" size="icon" aria-label={t('Previous month')} onClick={() => onChange(shiftMonth(month, -1))}><ChevronLeft size={16}/></Button>
   <DatePicker mode="month" value={month} max={today} onChange={onChange}/>
   <Button variant="outline" size="icon" aria-label={t('Next month')} disabled={current} onClick={() => onChange(shiftMonth(month, 1))}><ChevronRight size={16}/></Button>
   <TodayButton current={current} onClick={() => onChange(today.slice(0, 7))}/>
  </div>
  {outlook && <div className="cashflow-month-facts">
   <span><CalendarDays size={14} aria-hidden="true"/>{t('Day {day} of {days}', { day: outlook.day, days: outlook.days })}</span>
   {outlook.income !== null && outlook.income > 0 && <span>{t('{amount} income still expected', { amount: formatMoney(outlook.income, currency, locale) })}</span>}
  </div>}
 </div>;
}
