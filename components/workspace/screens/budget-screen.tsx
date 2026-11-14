"use client";
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Settings, Workflow } from 'lucide-react';
import { BudgetMonth } from '@/components/budget/budget-month';
import { BudgetRateNotice, useCategoryName } from '@/components/budget/budget-rows';
import { BudgetYear } from '@/components/budget/budget-year';
import { PlannedInput } from '@/components/budget/planned-input';
import { AgeOfMoneyTile } from '@/components/budget/age-of-money-tile';
import { BudgetSettingsDialog, CategoryDetailsDialog, CategorySettingsDialog } from '@/components/budget/budget-lazy';
import type { BudgetFigures } from '@/components/budget/settings-dialogs';
import { useLanguage } from '@/components/language-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { TodayButton } from '@/components/presentation-foundation/today-button';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { BudgetSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { RowMenu } from '@/components/presentation-foundation/row-menu';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useDisplayOrder } from '@/hooks/use-display-order';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { useInsightHistory } from '@/hooks/use-subscriptions';
import { appliesToFutureMonths, budgetCategories, budgetHistory, budgetReadRange, budgetRows, budgetRowsForMode, flexBucketCategory, flexBucketKey, flexBucketRollover, goalContribution, isFlexibleCategory, knownPlan, leftToBudget, monthActuals, monthsBetween, recalculationTargets, sectionGroups, type BudgetCategory, type BudgetRow } from '@/lib/budget';
import { categoryBills, firstRecentPayment, flexPlan, plannedIn, type PlanSource } from '@/lib/budget-schedules';
import { shiftMonth } from '@/lib/calendar-days';
import { depositMonth, depositToday } from '@/lib/deposit-interest';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { showError } from '@/lib/feedback';
import { formatMonthYear, formatYear } from '@/lib/format';
import { periodMonths } from '@/lib/cash-flow-report';
import { convertAmount, marketRates } from '@/lib/market';
import { emptyPlanning } from '@/lib/planning';

