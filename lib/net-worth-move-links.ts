import { assets, liabilities } from './finance';
import { transactionsHref } from './transaction-list';

/** Where a line of a chart day's details leads: the page that explains it, and the words saying so (locale keys). */
export type MoveLink = { href: string; label: string; page?: string };

const loans: MoveLink = { href: '/loans-debts', label: 'Open {name}', page: 'Loans & debts' };
const investments: MoveLink = { href: '/assets', label: 'Open {name}', page: 'Investments' };
const dayTransactions = (date: string, query?: string): MoveLink => ({ href: transactionsHref({ range: { from: date, to: date }, ...(query ? { query } : {}) }), label: 'Open in Transactions' });

/** A kind of record whose value moved net worth that day: cash moves with that day's transactions, debts and money lent
 * live on Loans & debts, every other holding on Investments. An unknown kind leads nowhere. */
export function moveLink(kind: string, date: string): MoveLink | null {
 if (kind === 'Cash') return dayTransactions(date);
 if (kind === 'Money lent' || liabilities.includes(kind)) return loans;
 return assets.includes(kind) ? investments : null;
}

/** A line of the day's investment activity: a principal repayment or spending that funded it is a transaction of that
 * day, found by its name; a purchase or a recorded value is a holding on Investments. */
export function activityLink(item: { name: string; date: string; principal?: number; source?: string }): MoveLink {
 return item.principal !== undefined || item.source === 'expense' ? dayTransactions(item.date, item.name) : investments;
}
