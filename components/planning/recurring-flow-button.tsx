"use client";
import { useState } from 'react';
import { Workflow } from 'lucide-react';
import { FlowDialog } from '@/components/cash-flow-drill-lazy';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { formatMonthYear } from '@/lib/format';
import type { RecurringItem } from '@/lib/recurring';
import { recurringFlows } from '@/lib/recurring-flows';

/** The month's schedules as a Sankey: incomes into one total, out to each bill and what is left. */
export function RecurringFlowButton({ items, month, currency, convert }: { items: RecurringItem[]; month: string; currency: string; convert: (amount: number, currency: string) => number | null }) {
 const { t, locale } = useLanguage();
 const [open, setOpen] = useState(false);
 const flows = open ? recurringFlows(items, convert, key => t(key)) : null;
 return <>
  <Button type="button" variant="outline" size="sm" className="recurring-flow-button" onClick={() => setOpen(true)}><Workflow size={16} aria-hidden="true"/>{t('Money flow')}</Button>
  {flows && <FlowDialog title={t('Money flow')} figure={formatMonthYear(month, locale)} flows={flows} currency={currency} onClose={() => setOpen(false)}>
   {flows.missing > 0 && <p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>}
  </FlowDialog>}
 </>;
}
