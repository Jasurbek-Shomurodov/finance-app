"use client";
import dynamic from 'next/dynamic';
import { chartHeight } from '@/components/presentation-foundation/chart';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';

// The Accounts dialogs stay closed until a button opens one, so each loads then, not in the code the page waits for.
// next/dynamic needs its options written out as an object literal, so each call spells them out.
export const AccountBusinessesDialog = dynamic(() => import('@/components/account-businesses-dialog').then(module => module.AccountBusinessesDialog), { ssr: false });
export const AccountOwnersDialog = dynamic(() => import('@/components/account-owners-dialog').then(module => module.AccountOwnersDialog), { ssr: false });
export const AccountOperation = dynamic(() => import('../account-operation').then(module => module.AccountOperation), { ssr: false });
export const AssetMovementDialog = dynamic(() => import('../asset-movement-dialog').then(module => module.AssetMovementDialog), { ssr: false });
export const CorporateEventDialog = dynamic(() => import('../corporate-event-dialog').then(module => module.CorporateEventDialog), { ssr: false });
export const HoldingAccountDialog = dynamic(() => import('../holding-account-dialog').then(module => module.HoldingAccountDialog), { ssr: false });
export const StatementReconciliation = dynamic(() => import('../statement-reconciliation').then(module => module.StatementReconciliation), { ssr: false });
// The selected account's balance line: the chart library loads when the line is drawn, behind a placeholder of its height.
export const AccountBalanceChart = dynamic(() => import('./account-balance-chart').then(module => module.AccountBalanceChart), { ssr: false, loading: () => <ChartSkeleton height={chartHeight.slim}/> });
