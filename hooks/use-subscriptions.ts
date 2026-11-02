"use client";
import { useMemo, useState } from 'react';
import { saveOwnerResource, useOwnerResource } from '@/hooks/use-owner-resource';
import { showSaved } from '@/lib/feedback';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { emptyPlanning } from '@/lib/planning';
import type { SubscriptionDecision } from '@/lib/recurring-insights';

const emptyDecisions: { decisions: SubscriptionDecision[] } = { decisions: [] };

/** The last two years of income and spending up to today, whatever a page shows: read only while `enabled`.
 * The sample workspace reads its records in memory. */
export function useInsightHistory(owner: string | null, demo: boolean, revision: number, sampleRecords: Entry[], enabled = true) {
 const history = useOwnerResource('/api/planning?scope=insights', owner, !!owner && !demo && enabled, revision, emptyPlanning);
 const records = useMemo(() => demo ? sampleRecords : history.data.records.map(normalizeEntry), [demo, sampleRecords, history.data.records]);
 return { records, initialLoading: history.initialLoading, error: history.error, retry: history.retry };
}

/**
 * The transaction history that subscriptions are found in, and the owner's decisions about them, read only while the
 * Subscriptions view is open (`enabled`). The sample workspace keeps decisions for the visit.
 */
export function useSubscriptions(owner: string | null, demo: boolean, revision: number, sampleRecords: Entry[], enabled = true) {
 const live = !!owner && !demo && enabled;
 const history = useInsightHistory(owner, demo, revision, sampleRecords, enabled);
 const remote = useOwnerResource('/api/subscriptions', owner, live, revision, emptyDecisions);
 const [sample, setSample] = useState<SubscriptionDecision[]>([]);
 const same = (a: Pick<SubscriptionDecision, 'merchant' | 'currency'>, b: Pick<SubscriptionDecision, 'merchant' | 'currency'>) => a.merchant === b.merchant && a.currency === b.currency;
 return {
  records: history.records,
  decisions: demo ? sample : remote.data.decisions,
  loading: live && (history.initialLoading || remote.initialLoading),
  error: live ? history.error || remote.error : '',
  retry: () => { history.retry(); remote.retry(); },
  async decide(decision: SubscriptionDecision) {
   if (demo) { setSample(list => [...list.filter(item => !same(item, decision)), decision]); showSaved(); return; }
   await saveOwnerResource('/api/subscriptions', 'decide', decision);
   remote.update(data => ({ decisions: [...data.decisions.filter(item => !same(item, decision)), decision] }));
  },
  async restore(key: Pick<SubscriptionDecision, 'merchant' | 'currency'>) {
   if (demo) { setSample(list => list.filter(item => !same(item, key))); showSaved(); return; }
   await saveOwnerResource('/api/subscriptions', 'restore', { merchant: key.merchant, currency: key.currency });
   remote.update(data => ({ decisions: data.decisions.filter(item => !same(item, key)) }));
  },
 };
}
