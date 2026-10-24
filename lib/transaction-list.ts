import { monthEnd, shiftMonth } from './calendar-days';
import { inBusinessFilter } from './business';
import { income, type Entry } from './finance';
import { spendingAmount } from './spending';
import { matchesTags, type TagMatch } from './tags';
import { isTransactionHistory } from './transaction-history';

/** `two_years` is the longest a transaction read covers; links from a tag or a business open it so older history is in view. */
export const transactionPeriods = ['this_month', 'last_month', 'three_months', 'this_year', 'twelve_months', 'two_years'] as const;
export type TransactionPeriod = typeof transactionPeriods[number];
export const transactionPeriodLabels: Record<TransactionPeriod, string> = { this_month: 'This month', last_month: 'Last month', three_months: 'Last 3 months', this_year: 'This year', twelve_months: 'Last 12 months', two_years: 'Last 24 months' };

/** The months a period covers, ending no later than today. */
export function periodRange(period: TransactionPeriod, today: string) {
 const month = today.slice(0, 7);
 const from = period === 'this_month' ? month : period === 'last_month' ? shiftMonth(month, -1) : period === 'three_months' ? shiftMonth(month, -2) : period === 'this_year' ? month.slice(0, 4) + '-01' : shiftMonth(month, period === 'two_years' ? -23 : -11);
 const to = period === 'last_month' ? shiftMonth(month, -1) : month;
 return { from, to };
}

/** The days a period covers: from the first of its first month to the end of its last month, never past today. */
export function periodDays(period: TransactionPeriod, today: string) {
 const { from, to } = periodRange(period, today);
 const end = monthEnd(to);
 return { from: from + '-01', to: end < today ? end : today };
}
/** The earliest day a custom range may start: a transaction read covers at most 24 months. */
export const earliestTransactionDay = (today: string) => shiftMonth(today.slice(0, 7), -23) + '-01';

/** `businesses` holds business ids and `household`, `tags` holds tag ids (none means all); `tagMatch` says whether a row needs any or all of the tags. */
export type TransactionFilter = { query: string; direction: 'all' | 'income' | 'expense'; category: string; businesses: string[]; tags: string[]; tagMatch: TagMatch };
export const emptyTransactionFilter: TransactionFilter = { query: '', direction: 'all', category: 'all', businesses: [], tags: [], tagMatch: 'any' };
/** A link to Transactions already filtered: a direction (`type`), a category, the search (`q`), and a period by name or by
 * its first and last day. */
export type TransactionLink = { direction?: 'income' | 'expense'; category?: string; query?: string; period?: TransactionPeriod; range?: { from: string; to: string } };
export function transactionsHref(link: TransactionLink) {
 const params = new URLSearchParams();
 if (link.direction) params.set('type', link.direction);
 if (link.category) params.set('category', link.category);
 if (link.query) params.set('q', link.query);
 if (link.period) params.set('period', link.period);
 if (link.range) { params.set('from', link.range.from); params.set('to', link.range.to); }
 const search = params.toString();
 return search ? `/transactions?${search}` : '/transactions';
}
const isDay = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
/** What a Transactions link asks for (`transactionsHref`, or ?tag=… and ?business=…): the filter, and the period, a
 * named one or a `range` of days; a tag or a business alone opens the longest period, so its whole history is in view. */
export function transactionsQuery(search: string, list: (key: string) => string[]) {
 const params = new URLSearchParams(search), type = params.get('type'), period = params.get('period'), from = params.get('from'), to = params.get('to');
 const filter: TransactionFilter = { ...emptyTransactionFilter, businesses: list('business'), tags: list('tag'), query: params.get('q') ?? '', category: params.get('category') || 'all', direction: type === 'income' || type === 'expense' ? type : 'all' };
 const range = isDay(from) && isDay(to) && from <= to ? { from, to } : null;
 const named = transactionPeriods.find(item => item === period) ?? (range ? null : 'two_years');
 return { filter, period: named, range };
}

export const filtersTransactions =(filter: TransactionFilter) => !!filter.query || filter.category !== 'all' || filter.direction !== 'all' || filter.businesses.length > 0 || filter.tags.length > 0;

