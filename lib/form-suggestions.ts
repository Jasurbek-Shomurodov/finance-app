import { budgetKey, income, expenses, type Entry } from './finance';
import { chooseSchedule } from './planning';

/** What the income and expense forms fill in for someone from what they recorded before. Suggestions only fill blanks:
 * they never change a value the person chose, and never a saved record. */
type Direction = 'income' | 'expense';

/** One-time income or expenses, newest first; a schedule or a holding is not a transaction. */
function recentTransactions(records: readonly Entry[], direction: Direction) {
 const kinds: readonly string[] = direction === 'income' ? income : expenses;
 return records.filter(record => record.frequency === 'Once' && kinds.includes(record.kind)).sort((a, b) => b.date.localeCompare(a.date));
}

/** The cash account a new transaction starts in: the one last used for this direction among the accounts in its
 * currency, else the only account in that currency. A business's account would tag the transaction to that business,
 * so personal accounts come first. Null when there is no clear choice. */
export function suggestedCashAccount(records: readonly Entry[], currency: string, direction: Direction): string | null {
 const all = records.filter(record => record.kind === 'Cash' && record.currency === currency);
 const personal = all.filter(account => !account.business_id);
 const accounts = personal.length ? personal : all;
 const ids = new Set(accounts.map(account => account.id));
 const last = recentTransactions(records, direction).find(record => record.account_id && ids.has(record.account_id));
 return last?.account_id ?? (accounts.length === 1 ? accounts[0].id : null);
}

/** The categories someone used most recently for this direction, newest first, as budget keys (a built-in kind or an
 * added category's id). `offered` leaves out deleted ones. */
export function recentCategories(records: readonly Entry[], direction: Direction, offered: (key: string) => boolean, limit = 4): string[] {
 const keys: string[] = [];
 for (const record of recentTransactions(records, direction)) {
  const key = budgetKey(record);
  if (!keys.includes(key) && offered(key)) keys.push(key);
  if (keys.length === limit) break;
 }
 return keys;
}

/** Choosing the schedule a blank payment settles fills its amount in the schedule's own currency when that is one of
 * the person's currencies; an amount already typed keeps its currency (it counts at the day's rate). */
export function scheduleChoice(payment: Entry, schedule: Entry | null, currencies: readonly string[]): Partial<Entry> {
 const switchCurrency = !!schedule && !(payment.amount > 0) && payment.currency !== schedule.currency && currencies.includes(schedule.currency);
 const base = switchCurrency ? { ...payment, currency: schedule.currency } : payment;
 return { ...(switchCurrency ? { currency: schedule.currency, account_exchange_rate: null, account_rate_date: null, account_currency: null } : {}), ...chooseSchedule(base, schedule) };
}

/** The fields `after` changed from `before`: what a suggestion adds to the draft. */
export function changedFields(before: Entry, after: Entry): Partial<Entry> {
 return Object.fromEntries(Object.entries(after).filter(([key, value]) => before[key as keyof Entry] !== value)) as Partial<Entry>;
}
