"use client";
import { useState, type Dispatch, type SetStateAction } from 'react';
import { requestJson } from '@/lib/api-client';
import { closeLocally, closingTransfer, reopenLocally } from '@/lib/closed-records';
import { showError, showSaved } from '@/lib/feedback';
import type { Entry } from '@/lib/finance';
import type { HoldingAccount } from '@/lib/holding-accounts';

/** What is being closed or removed: an account or holding, an investment account, or an empty investment account to delete. */
export type Closing = { record: Entry } | { account: HoldingAccount } | { remove: HoldingAccount } | null;
export type ClosingInput = {
    demo: boolean; setRows: Dispatch<SetStateAction<Entry[]>>; refreshRecords: () => void;
    setDemoHoldingAccounts: Dispatch<SetStateAction<HoldingAccount[]>>;
    /** Opens a form only where the person may change the workspace. */
    editable: () => boolean;
};

/** Closing, reopening and deleting accounts (migration 168). Signed in, each change is sent and the records are read
 * again; the sample workspace keeps the same rules on its local rows. */
export function useClosing({ demo, setRows, refreshRecords, setDemoHoldingAccounts, editable }: ClosingInput) {
    const [closing, setClosing] = useState<Closing>(null);
    const send = async (action: string, data: Record<string, unknown>) => {
        // The lists are read again whatever the answer: a transfer that went through has already moved the balance.
        try { await requestJson('/api/closing', { body: { action, data } }); }
        finally { refreshRecords(); }
        showSaved();
    };
    /** Closes an account or holding on a day. What is left in a cash account or deposit first goes to `targetId`
     * through the ordinary transfer, dated the same day. */
    async function closeRecord(record: Entry, closedOn: string, targetId: string | null) {
        if (demo) { setRows(previous => closeLocally(previous, record.id, closedOn, targetId)); showSaved(); return; }
        if (targetId) await requestJson('/api/asset-movements', { body: closingTransfer(crypto.randomUUID(), record, targetId, closedOn) });
        await send('close', { id: record.id, closed_on: closedOn });
    }
    async function reopenRecord(record: Entry) {
        if (demo) { setRows(previous => reopenLocally(previous, record.id)); showSaved(); return; }
        await send('reopen', { id: record.id });
    }
    /** Closes an investment account: its open holdings move to `moveTo` (or to no account), or close with it. */
    async function closeAccount(account: HoldingAccount, closedOn: string, moveTo: string | null, closeHoldings: boolean) {
        if (!demo) return send('close_account', { id: account.id, closed_on: closedOn, move_to: moveTo, close_holdings: closeHoldings });
        setRows(previous => previous.map(row => row.holding_account_id !== account.id || row.closed_on ? row : closeHoldings ? { ...row, closed_on: closedOn } : { ...row, holding_account_id: moveTo }));
        setDemoHoldingAccounts(items => items.map(item => item.id === account.id ? { ...item, closed_on: closedOn } : item));
        showSaved();
    }
    /** Reopens an investment account with the holdings that closed with it. */
    async function reopenAccount(account: HoldingAccount) {
        if (!demo) return send('reopen_account', { id: account.id });
        setDemoHoldingAccounts(items => items.map(item => item.id === account.id ? { ...item, closed_on: null } : item));
        setRows(previous => previous.map(row => row.holding_account_id === account.id && row.closed_on === account.closed_on ? { ...row, closed_on: null } : row));
        showSaved();
    }
    /** Deletes an investment account that holds nothing. */
    async function deleteAccount(account: HoldingAccount) {
        if (!demo) return send('delete_account', { id: account.id });
        setDemoHoldingAccounts(items => items.filter(item => item.id !== account.id));
        showSaved();
    }
    const open = (next: Closing) => { if (editable()) setClosing(next); };
    /** A fold's Reopen is one press: a refusal is said in a popup. */
    const reopen = (work: Promise<void>) => { void work.catch(error => showError((error as Error).message)); };
    return {
        closing, endClosing: () => setClosing(null),
        requestClose: (record: Entry) => open({ record }), requestCloseAccount: (account: HoldingAccount) => open({ account }), requestDeleteAccount: (account: HoldingAccount) => open({ remove: account }),
        closeRecord, closeAccount, deleteAccount,
        reopenRecord: (record: Entry) => { if (editable()) reopen(reopenRecord(record)); },
        reopenAccount: (account: HoldingAccount) => { if (editable()) reopen(reopenAccount(account)); },
    };
}
