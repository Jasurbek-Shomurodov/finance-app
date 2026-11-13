"use client";
import { useMemo } from 'react';
import { usePortfolioHistory } from '@/hooks/use-portfolio-history';
import { shiftDay } from '@/lib/calendar-days';
import { demoHistory } from '@/lib/demo-finance';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
import { expectedPayouts, type ExpectedPayout } from '@/lib/investment-insights';

/** Dividends, coupons and interest expected over the next year, for the cash forecast. They come from the history the
 * Overview chart already reads (the same shared request), so they are empty until it loads and when it cannot be read:
 * the forecast then simply counts none. The sample workspace builds its own history from `rows`. */
export function useExpectedPayouts(owner: string | null, demo: boolean, revision: number, rows: Entry[]): ExpectedPayout[] {
 const { history } = usePortfolioHistory(owner, demo, revision);
 const today = depositToday();
 return useMemo(() => {
  const source = demo ? demoHistory(rows, today) : history;
  return source ? expectedPayouts(source.records, source.events, today, shiftDay(today, 365)) : [];
 }, [demo, rows, history, today]);
}
