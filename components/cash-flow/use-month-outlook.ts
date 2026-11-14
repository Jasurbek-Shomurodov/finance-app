"use client";
import { useMemo } from 'react';
import { billsStillDue, incomeStillExpected, monthOutlook, type MonthOutlook } from '@/lib/cash-flow-outlook';
import { depositToday } from '@/lib/deposit-interest';
import type { EarningSource } from '@/lib/earning-sources';
import { convertAmount, marketRates, type MarketData } from '@/lib/market';
import { monthEnd } from '@/lib/calendar-days';
import { monthlyIncomeCards } from '@/lib/monthly-income-cards';
import { upcomingPayments, type PlanningData } from '@/lib/planning';
import { monthlyReview, type TransactionSplit } from '@/lib/transaction-tools';

type Input = { data: PlanningData; sources: EarningSource[]; splits: TransactionSplit[]; month: string; currency: string; market: MarketData | null;
 /** The month's spending estimate in the display currency; null while it is unknown. */spendingEstimate: number | null };

/** What the chosen month is still expected to bring (`monthOutlook`), from the records the page already holds: the same
 * income cards, review totals and open due dates its panels show. Null for a month that is not the running one. */
export function useMonthOutlook({ data, sources, splits, month, currency, market, spendingEstimate }: Input): MonthOutlook | null {
 const today = depositToday();
 const rates = marketRates(market);
 return useMemo(() => {
  if (today.slice(0, 7) !== month) return null;
  const convert = (amount: number, from: string) => convertAmount(amount, from, currency, rates);
  const review = monthlyReview(data.records, splits, [], month, currency, today, data.activity, rates, data.investmentLinks);
  const known = !review.missing;
  return monthOutlook({
   month, today, received: known ? review.received : null, spent: known ? review.spent : null, spendingEstimate,
   incomeExpected: incomeStillExpected(monthlyIncomeCards(data.records, month, sources, today, rates), convert),
   billsDue: billsStillDue(upcomingPayments(data.records, data.occurrences, today, monthEnd(month)), month, convert),
  });
 }, [data, sources, splits, month, currency, rates, today, spendingEstimate]);
}
