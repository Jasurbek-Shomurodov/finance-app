"use client";
import { useMemo } from 'react';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import type { StoryContext } from '@/lib/account-story';
import { depositToday } from '@/lib/deposit-interest';
import { marketRates, type MarketData } from '@/lib/market';
import { emptyPlanning, type PlanningData } from '@/lib/planning';
import { withBookedRecords } from './account-activity';

/** What Accounts tells an account's story from. Signed in, the Accounts read leaves income and spending out; what is
 * booked to the accounts is read beside it, for the selected account's panel, the rows' month figures and Recent
 * activity. The sample workspace has its records already. `currency` is the display currency. */
export function useAccountStory({ data, owner, demo, revision, currency, market }: { data: PlanningData; owner: string | null; demo: boolean; revision: number; currency: string; market: MarketData | null }) {
 const live = !!owner && !demo;
 const booked = useOwnerResource('/api/planning?scope=account-activity', owner, live, revision, emptyPlanning);
 const history = useMemo(() => live ? { ...data, records: withBookedRecords(data.records, booked.data.records) } : data, [live, data, booked.data.records]);
 const rates = marketRates(market), today = depositToday();
 const story = useMemo<StoryContext>(() => ({ data: history, currency, today, rates }), [history, currency, today, rates]);
 return { history, story, reading: { loading: live && booked.initialLoading, error: live ? booked.error || null : null, retry: booked.retry } };
}
