"use client";
import { useEffect, useState } from 'react';
import { preloadCharts } from '@/components/charts-lazy';
import type { Entry } from '@/lib/finance';
import type { BenchmarkMovement } from '@/lib/investment-benchmarks';
import type { HistoryEvent } from '@/lib/investment-history';
import { historyIncomeRecords } from '@/lib/portfolio-history';
import { refreshRead } from '@/lib/refresh-read';

export type PortfolioHistory = { movements?: BenchmarkMovement[]; records: Entry[]; events: HistoryEvent[]; cashflows?: Entry[]; incomeRecords?: Entry[] };
type Read = { owner: string | null; history: PortfolioHistory | null; error: boolean };

/** The Overview's history read, started as soon as the owner is known, beside the workspace reads rather than after
 * them, and the chart code with it, so the net worth chart does not wait for one before the other. A new `revision`
 * reads again and keeps showing the last history meanwhile. */
export function usePortfolioHistory(owner: string | null, demo: boolean, revision: number) {
 const [read, setRead] = useState<Read>({ owner: null, history: null, error: false });
 const [attempt, setAttempt] = useState(0);
 useEffect(() => { void preloadCharts().catch(() => undefined); }, []);
 useEffect(() => {
  if (demo || !owner) return;
  const controller = new AbortController();
  refreshRead('/api/portfolio-history', { signal: controller.signal }).then(async response => {
   if (!response.ok) throw Error();
   const data = await response.json() as PortfolioHistory & { recurringIncome?: Entry[] };
   if (!controller.signal.aborted) setRead({ owner, history: { ...data, incomeRecords: historyIncomeRecords(data) }, error: false });
  }).catch(() => { if (!controller.signal.aborted) setRead({ owner, history: null, error: true }); });
  return () => controller.abort();
 }, [owner, demo, revision, attempt]);
 const current = read.owner === owner;
 return { history: current ? read.history : null, error: current && read.error, retry: () => { setRead({ owner, history: null, error: false }); setAttempt(n => n + 1); } };
}
