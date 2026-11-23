"use client";
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { AssetSavers } from '@/components/add-asset/use-asset-save';
import { fetchMarket } from '@/hooks/use-market';
import { demoPurchase } from '@/lib/add-asset';
import { requestJson } from '@/lib/api-client';
import { showSaved } from '@/lib/feedback';
import type { Entry } from '@/lib/finance';
import { withSavedRecord } from '@/lib/record-balance';
import { unitQuote } from '@/lib/unit-quote';

/** What Add asset starts on: nothing (the kind tiles), or a kind, inside an investment account when one is named. */
export type AssetStart = { kind: Entry['kind']; holdingAccountId?: string; currency?: string };
export type AddAssetInput = {
    demo: boolean;
    /** False, after saying so, where the person may not change the workspace. */
    editable: () => boolean;
    setRows: Dispatch<SetStateAction<Entry[]>>;
    planning: { updateRecords?: (change: (records: Entry[]) => Entry[]) => void };
    refreshRecords: () => void;
};

/** The one Add asset flow of the workspace: whether it is open and on what, and how it saves. Signed in, the record and
 * its purchase are two requests (the record form's save, then the Buy or Money invested the Tracker records); the
 * sample workspace applies both to its own rows. */
export function useAddAsset({ demo, editable, setRows, planning, refreshRecords }: AddAssetInput) {
    const [addingAsset, setAddingAsset] = useState<{ preset?: AssetStart } | null>(null);
    const startAsset = (preset?: AssetStart) => { if (editable()) setAddingAsset({ preset }); };
    const closeAsset = () => setAddingAsset(null);
    const assetSavers: AssetSavers = {
        async saveRecord(record) {
            if (demo) { setRows(rows => [...rows.filter(row => row.id !== record.id), record]); return; }
            await requestJson('/api/records', { body: record });
            // The lists show the asset now; the reload that follows takes a few seconds.
            planning.updateRecords?.(records => withSavedRecord(records, record));
        },
        async savePurchase(purchase, plan) {
            if (demo) { setRows(rows => demoPurchase(rows, plan)); return; }
            await requestJson(purchase.url, { body: purchase.body });
        },
    };
    /** The current price of one unit, in the holding's own currency. */
    const assetQuote = async (target: Entry) => unitQuote(target, await fetchMarket([target]));
    /** The asset is saved, with or without its purchase: say so, close and read the lists again. */
    const assetSaved = () => { setAddingAsset(null); showSaved(); if (!demo) refreshRecords(); };
    return { addingAsset, startAsset, closeAsset, assetSavers, assetQuote, assetSaved };
}
