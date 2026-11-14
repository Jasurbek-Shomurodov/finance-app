"use client";
import { useMemo, useState, type ReactNode } from 'react';
import { BudgetGroupCard, BudgetSection, BudgetTotalRow, type BudgetRowTools } from '@/components/budget/budget-rows';
import { ContributionSection } from '@/components/budget/contribution-rows';
import { PlanUnplannedDialog, SpendingPaceCard } from '@/components/budget/budget-lazy';
import { LeftToBudgetCard, type BudgetFocus } from '@/components/budget/left-to-budget-card';
import type { BudgetFigures } from '@/components/budget/settings-dialogs';
import { useLanguage } from '@/components/language-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useGoalOrder } from '@/hooks/use-goal-order';
import type { BudgetGroup, BudgetRow, LeftToBudget } from '@/lib/budget';
import { dueByCategory, spendingPace, unplannedSuggestion } from '@/lib/budget-view';
import { monthEnd } from '@/lib/calendar-days';
import { formatMoney } from '@/lib/format';
import { upcomingPayments, type Goal, type PlanningData } from '@/lib/planning';
import type { TransactionSplit } from '@/lib/transaction-tools';

/** The Flexible bucket in flex mode: its plan, the money it carries in, the field that edits the plan and its settings. */
export type FlexBucket = { budget: number | null; rollover: number | null; header: ReactNode; onSettings: (figures: BudgetFigures) => void };
type Props = { month: string; today: string; currency: string; rates?: number | Record<string, number>; data: PlanningData; splits: TransactionSplit[];
 rows: BudgetRow[]; groups: BudgetGroup[]; left: LeftToBudget; bucket: FlexBucket | null;
 /** Goals with a contribution this month, what each comes to in the display currency, and their total (null without a rate). */
 goals: Goal[]; contributionOf: (goal: Goal) => number | null; contributions: number | null;
 tools: Omit<BudgetRowTools, 'dueOf' | 'today' | 'currency'>;
 /** A category's monthly average, for the amount Plan these suggests. */ averageOf: (key: string) => number; side?: ReactNode };

const sum = (list: BudgetGroup[], key: 'budget' | 'actual') => list.reduce((total, group) => total + group[key], 0);
const toggled = (set: Set<string>, id: string) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; };

/** One month of the budget: Income, Expenses and Goal contributions as cards of rows, with Left to budget, the spending
 * pace and `side` beside them. Summary shows every section; Income or Expenses in the Left to budget card narrows the list. */
