"use client";
import dynamic from 'next/dynamic';

// Budget's dialogs stay closed until a row or Settings opens one, and the details draw a chart, so each loads then.
export const CategoryDetailsDialog = dynamic(() => import('@/components/budget/category-details').then(module => module.CategoryDetailsDialog), { ssr: false });
export const CategorySettingsDialog = dynamic(() => import('@/components/budget/settings-dialogs').then(module => module.CategorySettingsDialog), { ssr: false });
export const BudgetSettingsDialog = dynamic(() => import('@/components/budget/settings-dialogs').then(module => module.BudgetSettingsDialog), { ssr: false });
export const PlanUnplannedDialog = dynamic(() => import('@/components/budget/plan-unplanned-dialog').then(module => module.PlanUnplannedDialog), { ssr: false });
// The pace chart draws with the chart library, which the rest of the month's page does not need.
export const SpendingPaceCard = dynamic(() => import('@/components/budget/spending-pace-card').then(module => module.SpendingPaceCard), { ssr: false });
