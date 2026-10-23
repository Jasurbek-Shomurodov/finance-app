"use client";
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Settings, Workflow } from 'lucide-react';
import { BudgetGroupCard, BudgetProgress, BudgetRateNotice, BudgetSectionHeader, BudgetTotalRow, ContributionRows, useCategoryName } from '@/components/budget/budget-rows';
import { LeftToBudgetCard, type BudgetFocus } from '@/components/budget/left-to-budget-card';
import { PlannedInput } from '@/components/budget/planned-input';
import { AgeOfMoneyTile } from '@/components/budget/age-of-money-tile';
import { CategoryDetailsDialog } from '@/components/budget/category-details';
import { BudgetSettingsDialog, CategorySettingsDialog, type BudgetFigures } from '@/components/budget/settings-dialogs';
import { useLanguage } from '@/components/language-provider';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { TodayButton } from '@/components/presentation-foundation/today-button';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { BudgetSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { RowMenu } from '@/components/presentation-foundation/row-menu';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { signTone } from '@/components/presentation-foundation/tone';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { appliesToFutureMonths, budgetCategories, budgetHistory, budgetOverall, budgetReadRange, budgetRows, budgetRowsForMode, flexBucketCategory, flexBucketKey, flexBucketRollover, goalContribution, isFlexibleCategory, knownPlan, leftToBudget, monthActuals, monthsBetween, sectionGroups, suggestedBudget, type BudgetAmount, type BudgetCategory, type BudgetMode, type BudgetOverall, type BudgetRow, type MonthActuals } from '@/lib/budget';
import { categoryBills, firstRecentPayment, flexPlan, plannedIn, type PlanSource } from '@/lib/budget-schedules';
import { shiftMonth } from '@/lib/calendar-days';
import { depositMonth, depositToday } from '@/lib/deposit-interest';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { showError } from '@/lib/feedback';
import { formatMoney, formatMonthShort, formatMonthYear, formatYear } from '@/lib/format';
import { periodMonths } from '@/lib/cash-flow-report';
import { convertAmount, marketRates } from '@/lib/market';
import { emptyPlanning } from '@/lib/planning';

export function BudgetScreen() {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 // The workspace's one Budget: a change here reaches the forecasts on Overview, Cash flow and Goals at once.
 const { user, demo, reload, currency, market, planning, transactionTools, workspaceLoading, budget, addCashFlow, editRecord, archiveSchedule, readOnly, setSankey } = useWorkspace();
 const today = depositToday(), thisMonth = depositMonth();
 const [month, setMonth] = useState(thisMonth);
 const [view, setView] = useState<'month' | 'year'>('month');
 const [focus, setFocus] = useState<BudgetFocus>('summary');
 const [closed, setClosed] = useState<Set<string>>(new Set());
 const [unbudgeted, setUnbudgeted] = useState<Set<string>>(new Set());
 const [editing, setEditing] = useState<{ category: BudgetCategory; figures?: BudgetFigures } | null>(null);
 const [settingsOpen, setSettingsOpen] = useState(false);
 const [viewing, setViewing] = useState<BudgetRow | null>(null);
 const rates = marketRates(market);
 const live = !!user && !demo;
 const removed = planning.data.removedKinds ?? [];

 const settingsOnly = budgetCategories(planning.data.categories, budget.state.categories, removed);
 const range = budgetReadRange(month, view, [...settingsOnly, flexBucketCategory(budget.state.categories)]);
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${range.to}&from=${range.from}`, user, live, reload, emptyPlanning);
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : planning.data, [live, remote.data, planning.data]);
 const splits = transactionTools.data.splits;
 const history = useMemo(() => new Map(monthsBetween(range.from, range.to).map(item => [item, monthActuals(data, splits, item, currency, today, rates)])), [range.from, range.to, data, splits, currency, today, rates]);
 const categories = budgetCategories(data.categories, budget.state.categories, removed);
 const flex = budget.state.mode === 'flex';
 // Every plan on the page (rows, the bucket, rollover, History) reads the saved amounts with the recurring bills.
 const plan: PlanSource = { amounts: budget.state.amounts, schedules: planning.data.records };
 const categoryRows = budgetRows(categories, plan.amounts, history, month, currency, rates, plan.schedules);
 const flexBudget = flex ? flexPlan(plan, categories, month, currency, rates) : null;
 const bucket = flexBucketCategory(budget.state.categories);
 const bucketRollover = flex ? flexBucketRollover(bucket, categories, { plan, history, currency, rates }, month) : 0;
 const bucketMissing = flex && (flexBudget === null || bucketRollover === null);
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
  const targets = rows.filter(row => !row.excluded).map(row => ({ key: row.key, amount: suggestedBudget(budgetHistory(row.key, month, history).average) })).filter(item => item.amount > 0);
  if (flex) targets.push({ key: flexBucketKey, amount: suggestedBudget(historyOf(flexBucketKey).average) });
  if (targets.length) await budget.saveAmounts(month, currency, targets.map(target => ({ category_key: target.key, amount: target.amount, applies_forward: true })));
 }
 const toggle = (set: Set<string>, update: (next: Set<string>) => void, id: string) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); update(next); };
 const card = (group: (typeof groups)[number]) => {
  const id = group.direction + ':' + group.name;
  const isBucket = flex && group.type === 'flexible';
  const bucketRow = isBucket ? { budget: flexBudget, rolloverIn: bucketRollover ?? 0, rolloverMissing: bucketRollover === null, actual: group.actual, remaining: bucketMissing ? null : (flexBudget ?? 0) + (bucketRollover ?? 0) - group.actual } : null;
  // Only the Flexible bucket keeps a heading row: it carries the plan its categories share.
  return <BudgetGroupCard key={id} bare={!isBucket} group={bucketRow ? { ...group, budget: bucketRow.budget ?? 0, remaining: bucketRow.remaining ?? 0, missing: group.missing + (bucketMissing ? 1 : 0) } : group} currency={currency}
   open={!isBucket || !closed.has(id)} onToggle={() => toggle(closed, setClosed, id)} showUnbudgeted={unbudgeted.has(id)} onShowUnbudgeted={() => toggle(unbudgeted, setUnbudgeted, id)}
   renderPlanned={planned} rowMenu={rowMenu} onOpen={setViewing}
   rolloverIn={bucketRow?.rolloverIn} onGroupSettings={bucketRow ? () => setEditing({ category: bucket, figures: bucketRow }) : undefined}
   header={bucketRow ? <PlannedInput key={'flex' + month + (flexBudget ?? 0)} label={t('Planned for {name}', { name: t('Flexible') })} value={flexBudget} history={historyOf(flexBucketKey)} direction="expense" currency={currency} defaultForward={budget.state.applyForward} appliesForward={appliesToFutureMonths(budget.state.amounts, flexBucketKey, month)} onSave={save(flexBucketKey)} onRepeat={repeat(flexBucketKey)}/> : undefined}/>;
 };
 const income = groups.filter(group => group.direction === 'income');
 const spending = groups.filter(group => group.direction === 'expense');
 const sum = (list: typeof groups, key: 'budget' | 'actual') => list.reduce((total, group) => total + group[key], 0);
 // A section's plan is unknown (—) while one of its amounts has no usable rate.
 const planOf = (list: typeof groups) => list.some(group => group.missing) ? null : sum(list, 'budget');
 // Like each group's Planned figure and the Expenses tab, the total adds the money rolled over: one figure (`leftToBudget`).
 const spendingPlanned = left.expenses === null || left.rollover === null || spending.some(group => group.missing) ? null : left.expenses + left.rollover;
 const incomePlanned = planOf(income);
 const loading = workspaceLoading || budget.loading || (live ? remote.initialLoading : planning.loading);
 const error = budget.error || (live ? remote.error : planning.error);

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
  <BudgetRateNotice planned={left.missing} actual={history.get(month)?.missing ?? 0}/>
  {error ? <InlineError message={t(error)} onRetry={() => { budget.retry(); remote.retry(); }}/> : loading ? (view === 'year' ? <PanelSkeleton label={t('Loading records…')} rows={6}/> : <BudgetSkeleton label={t('Loading records…')}/>) : view === 'year' ? <BudgetYear rows={categories} mode={budget.state.mode} month={month} history={history} amounts={budget.state.amounts} schedules={planning.data.records} currency={currency} rates={rates} today={today}/> : <div className="budget-layout">
   {/* Summary shows every section; Income or Expenses in the Left to budget card narrows the list to that side. */}
   <div className="budget-table" data-focus={focus}>
    <div className="budget-section" data-section="income">
    <BudgetSectionHeader title={t('Income')}/>
    {income.map(card)}
    <BudgetTotalRow label={t('Total income')} planned={incomePlanned} actual={sum(income, 'actual')} remaining={incomePlanned === null ? null : incomePlanned - sum(income, 'actual')} direction="income" currency={currency}/>
    </div>
    <div className="budget-section" data-section="expenses">
    <BudgetSectionHeader title={t('Expenses')}/>
    {spending.map(card)}
    <BudgetTotalRow label={t('Total expenses')} planned={spendingPlanned} actual={sum(spending, 'actual')} remaining={spendingPlanned === null ? null : spendingPlanned - sum(spending, 'actual')} direction="expense" currency={currency}/>
    {goals.length > 0 && <>
     <BudgetSectionHeader title={t('Contributions')}/>
     <ContributionRows goals={goals} currency={currency} amountOf={contributionOf}/>
     <BudgetTotalRow label={t('Total contributions')} planned={contributions} actual={0} remaining={contributions} direction="income" currency={currency}/>
    </>}
    </div>
   </div>
   <div className="budget-side">
    <LeftToBudgetCard left={left} rows={rows} mode={budget.state.mode} currency={currency} tab={focus} onTab={setFocus}/>
    <AgeOfMoneyTile records={data.records} currency={currency} today={today} rates={rates}/>
   </div>
  </div>}
  {editing && <CategorySettingsDialog category={editing.category} figures={editing.figures} month={month} currency={currency} onSave={budget.saveCategory} onClose={() => setEditing(null)}/>}
  {viewing && <CategoryDetailsDialog row={rows.find(row => row.key === viewing.key) ?? viewing} history={historyOf(viewing.key)} data={data} splits={splits} bills={viewing.direction === 'expense' ? billsOf(viewing) : []} month={month} today={today} currency={currency} rates={rates} onEditBill={readOnly ? undefined : bill => { setViewing(null); editRecord(bill); }} onClose={() => setViewing(null)}/>}
  {settingsOpen && <BudgetSettingsDialog mode={budget.state.mode} applyForward={budget.state.applyForward} onSave={budget.saveSettings} onRecalculate={recalculate} onClose={() => setSettingsOpen(false)}/>}
 </div>;
}

/** The Year view: every month of the year side by side. Past and current months show what happened; later months show the plan.
 * In flex mode the Flexible bucket is one line, planned as the Month view plans it (`flexPlan`), and its categories show only
 * what they spent (`budgetRowsForMode`), so the year's totals agree with each month's (MONEY-010). */
function BudgetYear({ rows, mode, month, history, amounts, schedules, currency, rates, today }: { rows: BudgetCategory[]; mode: BudgetMode; month: string; history: Map<string, MonthActuals>; amounts: BudgetAmount[]; schedules: Entry[]; currency: string; rates?: number | Record<string, number>; today: string }) {
 const { t, locale } = useLanguage();
 const name = useCategoryName();
 const months = monthsBetween(month.slice(0, 4) + '-01', month.slice(0, 4) + '-12');
 const current = today.slice(0, 7);
 const table = months.map(item => budgetRowsForMode(budgetRows(rows, amounts, history, item, currency, rates, schedules), mode));
 const flexible = mode === 'flex' ? months.map(item => flexPlan({ amounts, schedules }, rows, item, currency, rates)) : null;
 const bucketCell = (budget: number | null, list: BudgetRow[]): BudgetRow => { const actual = list.filter(isFlexibleCategory).reduce((sum, row) => sum + row.actual, 0); return { ...flexBucketCategory([]), budget, actual, rolloverIn: 0, remaining: budget === null ? null : budget - actual, progress: budget ? actual / budget : actual > 0 ? 1 : 0, missing: budget === null }; };
 const lines = [...rows.map((row, index) => ({ row, cells: table.map(list => list[index]) })), ...(flexible ? [{ row: flexBucketCategory([]), cells: flexible.map((budget, position) => bucketCell(budget, table[position])) }] : [])];
 // A row planned by the bucket (budget null, nothing missing) shows its spending alone; the rest hide until something is planned or spent.
 const own = (cell: BudgetRow) => cell.budget !== null || cell.missing;
 const visible = lines.filter(({ row, cells }) => !row.excluded && cells.some(cell => cell.budget || cell.actual || cell.missing));
 const overall = table.map((list, position) => { const sum = budgetOverall(list), bucket = flexible?.[position]; return bucket === undefined ? sum : bucket === null ? { ...sum, missing: sum.missing + 1 } : { ...sum, plannedExpenses: sum.plannedExpenses + bucket }; });
 // A plan no rate converts (budget null) reads —, and so does a total that would add it.
 const plan = (value: number | null) => value === null ? '—' : formatMoney(value, currency, locale);
 return <section className="panel budget-year">
  {visible.length ? <div className="budget-year-scroll"><table>
   <thead><tr><th scope="col">{t('Category')}</th>{months.map(item => <th scope="col" key={item} data-current={item === current || undefined}>{formatMonthShort(item, locale)}</th>)}<th scope="col">{t('Total')}</th></tr></thead>
   <tbody>{visible.map(({ row, cells }) => {
    const total = cells.reduce<number | null>((sum, cell, position) => { const value = months[position] <= current ? cell.actual : own(cell) ? cell.budget : 0; return sum === null || value === null ? null : sum + value; }, 0);
    return <tr key={row.key}>
     <th scope="row">{name(row)}</th>
     {cells.map((cell, position) => {
      const past = months[position] <= current;
      const marks = { 'data-future': !past || undefined, 'data-current': months[position] === current || undefined };
      if (!cell.actual && !cell.budget && !cell.missing) return <td key={months[position]} {...marks}>—</td>;
      return <td key={months[position]} {...marks}>
       <span>{past ? formatMoney(cell.actual, currency, locale) : own(cell) ? plan(cell.budget) : '—'}</span>
       {past && own(cell) && <small>{t('of {amount}', { amount: plan(cell.budget) })}</small>}
       {past && cell.budget ? <BudgetProgress row={cell}/> : null}
      </td>;
     })}
     <td><strong>{plan(total)}</strong></td>
    </tr>;
   })}</tbody>
   <BudgetYearOverall months={months} overall={overall} current={current} currency={currency}/>
  </table></div> : <p className="budget-left-empty">{t('Nothing planned or recorded this year yet.')}</p>}
 </section>;
}

/** The Year view's overall rows: income, spending and what is left, per month and for the year. Past months show actuals with the plan below. */
function BudgetYearOverall({ months, overall, current, currency }: { months: string[]; overall: BudgetOverall[]; current: string; currency: string }) {
 const { t, locale } = useLanguage();
 const lines = [
  { label: t('Total income'), actual: (item: BudgetOverall) => item.income, plan: (item: BudgetOverall) => item.plannedIncome },
  { label: t('Total expenses'), actual: (item: BudgetOverall) => item.expenses, plan: (item: BudgetOverall) => item.plannedExpenses },
  { label: t('Net'), net: true, actual: (item: BudgetOverall) => item.income - item.expenses, plan: (item: BudgetOverall) => item.plannedIncome - item.plannedExpenses },
 ];
 return <tfoot>{lines.map(line => {
  const total = overall.some((item, position) => months[position] > current && item.missing) ? null : overall.reduce((sum, item, position) => sum + (months[position] <= current ? line.actual(item) : line.plan(item)), 0);
  const plan = (item: BudgetOverall) => item.missing ? '—' : formatMoney(line.plan(item), currency, locale);
  return <tr key={line.label} data-net={line.net || undefined}>
   <th scope="row">{line.label}</th>
   {overall.map((item, position) => {
    const past = months[position] <= current;
    const value = past ? line.actual(item) : line.plan(item);
    const marks = { 'data-future': !past || undefined, 'data-current': months[position] === current || undefined };
    if (!item.income && !item.expenses && !item.plannedIncome && !item.plannedExpenses && !item.missing) return <td key={months[position]} {...marks}>—</td>;
    return <td key={months[position]} {...marks} data-tone={line.net && (past || !item.missing) ? signTone(value, true) : undefined}>
     <span>{past ? formatMoney(value, currency, locale) : plan(item)}</span>
     {past && <small>{t('of {amount}', { amount: plan(item) })}</small>}
    </td>;
   })}
   <td data-tone={line.net && total !== null ? signTone(total, true) : undefined}><strong>{total === null ? '—' : formatMoney(total, currency, locale)}</strong></td>
  </tr>;
 })}</tfoot>;
}
