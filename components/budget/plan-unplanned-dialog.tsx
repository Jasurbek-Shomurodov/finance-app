"use client";
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { BudgetRow } from '@/lib/budget';
import { showError } from '@/lib/feedback';
import { formatMoney } from '@/lib/format';
import { useCategoryName } from './budget-rows';

/** Plan these: every unplanned category with an amount to plan for the month, filled in with `suggest` (a whole
 * amount) and free to change. A row left at zero stays unplanned. */
export function PlanUnplannedDialog({ rows, currency, suggest, onSave, onClose }: { rows: BudgetRow[]; currency: string; suggest: (row: BudgetRow) => number; onSave: (plans: Array<{ key: string; amount: number }>) => Promise<void>; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const [amounts, setAmounts] = useState<Record<string, number>>(() => Object.fromEntries(rows.map(row => [row.key, suggest(row)])));
 const [busy, setBusy] = useState(false);
 async function submit() {
  setBusy(true);
  try { await onSave(rows.map(row => ({ key: row.key, amount: amounts[row.key] ?? 0 })).filter(plan => plan.amount > 0)); onClose(); }
  catch (error) { showError(t((error as Error).message)); }
  finally { setBusy(false); }
 }
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <DialogContent className="budget-dialog">
   <DialogTitle>{t('Plan unplanned spending')}</DialogTitle>
   <form onSubmit={event => { event.preventDefault(); void submit(); }}>
    <fieldset disabled={busy} className="budget-dialog-fields">
     <ul className="budget-plan-list">{rows.map(row => <li key={row.key}>
      <CategoryIcon kind={row.custom ? row.name : row.key} size="sm"/>
      <span>{name(row)}<small>{t('{amount} spent', { amount: formatMoney(row.actual, currency, locale) })}</small></span>
      <span className="budget-input"><FormattedNumberInput ariaLabel={t('Planned for {name}', { name: name(row) })} value={amounts[row.key] ?? 0} required={false} displayFractionDigits={0} onValueChange={value => setAmounts(current => ({ ...current, [row.key]: value }))}/></span>
     </li>)}</ul>
    </fieldset>
    <FormFooter busy={busy} onCancel={onClose}><Button disabled={busy}>{t(busy ? 'Saving…' : 'Save')}</Button></FormFooter>
   </form>
  </DialogContent>
 </Dialog>;
}
