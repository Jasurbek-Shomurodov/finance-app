"use client";
import dynamic from 'next/dynamic';

// Budget's dialogs stay closed until a row or Settings opens one, and the details draw a chart, so each loads then.
export const CategoryDetailsDialog = dynamic(() => import('@/components/budget/category-details').then(module => module.CategoryDetailsDialog), { ssr: false });
export const CategorySettingsDialog = dynamic(() => import('@/components/budget/settings-dialogs').then(module => module.CategorySettingsDialog), { ssr: false });
export const BudgetSettingsDialog = dynamic(() => import('@/components/budget/settings-dialogs').then(module => module.BudgetSettingsDialog), { ssr: false });
