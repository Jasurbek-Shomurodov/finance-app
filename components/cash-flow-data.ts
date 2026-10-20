"use client";
import { useMemo } from 'react';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { readRange } from '@/lib/cash-flow-link';
import { normalizeEntry } from '@/lib/finance';
import type { GoalEvent } from '@/lib/goal-funding';
import { emptyPlanning, type PlanningData } from '@/lib/planning';

const noGoalEvents = { events: [] as GoalEvent[] };

/** What Cash flow and its drill-down read: the budget read for `month`'s year of bars, through this month when it fits
 * (so a past balance can be worked back from today's) and back to a `linked` month when that fits too, and every
 * goal's history. Signed out or in the sample workspace, the workspace's own data (`provided`) stands in. */
export function useCashFlowData({ owner, demo, revision, provided, month, today, linked }: { owner: string | null; demo: boolean; revision: number; provided: PlanningData; month: string; today: string; linked?: string | null }) {
 const live = !!owner && !demo;
 const { first, readTo, throughToday } = readRange(month, today, linked);
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${readTo}&from=${first}`, owner, live, revision, emptyPlanning);
 // Goals' histories, for a goal's own Sankey in the drill-down; the sample workspace has none.
 const goalHistory = useOwnerResource('/api/goal-tools', owner, live, revision, noGoalEvents);
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : provided, [live, remote.data, provided]);
 return { live, data, remote, goalEvents: goalHistory.data?.events ?? [], throughToday: !live || throughToday };
}
