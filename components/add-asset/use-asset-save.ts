"use client";
import { useState } from 'react';
import type { RequestError } from '@/lib/api-client';
import type { AssetPurchase, AssetSavePlan } from '@/lib/add-asset';
import type { Entry } from '@/lib/finance';

/** The purchase that did not follow its record: why, and whether the server said so (then its details may be changed
 * before the retry) or the answer never came (then the same details are sent again). */
export type PartialSave = { reason: string; confirmed: boolean };
export type AssetSavers = { saveRecord: (record: Entry) => Promise<void>; savePurchase: (purchase: AssetPurchase, plan: AssetSavePlan) => Promise<void> };

/** Sends a save plan as one action. The record goes first; a purchase follows it. When the record fails nothing was
 * saved and `error` says why. When only the purchase fails the record stays saved: `partial` says so, and the next
 * `save` sends the purchase alone, under the same id, so nothing is recorded twice. */
export function useAssetSave({ saveRecord, savePurchase }: AssetSavers, onDone: () => void) {
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [recorded, setRecorded] = useState(false), [partial, setPartial] = useState<PartialSave | null>(null);
 async function save(plan: AssetSavePlan) {
  if (busy) return;
  setBusy(true); setError('');
  try {
   if (!recorded) {
    try { await saveRecord(plan.record); setRecorded(true); }
    catch (reason) { setError((reason as Error).message); return; }
   }
   if (plan.purchase) {
    try { await savePurchase(plan.purchase, plan); }
    catch (reason) { setPartial({ reason: (reason as Error).message, confirmed: !!(reason as RequestError).confirmedFailure }); return; }
   }
   setPartial(null);
   onDone();
  } finally { setBusy(false); }
 }
 return { save, busy, error, recorded, partial };
}
