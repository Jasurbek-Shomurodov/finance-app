"use client";
import dynamic from 'next/dynamic';

// Closed until the person opens them, so they load on their own, after the Transactions list.
// next/dynamic needs its options written out as an object literal, so each call spells them out.
export const BulkEditSheet = dynamic(() => import('@/components/transactions/bulk-edit-sheet').then(module => module.BulkEditSheet), { ssr: false });
export const RuleDialog = dynamic(() => import('@/components/transactions/rule-dialog').then(module => module.RuleDialog), { ssr: false });
export const RulesDialog = dynamic(() => import('@/components/transactions/rules-list').then(module => module.RulesDialog), { ssr: false });
