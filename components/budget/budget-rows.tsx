"use client";
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, RefreshCw, Settings2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Count } from '@/components/presentation-foundation/count';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { SortableItem, SortableList } from '@/components/presentation-foundation/sortable';
import { Button } from '@/components/ui/button';
import { isUnbudgeted, remainingTone, type BudgetCategory, type BudgetGroup, type BudgetRow } from '@/lib/budget';
import { rowState, splitUnplanned } from '@/lib/budget-view';
import { formatDate, formatMoney, formatPercent, formatSignedMoney } from '@/lib/format';

/** A category's display name: built-in kinds are translated, custom names are shown as typed. */
export function useCategoryName() {
 const { t } = useLanguage();
 return (category: Pick<BudgetCategory, 'name' | 'custom'>) => category.custom ? category.name : t(category.name);
}

/** Remaining money as a pill: green when money is left, red when overspent, grey at zero. Income that came in above its
 * plan is the extra, +$1,443, not a negative amount still to come. */
function RemainingPill({ value, direction, currency }: { value: number | null; direction: BudgetRow['direction']; currency: string }) {
 const { locale } = useLanguage();
 if (value === null) return <span className="budget-pill">—</span>;
 return <span className="budget-pill" data-tone={remainingTone(value, direction)}>{direction === 'income' && value < 0 ? formatSignedMoney(-value, currency, locale) : formatMoney(value, currency, locale)}</span>;
}

/** A thin progress line: how much of the planned amount is used. */
export function BudgetProgress({ row }: { row: Pick<BudgetRow, 'progress' | 'direction' | 'remaining'> }) {
 const over = row.direction === 'expense' && (row.remaining ?? 0) < 0;
 return <div className="budget-progress" data-over={over || undefined} aria-hidden="true"><div style={{ width: `${Math.min(100, Math.max(0, row.progress * 100))}%` }}/></div>;
}

/** Plan against actual between a row's name and its figures: the bar with the row's live state under it
 * ("80% received", "Due today", "$40 over"). `due` is the category's first open scheduled date this month. */
function BudgetState({ row, due, today, currency }: { row: BudgetRow; due?: string; today: string; currency: string }) {
 const { t, locale } = useLanguage();
 const state = rowState(row, due, today);
 const label = (): string | null => {
  switch (state.kind) {
   case 'none': return null;
   case 'not_planned': return t('Not planned');
   case 'due_today': return t('Due today');
   case 'overdue': return t('Overdue');
   case 'due': return t('Due {date}', { date: formatDate(state.date, locale) });
   case 'over': return t('{amount} over', { amount: formatMoney(state.amount, currency, locale) });
   default: return t(row.direction === 'income' ? '{percent} received' : '{percent} used', { percent: formatPercent(state.percent, locale, 0) });
  }
 };
 const text = label();
 const tone = state.kind === 'over' || state.kind === 'overdue' ? 'negative' : state.kind === 'not_planned' ? 'positive' : undefined;
 return <span className="budget-state">{state.kind !== 'not_planned' && state.kind !== 'none' && <BudgetProgress row={row}/>}{text && <small data-tone={tone}>{text}</small>}</span>;
}

/** What the rows of one page share: how a plan is edited, what a row opens, its menu, its due date and how rows move. */
export type BudgetRowTools = { currency: string; today: string; renderPlanned: (row: BudgetRow) => ReactNode; onOpen: (row: BudgetRow) => void; rowMenu?: (row: BudgetRow) => ReactNode;
 dueOf: (row: BudgetRow) => string | undefined;
 /** Drops `id` on `target` within the rows listed together (`visible`); the order is the person's, shared with Settings › Categories. */
 onMove: (id: string, target: string, visible: string[]) => void; moveDisabled: boolean };

