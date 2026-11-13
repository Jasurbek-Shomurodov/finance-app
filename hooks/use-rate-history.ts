"use client";
import { useEffect, useMemo, useState } from 'react';
import { historicalRate, type BenchmarkData, type FxPoint } from '@/lib/benchmark-data';
import { benchmarkHistoryStart } from '@/lib/investment-benchmarks';
import type { DatedRate } from '@/lib/investment-pnl';
import { refreshRead } from '@/lib/refresh-read';

/** `from` in `to` on a day through the kept official rates, which are per US dollar; null when either side has none. */
export function datedRate(fx: readonly FxPoint[]): DatedRate {
 return (from, to, date) => {
  const source = historicalRate(fx as FxPoint[], from, date), target = historicalRate(fx as FxPoint[], to, date);
  return source && target ? target / source : null;
 };
}

/** The official rates of past days from `start` to `today`, for converting each payment at its own day's rate. The
 * comparison feed already serves them, so they are read from it with the one benchmark that needs no market prices.
 * `rate` is undefined until they load, and stays so when they cannot be read: amounts then convert at today's rate. */
export function useRateHistory(start: string | null, today: string, demo: boolean) {
 const from = start && start < benchmarkHistoryStart ? benchmarkHistoryStart : start;
 const [read, setRead] = useState<{ key: string; fx: FxPoint[] } | null>(null);
 const key = from && from < today ? `${demo}:${from}:${today}` : '';
 useEffect(() => {
  if (!key || !from) return;
  const controller = new AbortController(), params = new URLSearchParams({ start: from, end: today, benchmarks: 'depositUSD' });
  refreshRead(demo ? '/api/benchmarks?demo=1' : '/api/benchmarks?' + params, { signal: controller.signal, cache: 'default' })
   .then(async response => { const data = await response.json() as BenchmarkData; if (response.ok && !controller.signal.aborted) setRead({ key, fx: data.fx ?? [] }); })
   .catch(() => undefined);
  return () => controller.abort();
 }, [key, from, today, demo]);
 const fx = read && read.key === key && read.fx.length ? read.fx : null;
 return useMemo(() => fx ? datedRate(fx) : undefined, [fx]);
}
