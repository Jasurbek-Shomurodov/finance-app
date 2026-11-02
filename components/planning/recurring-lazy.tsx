"use client";
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { PlanningData } from '@/lib/planning';
import type { RecurringItem } from '@/lib/recurring';

// Recurring's dialogs stay closed until a row opens one, and the details draw a chart, so each loads then.
export const AccountOperation = dynamic(() => import('@/components/planning/account-operation').then(module => module.AccountOperation), { ssr: false });
const RecurringDetails = dynamic(() => import('@/components/planning/recurring-details').then(module => module.RecurringDetails), { ssr: false });

/** The details dialog the Recurring list opens on a tap: `open` shows an occurrence's schedule, `dialog` renders it. Edit and
 * Record payment stay on the row, so the dialog only reads; its × closes it. */
export function useRecurringDetails(data: PlanningData, today: string) {
 const [item, setItem] = useState<RecurringItem | null>(null);
 return { open: setItem, dialog: item && <RecurringDetails item={item} data={data} today={today} onClose={() => setItem(null)}/> };
}