/** Category rows the person can drag into their own order. `unplanned` rows carry no plan: no bar, and — for Remaining. */
function CategoryRows({ id, rows, tools, unplanned = false }: { id: string; rows: BudgetRow[]; tools: BudgetRowTools; unplanned?: boolean }) {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const { currency } = tools, keys = rows.map(row => row.key);
 return <SortableList id={id} items={keys} disabled={tools.moveDisabled} nameOf={key => { const row = rows.find(item => item.key === key); return row ? name(row) : ''; }} onMove={(active, over) => tools.onMove(active, over, keys)}>
  {rows.map(row => <SortableItem key={row.key} id={row.key} label={name(row)} className="budget-row budget-category-row">
   <button type="button" className="budget-category-name" onClick={() => tools.onOpen(row)} aria-label={t('Open {name}', { name: name(row) })}>
    <CategoryIcon kind={row.custom ? row.name : row.key} size="sm"/><span>{name(row)}{row.rolloverIn !== 0 && <RolledOver amount={row.rolloverIn} currency={currency}/>}{!!row.scheduled && <small className="budget-rollover">{t('{amount} recurring', { amount: formatMoney(row.scheduled, currency, locale) })}</small>}</span>{row.rollover && <RefreshCw size={13} aria-label={t('Rollover')}/>}
   </button>
   {!unplanned && <BudgetState row={row} due={tools.dueOf(row)} today={tools.today} currency={currency}/>}
   <span className="budget-cell budget-planned" data-label={t('Planned')}>{tools.renderPlanned(row)}</span>
   <span className="budget-cell budget-actual" data-label={t('Actual')}>{formatMoney(row.actual, currency, locale)}</span>
   <span className="budget-cell budget-remaining"><RemainingPill value={unplanned ? null : row.remaining} direction={row.direction} currency={currency}/></span>
   <RowEnd>{tools.rowMenu?.(row)}</RowEnd>
  </SortableItem>)}
 </SortableList>;
}

type GroupProps = { group: BudgetGroup; tools: BudgetRowTools; open: boolean; onToggle: () => void; showUnbudgeted: boolean; onShowUnbudgeted: () => void; header?: ReactNode;
 /** Money the group itself carries in (the Flexible bucket in flex mode), and its settings. */
 rolloverIn?: number; onGroupSettings?: () => void;
 /** Categories only, without the heading row and its totals: the section's total row sums them. Spending without a plan
  * is then set apart as Unplanned, with its total and `onPlanUnplanned` in its heading. */
 bare?: boolean; onPlanUnplanned?: (rows: BudgetRow[]) => void };

/** One list of categories, those with nothing planned and nothing recorded behind a toggle; unless `bare`, a collapsible
 * heading row carries its total (the Flexible bucket). */
