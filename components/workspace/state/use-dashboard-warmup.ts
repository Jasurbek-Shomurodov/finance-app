"use client";
import { useEffect } from 'react';
import { warmRead } from '@/hooks/use-owner-resource';
import { depositToday } from '@/lib/deposit-interest';

/** The Dashboard's own reads (the month's review, the net worth history, the comparison profile) start as soon as the
 * owner is known, beside the workspace reads, rather than after the screen mounts once settings have arrived. Each card
 * then finds its reply under way or answered (`warmRead`). The URLs are the ones those cards ask for. */
export function useDashboardWarmup(owner: string | null, demo: boolean, overview: boolean, revision: number) {
 useEffect(() => {
  if (!owner || demo || !overview) return;
  warmRead(owner, '/api/planning?scope=review&month=' + depositToday().slice(0, 7), revision);
  warmRead(owner, '/api/portfolio-history', revision);
  warmRead('session', '/api/comparison-profile', 0);
 }, [owner, demo, overview, revision]);
}