export function BudgetScreen() {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 // The workspace's one Budget: a change here reaches the forecasts on Overview, Cash flow and Goals at once.
 const { user, demo, reload, refreshRecords, currency, market, planning, transactionTools, workspacePreferences, workspaceLoading, budget, addCashFlow, editRecord, archiveSchedule, readOnly, setSankey } = useWorkspace();
 const today = depositToday(), thisMonth = depositMonth();
 const [month, setMonth] = useState(thisMonth);
 const [view, setView] = useState<'month' | 'year'>('month');
 const [editing, setEditing] = useState<{ category: BudgetCategory; figures?: BudgetFigures } | null>(null);
 const [settingsOpen, setSettingsOpen] = useState(false);
 const [viewing, setViewing] = useState<BudgetRow | null>(null);
 const rates = marketRates(market);
 const live = !!user && !demo;
 const removed = planning.data.removedKinds ?? [];

 const settingsOnly = budgetCategories(planning.data.categories, budget.state.categories, removed);
 const range = budgetReadRange(month, view, [...settingsOnly, flexBucketCategory(budget.state.categories)]);
 // The range follows the rollover funds, so the read waits for the saved budget rather than starting twice.
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${range.to}&from=${range.from}`, user, live && !budget.loading, reload, emptyPlanning);
 // Age of Money is today's figure: it reads its own history, whichever month the page shows.
 const ageHistory = useInsightHistory(user, demo, reload, planning.data.records, view === 'month');
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : planning.data, [live, remote.data, planning.data]);
 const splits = transactionTools.data.splits;
 const history = useMemo(() => new Map(monthsBetween(range.from, range.to).map(item => [item, monthActuals(data, splits, item, currency, today, rates)])), [range.from, range.to, data, splits, currency, today, rates]);
 // Categories list in the person's own order, the one Settings › Categories keeps: a row dragged here moves there too.
 const order = useDisplayOrder('category_order', budgetCategories(data.categories, budget.state.categories, removed).map(category => ({ ...category, id: category.key })), workspacePreferences, demo ? null : user, demo);
 const categories = order.items;
 const flex = budget.state.mode === 'flex';
 // Every plan on the page (rows, the bucket, rollover, History) reads the saved amounts with the recurring bills.
 const plan: PlanSource = { amounts: budget.state.amounts, schedules: planning.data.records };
 const categoryRows = budgetRows(categories, plan.amounts, history, month, currency, rates, plan.schedules);
 const flexBudget = flex ? flexPlan(plan, categories, month, currency, rates) : null;
 const bucket = flexBucketCategory(budget.state.categories);
 const bucketRollover = flex ? flexBucketRollover(bucket, categories, { plan, history, currency, rates }, month) : 0;
 const rows = budgetRowsForMode(categoryRows, budget.state.mode);
 const groups = sectionGroups(rows, flex);
 const goals = data.goals.filter(goal => goalContribution(goal, today) > 0);
 const contributionOf = (goal: (typeof goals)[number]) => convertAmount(goalContribution(goal, today), goal.currency ?? currency, currency, rates);
 // A contribution no rate converts leaves the total unknown, never counted as zero.
 const missingContributions = goals.filter(goal => contributionOf(goal) === null).length;
 const contributions = missingContributions ? null : goals.reduce((sum, goal) => sum + (contributionOf(goal) ?? 0), 0);
 const left = leftToBudget(rows, budget.state.mode, flex ? { budget: flexBudget, rollover: bucketRollover } : null, contributions, missingContributions);

 const save = (key: string) => (amount: number, forward: boolean) => budget.saveAmount(key, month, amount, currency, forward);
 const repeat = (key: string) => (amount: number, forward: boolean) => budget.saveRepeat(key, month, amount, currency, forward);
 const historyOf = (key: string) => {
  if (key !== flexBucketKey) return budgetHistory(key, month, history, past => plannedIn(plan, key, past, currency, rates));
  // The Flexible bucket's history is the sum of its categories.
  const keys = rows.filter(isFlexibleCategory).map(row => row.key);
  return budgetHistory(keys, month, history, past => flexPlan(plan, categories, past, currency, rates));
 };
 // In flex mode a flexible category has no plan of its own; the bucket above it holds the amount.
 // A row opens its category's details: what it planned and spent, its history and its bills.
 const planned = (row: BudgetRow) => flex && row.direction === 'expense' && row.type === 'flexible' ? <span className="budget-pill">—</span> : <PlannedInput key={row.key + month + (row.budget ?? 0)} label={t('Planned for {name}', { name: name(row) })} value={knownPlan(row)} history={historyOf(row.key)} direction={row.direction} currency={currency} defaultForward={budget.state.applyForward} appliesForward={appliesToFutureMonths(budget.state.amounts, row.key, month)} onSave={save(row.key)} onRepeat={repeat(row.key)}/>;
 // A custom category has at most one recurring bill (migration 137): its details list it, Make recurring creates it
 // in this category at this month's planned amount (else what it spent), starting at the first of the payments already
 // made month after month, which then settle it. A built-in kind starts today: it is too broad to take a history.
 // The category's running bills, as Budget and Recurring count them (`categoryBills`): one at most for a custom category.
 const billsOf = (row: BudgetRow) => categoryBills(planning.data.records, row.key);
 const makeRecurring = (row: BudgetRow) => {
  const kind = row.custom ? 'Other expense' : row.key as Entry['kind'], custom = row.custom ? row.key : null;
  addCashFlow(kind, 'Monthly', { name: name(row), amount: Math.round(row.budget || row.actual), custom_category_id: custom, date: (custom && firstRecentPayment(data.records, custom, today)) || today });
 };
 const edit = (row: BudgetRow) => setEditing({ category: row, figures: row.direction === 'expense' ? row : undefined });
 // Stop recurring archives the category's bills as Recurring does: their payments stay, and Recurring › Archived restores them.
 const stopRecurring = (bills: Entry[]) => void Promise.all(bills.map(bill => archiveSchedule({ source: 'record', record: bill }, true))).catch(error => showError((error as Error).message));
 const rowMenu = (row: BudgetRow) => {
  const bills = row.direction === 'expense' && !readOnly ? billsOf(row) : null;
  return <RowMenu label={t('Actions for {name}', { name: name(row) })} items={[
   { label: t('Edit'), onSelect: () => edit(row) },
   bills && (bills.length ? { label: t('Stop recurring'), onSelect: () => stopRecurring(bills) } : { label: t('Make recurring'), onSelect: () => makeRecurring(row) }),
  ]}/>;
 };
 async function recalculate() {
  const targets = ready ? recalculationTargets(rows, month, history, flex) : [];
  if (targets.length) await budget.saveAmounts(month, currency, targets.map(target => ({ category_key: target.key, amount: target.amount, applies_forward: true })));
 }
 const bucketCard = flex ? { budget: flexBudget, rollover: bucketRollover, onSettings: (figures: BudgetFigures) => setEditing({ category: bucket, figures }),
  header: <PlannedInput key={'flex' + month + (flexBudget ?? 0)} label={t('Planned for {name}', { name: t('Flexible') })} value={flexBudget} history={historyOf(flexBucketKey)} direction="expense" currency={currency} defaultForward={budget.state.applyForward} appliesForward={appliesToFutureMonths(budget.state.amounts, flexBucketKey, month)} onSave={save(flexBucketKey)} onRepeat={repeat(flexBucketKey)}/> } : null;
 // The plans read the schedules and the actuals the splits, so the page waits for both and says when one failed.
 const loading = workspaceLoading || budget.loading || planning.loading || transactionTools.loading || (live && remote.initialLoading);
 const error = budget.error || planning.error || transactionTools.error || (live ? remote.error : '');
 const ready = !loading && !error;

 return <div data-page="Budget" className="content budget-content">
  <PageHeader title={t('Budget')} tabs={<Segmented className="page-tabs" as="nav" label={t('Budget view')} options={[{ value: 'month', label: t('Month') }, { value: 'year', label: t('Year') }] as const} value={view} onChange={setView}/>} hint={t(view === 'year' ? 'Past months show actual amounts with the plan below; later months show the plan.' : 'Plan what you expect to earn and spend each month. Actual amounts come from your transactions; remaining is the difference.')}>
   <div className="budget-month-nav">
    <Button variant="outline" size="icon" aria-label={t(view === 'year' ? 'Previous year' : 'Previous month')} onClick={() => setMonth(shiftMonth(month, view === 'year' ? -12 : -1))}><ChevronLeft size={16}/></Button>
    {/* The period being planned, between the arrows that move it. */}
    <strong className="budget-period" aria-live="polite">{view === 'year' ? formatYear(Number(month.slice(0, 4)), locale) : formatMonthYear(month, locale)}</strong>
    <Button variant="outline" size="icon" aria-label={t(view === 'year' ? 'Next year' : 'Next month')} onClick={() => setMonth(shiftMonth(month, view === 'year' ? 12 : 1))}><ChevronRight size={16}/></Button>
    <TodayButton current={month === thisMonth} onClick={() => setMonth(thisMonth)}/>
   </div>
   {/* The period's money as a Sankey: income by category into what was spent and what is left. */}
   <Button variant="outline" onClick={() => setSankey({ target: { side: 'cashflow' }, title: t('Money flow'), month, months: view === 'year' ? periodMonths(month, 'year') : undefined, period: view === 'year' ? formatYear(Number(month.slice(0, 4)), locale) : undefined })}><Workflow size={16} aria-hidden="true"/>{t('Money flow')}</Button>
   <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings size={16} aria-hidden="true"/>{t('Settings')}</Button>
  </PageHeader>
  {view === 'month' && <BudgetRateNotice planned={left.missing} actual={history.get(month)?.missing ?? 0}/>}
  {error ? <InlineError message={t(error)} onRetry={refreshRecords}/> : loading ? (view === 'year' ? <PanelSkeleton label={t('Loading records…')} rows={6}/> : <BudgetSkeleton label={t('Loading records…')}/>) : view === 'year' ? <BudgetYear rows={categories} mode={budget.state.mode} month={month} history={history} amounts={budget.state.amounts} schedules={planning.data.records} currency={currency} rates={rates} today={today}/> : <BudgetMonth month={month} today={today} currency={currency} rates={rates} data={data} splits={splits} rows={rows} groups={groups} left={left} bucket={bucketCard}
   goals={goals} contributionOf={contributionOf} contributions={contributions} averageOf={key => historyOf(key).average}
   tools={{ renderPlanned: planned, rowMenu, onOpen: setViewing, onMove: (id, target, visible) => void order.reorder(id, target, visible), moveDisabled: readOnly || order.disabled }}
   side={<AgeOfMoneyTile records={ageHistory.records} accounts={planning.data.records} currency={currency} today={today} rates={rates}/>}/>}
  <ErrorPopup message={order.error}/>
  {editing && <CategorySettingsDialog category={editing.category} figures={editing.figures} month={month} currency={currency} onSave={budget.saveCategory} onClose={() => setEditing(null)}/>}
  {viewing && <CategoryDetailsDialog row={rows.find(row => row.key === viewing.key) ?? viewing} history={historyOf(viewing.key)} data={data} splits={splits} bills={viewing.direction === 'expense' ? billsOf(viewing) : []} month={month} today={today} currency={currency} rates={rates} onEditBill={readOnly ? undefined : bill => { setViewing(null); editRecord(bill); }} onClose={() => setViewing(null)}/>}
  {settingsOpen && <BudgetSettingsDialog mode={budget.state.mode} applyForward={budget.state.applyForward} onSave={budget.saveSettings} onRecalculate={recalculate} canRecalculate={ready} onClose={() => setSettingsOpen(false)}/>}
 </div>;
}