/** Recorded income and spending in the period, newest first, matching the search and filters. The range is months (`2026-10`) or days (`2026-10-05`). */
export function transactionsIn(records: readonly Entry[], range: { from: string; to: string }, today: string, filter: TransactionFilter, categoryName: (record: Entry) => string, tagsOf: (id: string) => readonly string[] = () => []) {
 const query = filter.query.trim().toLowerCase();
 const from = range.from.length === 7 ? range.from + '-01' : range.from, to = range.to.length === 7 ? monthEnd(range.to) : range.to;
 return records.filter(record => isTransactionHistory(record) && record.date <= today && record.date >= from && record.date <= to
  && (filter.direction === 'all' || (filter.direction === 'income') === income.includes(record.kind))
  && (filter.category === 'all' || (record.custom_category_id ?? record.kind) === filter.category)
  && inBusinessFilter(filter.businesses, record.business_id) && matchesTags(tagsOf(record.id), filter.tags, filter.tagMatch)
  && (!query || `${record.name} ${record.notes} ${categoryName(record)}`.toLowerCase().includes(query)))
  .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Converts a record's amount; the record names the day whose rates it converts at (lib/transaction-rates.ts). */
type Convert = (amount: number, currency: string, record?: Entry) => number | null;
/** The money a record moved: income counts up, outgoings down. A mortgage payment shows its whole payment, principal plus interest. */
export const signedAmount = (record: Pick<Entry, 'kind' | 'amount'>) => income.includes(record.kind) ? Number(record.amount) : -Number(record.amount);
/** What a record adds to a total: income up, spending down by the shared definition (`lib/spending.ts`), so a mortgage
 * payment's principal, a transfer to the debt, counts in neither a day's total nor the Summary while its row still
 * shows the whole payment (`signedAmount`). */
export const netAmount = (record: Parameters<typeof spendingAmount>[0]) => income.includes(record.kind) ? Number(record.amount) : -spendingAmount(record);

/** Rows grouped by day; a day's total adds up its rows' `netAmount` and is null when a currency cannot be converted. */
export function groupByDay(records: readonly Entry[], convert: Convert) {
 const days: Array<{ date: string; records: Entry[]; total: number | null }> = [];
 for (const record of records) {
  let day = days.at(-1);
  if (!day || day.date !== record.date) { day = { date: record.date, records: [], total: 0 }; days.push(day); }
  day.records.push(record);
  const value = convert(netAmount(record), record.currency, record);
  day.total = value === null || day.total === null ? null : day.total + value;
 }
 return days;
}

/** One page of rows grouped by day. Each day's total covers the whole day, also the rows on the pages before or after it. */
export function groupPageByDay(records: readonly Entry[], from: number, to: number, convert: Convert) {
 const totals = new Map(groupByDay(records, convert).map(day => [day.date, day.total]));
 return groupByDay(records.slice(from, to), convert).map(day => ({ ...day, total: totals.get(day.date) ?? day.total }));
}

/** Summary card: how many, money in and out, and the largest single expense. Spending follows `lib/spending.ts`, so a mortgage payment counts only its interest. */
export function summarizeTransactions(records: readonly Entry[], convert: Convert) {
 let received = 0, spent = 0, missing = 0;
 // The largest expense is picked by its converted size and shown as entered (`entered`, its own amount and currency).
 let largest: { name: string; amount: number; entered: { amount: number; currency: string } } | null = null;
 for (const record of records) {
  const own = income.includes(record.kind) ? Number(record.amount) : spendingAmount(record);
  const value = convert(own, record.currency, record);
  if (value === null) { missing++; continue; }
  if (income.includes(record.kind)) received += value;
  else { spent += value; if (!largest || value > largest.amount) largest = { name: record.name, amount: value, entered: { amount: own, currency: record.currency } }; }
 }
 return { count: records.length, received, spent, largest, missing };
}

/** A list cut into parts of at most `size`, for database calls that take a limited number of ids. */
export function chunks<T>(list: readonly T[], size: number): T[][] {
 const parts: T[][] = [];
 for (let index = 0; index < list.length; index += size) parts.push(list.slice(index, index + size));
 return parts;
}
