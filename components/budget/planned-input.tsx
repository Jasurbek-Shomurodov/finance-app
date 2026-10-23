"use client";
import { useRef, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import type { BudgetHistory, BudgetHistoryMonth, BudgetRow } from '@/lib/budget';
import { showError } from '@/lib/feedback';
import { formatMoney, formatMonthShort, formatMonthYear } from '@/lib/format';

const percentOf = (value: number, peak: number) => `${Math.max(2, value / peak * 100)}%`;

/** History popover: last month, the monthly average and six monthly bars ending with the edited month.
 * Each bar carries a dashed mark at its plan; the edited month's mark follows the amount being typed. */
function HistoryPanel({ history, direction, currency, amount, forward, onForward }: { history: BudgetHistory; direction: BudgetRow['direction']; currency: string; amount: number; forward: boolean; onForward: (value: boolean) => void }) {
 const { t, locale } = useLanguage();
 const editing = history.months.at(-1)?.month;
 const months = history.months.map(item => item.month === editing ? { ...item, planned: amount } : item);
 const peak = Math.max(...months.flatMap(item => [item.amount, item.planned ?? 0]), 1);
 const money = (value: number) => formatMoney(value, currency, locale);
 const label = (item: BudgetHistoryMonth) => [formatMonthYear(item.month, locale), `${t('Actual')} ${money(item.amount)}`, ...(item.planned ? [`${t('Planned')} ${money(item.planned)}`] : [])].join(' · ');
 return <div className="budget-history">
  <p className="budget-history-title">{t('History')}</p>
  <div className="budget-history-tiles">
   <div><strong>{money(history.lastMonth)}</strong><span>{t(direction === 'income' ? 'Earned last month' : 'Spent last month')}</span></div>
   <div><strong>{money(history.average)}</strong><span>{t('Monthly average')}</span></div>
  </div>
  <ol className="budget-history-bars" data-direction={direction}>
   {months.map(item => <li key={item.month} title={label(item)} aria-label={label(item)} data-current={item.month === editing || undefined}>
    <div><span style={{ height: percentOf(item.amount, peak) }}/>{item.planned ? <i style={{ bottom: `${item.planned / peak * 100}%` }}/> : null}</div>
    <small>{formatMonthShort(item.month, locale)}</small>
   </li>)}
  </ol>
  <p className="budget-history-legend"><span data-key="actual">{t('Actual')}</span><span data-key="planned">{t('Planned')}</span></p>
  <label className="budget-history-forward"><input type="checkbox" checked={forward} onChange={event => onForward(event.currentTarget.checked)}/>{t('Apply {amount} to all future months', { amount: money(amount) })}</label>
 </div>;
}

type PlannedProps = { label: string; value: number; history: BudgetHistory; direction: BudgetRow['direction']; currency: string; defaultForward: boolean; appliesForward: boolean; onSave: (amount: number, forward: boolean) => Promise<void>; /** Saves the tick: this amount for every later month, or for this month only. */onRepeat: (amount: number, forward: boolean) => Promise<void> };

/** An editable planned amount. A saved amount no rate converts (`value` null) reads — and is not editable here:
 * a 0 in its place would overwrite the real amount on save. */
export function PlannedInput({ value, ...props }: Omit<PlannedProps, 'value'> & { value: number | null }) {
 const { t } = useLanguage();
 if (value === null) return <span className="budget-pill" role="img" aria-label={`${props.label}: ${t('Exchange rate unavailable.')}`} title={t('Exchange rate unavailable.')}>—</span>;
 return <EditablePlannedInput {...props} value={value}/>;
}

/** Focusing the amount opens the History popover; leaving it saves. The tick shows whether the amount carries on into
 * later months and saves the moment it changes. Once a save settles the field shows the plan as it now stands: an amount
 * typed below the category's recurring bills is saved, but the plan stays at the bills (`plannedIn`, shown as "{amount}
 * recurring" on the row), so the figure goes back to them rather than lingering (ERR-005). */
function EditablePlannedInput({ label, value, history, direction, currency, defaultForward, appliesForward, onSave, onRepeat }: PlannedProps) {
 const { t } = useLanguage();
 const anchor = useRef<HTMLSpanElement>(null);
 const [open, setOpen] = useState(false);
 const [draft, setDraft] = useState(value);
 // The field follows the plan: when it changes under the field (another month, a bill that raised it) and once a save
 // settles, since the plan may not be the figure typed (one below the bills stays at them). Derived during render, so
 // the figure is right in the same pass; `settled` counts the saves that came back.
 const [settled, setSettled] = useState(0);
 const [shown, setShown] = useState({ value, settled });
 const stale = shown.value !== value || shown.settled !== settled;
 if (stale) { setShown({ value, settled }); setDraft(value); }
 const amount = stale ? value : draft;
 const done = () => setSettled(count => count + 1);
 const failed = (error: unknown) => { done(); showError(t((error as Error).message || 'Could not save changes.')); };
 const save = (forward: boolean) => onSave(amount, forward).then(done, failed);
 const repeat = (forward: boolean) => onRepeat(amount, forward).then(done, failed);
 function commit() {
  setOpen(false);
  if (amount !== value) save(appliesForward || defaultForward);
 }
 return <Popover open={open} onOpenChange={next => { if (!next) commit(); }}>
  <PopoverAnchor asChild>
   <span ref={anchor} className="budget-input" onFocus={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); (event.target as HTMLElement).blur(); } }}>
    <FormattedNumberInput ariaLabel={label} value={amount} onValueChange={next => setDraft(next)} required={false} displayFractionDigits={0}/>
   </span>
  </PopoverAnchor>
  <PopoverContent className="budget-history-popover" align="end" collisionPadding={16} onOpenAutoFocus={event => event.preventDefault()} onInteractOutside={event => { if (anchor.current?.contains(event.target as Node)) event.preventDefault(); }}>
   <HistoryPanel history={history} direction={direction} currency={currency} amount={amount} forward={appliesForward} onForward={repeat}/>
  </PopoverContent>
 </Popover>;
}
