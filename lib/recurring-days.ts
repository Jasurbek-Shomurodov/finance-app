import { shiftDay } from './calendar-days';
import type { Entry } from './finance';
import { suggestedPaymentAccount, type Paid } from './payment-account';
import { upcomingPayments, type DueItem, type PlanningData } from './planning';
import { occurrencesBetween, type RecurringItem, type RecurringStatus } from './recurring';

/** How one day's payment reads on the calendar and in Coming up: money in, a bill, or a payment on a debt. */
export type DayTone = 'income' | 'bill' | 'debt';
/** One payment on its day: a scheduled income or bill, a loan's monthly payment (`item`), or a debt repayment or deposit
 * maturity that falls due (`reminder`). `amount` is as entered, in the record's own currency. */
export type DayEntry = { key: string; record: Entry; date: string; tone: DayTone; amount: number; status: RecurringStatus; item?: RecurringItem; reminder?: DueItem };
export type DayGroup = { date: string; entries: DayEntry[] };

const toneOrder: readonly DayTone[] = ['income', 'bill', 'debt'];
const fromItem = (item: RecurringItem): DayEntry => ({ key: item.key, record: item.record, date: item.date, tone: item.installment ? 'debt' : item.direction === 'income' ? 'income' : 'bill', amount: item.amount, status: item.status, item });
/** A deposit that matures or money lent that comes back is money in; any other repayment pays a debt down. */
const fromReminder = (reminder: DueItem): DayEntry => ({ key: reminder.key, record: reminder.record, date: reminder.date, tone: reminder.type === 'maturity' || reminder.record.kind === 'Money lent' ? 'income' : 'debt', amount: reminder.amount, status: reminder.overdue ? 'overdue' : 'due', reminder });

/** The month's occurrences and the debt repayments and maturities beside them, by day in date order; within a day income
 * first, then bills, then debt payments. A reminder still open from an earlier month has no day in this one. */
export function dayGroups(items: readonly RecurringItem[], reminders: readonly DueItem[], from = '', to = '9999-12-31'): DayGroup[] {
 const days = new Map<string, DayEntry[]>();
 for (const entry of [...items.map(fromItem), ...reminders.map(fromReminder)]) if (entry.date >= from && entry.date <= to) days.set(entry.date, [...(days.get(entry.date) ?? []), entry]);
 return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, entries]) => ({ date, entries: entries.sort((a, b) => toneOrder.indexOf(a.tone) - toneOrder.indexOf(b.tone)) }));
}

/** What is still to come after today, through the next `days` days (31, as the reminders and the dashboard look ahead): open incomes, bills and loan payments, and the
 * debt repayments and deposit maturities that fall due. Settled and skipped ones are left out. */
export function comingUp(data: Pick<PlanningData, 'records' | 'occurrences' | 'debtPayments'>, today: string, days = 31): DayGroup[] {
 const from = shiftDay(today, 1), to = shiftDay(today, days);
 const items = occurrencesBetween(data.records, data.occurrences, from, to, today, data.debtPayments).filter(item => item.status === 'due');
 const reminders = upcomingPayments(data.records, data.occurrences, today, to).filter(item => item.type === 'repayment' || item.type === 'maturity');
 return dayGroups(items, reminders, from, to);
}

/** A day's entries of one tone that still count: a skipped one adds nothing. */
export const ofTone = (entries: readonly DayEntry[], tone: DayTone) => entries.filter(entry => entry.tone === tone && entry.status !== 'skipped');
/** A day's amounts with their sign, money in adding and bills and debt payments taking away, for a net total. */
export const signedAmounts = (entries: readonly DayEntry[]) => entries.filter(entry => entry.status !== 'skipped').map(entry => ({ amount: entry.tone === 'income' ? entry.amount : -entry.amount, currency: entry.record.currency }));

/** One payment "Record all due today" would save, and the cash account it is saved against. */
export type DuePayment = { item: RecurringItem; account: Entry };

/** The payments due today, sorted by what recording them all at once needs. `ready`: Record payment would open ready to
 * save, with the suggested cash account holding the schedule's currency, so no exchange rate is involved. `choose`: no
 * account can be suggested, so the person names one for them (`withAccount`). `separate`: loan payments (principal and
 * interest are typed) and payments whose suggested account holds another currency; they stay on their rows. */
export function dueTodayPayments(items: readonly RecurringItem[], records: readonly Entry[], activity: readonly Paid[], today: string): { ready: DuePayment[]; choose: RecurringItem[]; separate: RecurringItem[] } {
 const accounts = records.filter(record => record.kind === 'Cash');
 const ready: DuePayment[] = [], choose: RecurringItem[] = [], separate: RecurringItem[] = [];
 for (const item of items) {
  if (item.date !== today || item.status !== 'due') continue;
  const account = item.installment ? undefined : accounts.find(entry => entry.id === suggestedPaymentAccount(accounts, item.record, records, activity));
  if (account?.currency === item.record.currency) ready.push({ item, account });
  else if (account || item.installment) separate.push(item);
  else choose.push(item);
 }
 return { ready, choose, separate };
}

/** The payments with no suggested account, paid from the one the person picked: those in its currency become payments,
 * the rest (and all of them while no account is picked) stay to be recorded one by one. */
export function withAccount(choose: readonly RecurringItem[], account: Entry | undefined): { payments: DuePayment[]; rest: RecurringItem[] } {
 const fits = (item: RecurringItem) => account?.kind === 'Cash' && account.currency === item.record.currency;
 return { payments: choose.filter(fits).map(item => ({ item, account: account! })), rest: choose.filter(item => !fits(item)) };
}

/** What Record payment saves for a payment due today when nothing in its form is changed: the scheduled amount, in the
 * schedule's currency (which is the account's), paid today from the suggested account, settling today's due date. */
export const duePaymentData = (id: string, { item, account }: DuePayment, today: string) =>
 ({ id, account_id: account.id, target_id: item.record.id, date: item.date, paid_on: today, amount: item.amount, received: 0, fee: 0, notes: '' });