export function BudgetMonth({ month, today, currency, rates, data, splits, rows, groups, left, bucket, goals, contributionOf, contributions, tools, averageOf, side }: Props) {
 const { t, locale } = useLanguage();
 const { user, demo, readOnly, planning, netWorth, workspacePreferences, budget } = useWorkspace();
 const [focus, setFocus] = useState<BudgetFocus>('summary');
 const [closed, setClosed] = useState<Set<string>>(new Set());
 const [unbudgeted, setUnbudgeted] = useState<Set<string>>(new Set());
 const [toPlan, setToPlan] = useState<BudgetRow[] | null>(null);
 const flex = budget.state.mode === 'flex';
 const money = (value: number) => formatMoney(value, currency, locale);
 // Each category's first open scheduled date this month, as Recurring counts them.
 const due = useMemo(() => dueByCategory(upcomingPayments(planning.data.records, planning.data.occurrences, today, monthEnd(month)), month), [planning.data.records, planning.data.occurrences, today, month]);
 const rowTools: BudgetRowTools = { ...tools, currency, today, dueOf: row => due.get(row.key) };
 // Contributions list in the order Goals keeps; the saved order holds every goal, shown here or not.
 const goalOrder = useGoalOrder(data.goals, workspacePreferences, demo ? null : user, demo);
 const shown = new Set(goals.map(goal => goal.id)), orderedGoals = goalOrder.goals.filter(goal => shown.has(goal.id));
 const excluded = useMemo(() => new Set(rows.filter(row => row.excluded).map(row => row.key)), [rows]);
 const pace = useMemo(() => month.slice(0, 7) > today.slice(0, 7) ? null : spendingPace(data, splits, month, left.expenses, { currency, today, rates, excluded }), [data, splits, month, left.expenses, currency, today, rates, excluded]);

 const card = (group: BudgetGroup) => {
  const id = group.direction + ':' + group.name;
  const isBucket = flex && group.type === 'flexible' && !!bucket;
  const missing = isBucket && (bucket.budget === null || bucket.rollover === null);
  const figures = isBucket ? { budget: bucket.budget, rolloverIn: bucket.rollover ?? 0, rolloverMissing: bucket.rollover === null, actual: group.actual, remaining: missing ? null : (bucket.budget ?? 0) + (bucket.rollover ?? 0) - group.actual } : null;
  // Only the Flexible bucket keeps a heading row: it carries the plan its categories share.
  return <BudgetGroupCard key={id} bare={!figures} group={figures ? { ...group, budget: figures.budget ?? 0, remaining: figures.remaining ?? 0, missing: group.missing + (missing ? 1 : 0) } : group} tools={rowTools}
   open={!figures || !closed.has(id)} onToggle={() => setClosed(toggled(closed, id))} showUnbudgeted={unbudgeted.has(id)} onShowUnbudgeted={() => setUnbudgeted(toggled(unbudgeted, id))}
   rolloverIn={figures?.rolloverIn} onGroupSettings={figures ? () => bucket!.onSettings(figures) : undefined} header={figures ? bucket!.header : undefined} onPlanUnplanned={readOnly ? undefined : setToPlan}/>;
 };
 const income = groups.filter(group => group.direction === 'income'), spending = groups.filter(group => group.direction === 'expense');
 // A section's plan is unknown (—) while one of its amounts has no usable rate.
 const incomePlanned = income.some(group => group.missing) ? null : sum(income, 'budget');
 // Like each group's Planned figure and the Expenses tab, the total adds the money rolled over: one figure (`leftToBudget`).
 const spendingPlanned = left.expenses === null || left.rollover === null || spending.some(group => group.missing) ? null : left.expenses + left.rollover;
 const so = (list: BudgetGroup[], planned: number | null, key: string) => planned === null ? money(sum(list, 'actual')) : t(key, { amount: money(sum(list, 'actual')), total: money(planned) });

 return <div className="budget-layout">
  <div className="budget-table" data-focus={focus}>
   <BudgetSection section="income" title={t('Income')} summary={so(income, incomePlanned, '{amount} of {total} received')}>
    {income.map(card)}
    <BudgetTotalRow label={t('Total income')} planned={incomePlanned} actual={sum(income, 'actual')} remaining={incomePlanned === null ? null : incomePlanned - sum(income, 'actual')} direction="income" currency={currency}/>
   </BudgetSection>
   <BudgetSection section="expenses" title={t('Expenses')} summary={so(spending, spendingPlanned, '{amount} of {total} spent')}>
    {spending.map(card)}
    <BudgetTotalRow label={t('Total expenses')} planned={spendingPlanned} actual={sum(spending, 'actual')} remaining={spendingPlanned === null ? null : spendingPlanned - sum(spending, 'actual')} direction="expense" currency={currency}/>
   </BudgetSection>
   {orderedGoals.length > 0 && <ContributionSection goals={orderedGoals} data={data} currency={currency} rates={rates} netWorth={netWorth} amountOf={contributionOf} total={contributions}
    onMove={(id, target, visible) => void goalOrder.reorder(id, target, visible)} moveDisabled={readOnly || goalOrder.disabled}/>}
  </div>
  <div className="budget-side">
   <LeftToBudgetCard left={left} rows={rows} mode={budget.state.mode} currency={currency} tab={focus} onTab={setFocus}/>
   {pace && <SpendingPaceCard pace={pace} plan={left.expenses} currency={currency}/>}
   {side}
  </div>
  <ErrorPopup message={goalOrder.error}/>
  {toPlan && <PlanUnplannedDialog rows={toPlan} currency={currency} suggest={row => unplannedSuggestion(row.actual, averageOf(row.key))} onClose={() => setToPlan(null)}
   onSave={async plans => { if (plans.length) await budget.saveAmounts(month, currency, plans.map(plan => ({ category_key: plan.key, amount: plan.amount, applies_forward: budget.state.applyForward }))); }}/>}
 </div>;
}
