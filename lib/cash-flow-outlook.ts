import { monthDays, monthEnd } from './calendar-days';
import { expenses, type Entry } from './finance';
import type { DueItem } from './planning';

type Convert = (amount: number, currency: string) => number | null;

/** What a month is still expected to bring, measured against what it has brought so far. Every amount is in the display
 * currency; one that no rate converts leaves its line, and every line that adds it, unknown (null, shown as —). */
export type MonthOutlook = {
 /** Today's day of the month and the month's length. */
 day: number; days: number; through: string;
 /** Income its sources still expect: each source's estimate less what it has received, never below zero. */
 income: number | null;
 /** Scheduled bills of this month not paid yet. */
 bills: number | null;
 /** The rest of the month's expected spending, once the bills still due are counted. */
 other: number | null;
 /** Income minus spending by the end of the month: what came in and went out so far, plus what is still to come. */
 surplus: number | null;
 /** That surplus as a share of the month's whole expected income. */
 rate: number | null;
};

type Card = { amount: number; excluded: boolean; receivedAmount: number; missing: number; entry: Pick<Entry, 'currency'> };

/** Income still expected this month: every scheduled or estimated source's shortfall, in its own currency, converted
 * and added. A source that already brought more than its estimate expects nothing more; it never lowers another's. */
export function incomeStillExpected(cards: readonly Card[], convert: Convert): number | null {
 let total = 0;
 for (const card of cards) {
  if (card.excluded) continue;
  if (card.missing) return null;
  const value = convert(Math.max(0, card.amount - card.receivedAmount), card.entry.currency);
  if (value === null) return null;
  total += value;
 }
 return total;
}

/** The month's scheduled bills that are still open (`upcomingPayments` lists only unsettled due dates). Loan and mortgage
 * payments are left out: their principal is a transfer, not spending (lib/spending.ts). */
export function billsStillDue(items: readonly DueItem[], month: string, convert: Convert): number | null {
 let total = 0;
 for (const item of items) {
  if (item.type !== 'scheduled' || !expenses.includes(item.record.kind) || item.date.slice(0, 7) !== month) continue;
  const value = convert(item.amount, item.record.currency);
  if (value === null) return null;
  total += value;
 }
 return total;
}

type Input = { month: string; today: string; /** Income received and spending so far; null when an amount is missing. */received: number | null; spent: number | null;
 incomeExpected: number | null; billsDue: number | null; /** The month's spending estimate (budget and bills, mortgage interest); null when unknown. */spendingEstimate: number | null };

/** The running month's outlook; null for any other month, which has nothing still to come. Bills still due are owed
 * whatever the estimate says, so spending to come is never less than them. */
export function monthOutlook({ month, today, received, spent, incomeExpected, billsDue, spendingEstimate }: Input): MonthOutlook | null {
 if (today.slice(0, 7) !== month) return null;
 const left = spendingEstimate === null || spent === null ? null : Math.max(0, spendingEstimate - spent);
 const other = left === null || billsDue === null ? null : Math.max(0, left - billsDue);
 const known = received !== null && spent !== null && incomeExpected !== null && billsDue !== null && other !== null;
 const surplus = known ? received - spent + incomeExpected - billsDue - other : null;
 const income = known ? received + incomeExpected : 0;
 return { day: Number(today.slice(8)), days: monthDays(month), through: monthEnd(month), income: incomeExpected, bills: billsDue, other, surplus, rate: surplus !== null && income > 0 ? surplus / income * 100 : null };
}
