"use client";
import { useMemo } from 'react';
import { usePortfolioHistory } from '@/hooks/use-portfolio-history';
import { datedRate, useRateHistory } from '@/hooks/use-rate-history';
import { demoHistory } from '@/lib/demo-finance';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
import { historyPnl } from '@/lib/investment-pnl';
import type { MarketData } from '@/lib/market';

type Options = { owner: string | null; demo: boolean; revision: number; /** The sample workspace's records, which its history is made from. */ records: Entry[]; currency: string; market: MarketData | null };

/** Everything the investments earned since tracking began, from the history the Overview chart reads (one shared
 * request), with each payment at its own day's rate. The history brings the day rates of every currency it is kept or
 * shown in, so those are used as they arrive; the comparison feed is asked only when it has none (the sample workspace,
 * or a server with no kept rates), which would otherwise be a second request waiting on the first. `pnl` is null while the history loads or when it
 * cannot be read; `rate` and `history` are handed on to the Profit & loss tab so it reads nothing twice. */
export function useInvestmentPnl({ owner, demo, revision, records, currency, market }: Options) {
 const today = depositToday();
 const saved = usePortfolioHistory(owner, demo, revision);
 const sample = useMemo(() => demo ? demoHistory(records, today) : null, [demo, records, today]);
 const history = demo ? sample : saved.history;
 const first = history?.events.reduce<string | null>((earliest, event) => !earliest || event.occurred_on < earliest ? event.occurred_on : earliest, null) ?? null;
 const fx = history && 'fx' in history ? history.fx : undefined, kept = fx?.length ? fx : null;
 const keptRate = useMemo(() => kept ? datedRate(kept) : undefined, [kept]);
 const asked = useRateHistory(kept ? null : first, today, demo);
 const rate = keptRate ?? asked;
 const pnl = useMemo(() => history ? historyPnl(history, { market, currency, today, rate }) : null, [history, market, currency, today, rate]);
 return { history, pnl, rate, error: !demo && saved.error, retry: saved.retry };
}