export function BudgetGroupCard({ group, tools, open, onToggle, showUnbudgeted, onShowUnbudgeted, header, rolloverIn = 0, onGroupSettings, bare = false, onPlanUnplanned }: GroupProps) {
 const { t, locale } = useLanguage();
 const { currency } = tools;
 const hidden = group.rows.filter(isUnbudgeted);
 const visible = showUnbudgeted ? group.rows : group.rows.filter(row => !isUnbudgeted(row));
 const id = group.direction + '-' + (group.type ?? 'all');
 // The bucket plans its categories together, so none of them is unplanned.
 const { planned, unplanned, total } = bare ? splitUnplanned(visible) : { planned: visible, unplanned: [], total: 0 };
 return <section className="budget-group" data-open={open || undefined}>
  {!bare && <div className="budget-row budget-group-row">
   <span className="budget-group-name">
    <button type="button" className="budget-group-toggle" aria-expanded={open} onClick={onToggle}>{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>{t(group.name)}{rolloverIn !== 0 && <RolledOver amount={rolloverIn} currency={currency}/>}</span></button>
    {onGroupSettings && <Button type="button" variant="ghost" size="icon-xs" aria-label={t('Category settings: {name}', { name: t(group.name) })} onClick={onGroupSettings}><Settings2/></Button>}
   </span>
   <span className="budget-cell budget-planned" data-label={t('Planned')}>{header ?? (group.missing ? '—' : <RollingText text={formatMoney(group.budget, currency, locale)}/>)}</span>
   <span className="budget-cell budget-actual" data-label={t('Actual')}><RollingText text={formatMoney(group.actual, currency, locale)}/></span>
   <span className="budget-cell budget-remaining"><RemainingPill value={group.missing ? null : group.remaining} direction={group.direction} currency={currency}/></span>
   <RowEnd/>
  </div>}
  {open && <>
   <CategoryRows id={'budget-' + id} rows={planned} tools={tools}/>
   {unplanned.length > 0 && <>
    <div className="budget-subhead">
     <h3>{t('Unplanned')}<Count value={unplanned.length}/></h3>
     <strong><RollingText text={formatMoney(total, currency, locale)}/></strong>
     {onPlanUnplanned && <Button type="button" variant="outline" size="sm" onClick={() => onPlanUnplanned(unplanned)}>{t('Plan these')}</Button>}
    </div>
    <CategoryRows id={'budget-unplanned-' + id} rows={unplanned} tools={tools} unplanned/>
   </>}
   {hidden.length > 0 && <button type="button" className="budget-unbudgeted" onClick={onShowUnbudgeted}>{showUnbudgeted ? <EyeOff size={14}/> : <Eye size={14}/>}{t(showUnbudgeted ? 'Collapse {count} unbudgeted' : 'Show {count} unbudgeted', { count: hidden.length })}</button>}
  </>}
 </section>;
}

/** The last column of every budget row: a category's ⋯ menu, empty elsewhere so the columns line up. */
function RowEnd({ children }: { children?: ReactNode }) {
 return <span className="budget-row-end">{children}</span>;
}

/** "+$40 rolled over" under a name: money a rollover fund brings into this month. */
function RolledOver({ amount, currency }: { amount: number; currency: string }) {
 const { t, locale } = useLanguage();
 return <small className="budget-rollover">{t('{amount} rolled over', { amount: formatSignedMoney(amount, currency, locale) })}</small>;
}

/** One side of the budget as a card: its title with the month so far beside it ("$4,121 of $20,550 received"), the
 * column names, its rows and its total. `columns` names the figure columns; the default is Planned, Actual, Remaining. */
export function BudgetSection({ section, title, summary, columns, children }: { section: 'income' | 'expenses' | 'contributions'; title: string; summary?: ReactNode; columns?: ReactNode; children: ReactNode }) {
 const { t } = useLanguage();
 return <section className="budget-section" data-section={section} aria-label={title}>
  <PanelTitle title={title}>{summary && <span className="budget-section-sum">{summary}</span>}</PanelTitle>
  <div className="budget-row budget-section-header" aria-hidden="true">{columns ?? <><span className="budget-cell budget-planned">{t('Planned')}</span><span className="budget-cell budget-actual">{t('Actual')}</span><span className="budget-cell budget-remaining">{t('Remaining')}</span></>}</div>
  {children}
 </section>;
}

/** A section's totals. A null plan could not be converted: it and the remaining read —. */
export function BudgetTotalRow({ label, planned, actual, remaining, direction, currency }: { label: string; planned: number | null; actual: number; remaining: number | null; direction: BudgetRow['direction']; currency: string }) {
 const { t, locale } = useLanguage();
 return <div className="budget-row budget-total-row"><span className="budget-total-name">{label}</span><span className="budget-cell budget-planned" data-label={t('Planned')}>{planned === null ? '—' : <RollingText text={formatMoney(planned, currency, locale)}/>}</span><span className="budget-cell budget-actual" data-label={t('Actual')}><RollingText text={formatMoney(actual, currency, locale)}/></span><span className="budget-cell budget-remaining"><RemainingPill value={remaining} direction={direction} currency={currency}/></span></div>;
}

/** Amounts no rate converts: plans read — (`planned` counts them) and transactions are left out of the actuals (`actual`). */
export function BudgetRateNotice({ planned, actual }: { planned: number; actual: number }) {
 const { t } = useLanguage();
 if (!planned && !actual) return null;
 return <>
  {planned > 0 && <p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
  {actual > 0 && <p role="status" className="muted">{t('Some currencies could not be converted and are excluded from totals.')}</p>}
 </>;
}
