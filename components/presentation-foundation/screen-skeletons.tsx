import type { ReactNode } from 'react';
import type { ShimmerHints } from '@/lib/shimmer-hints';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountsSkeleton, CashFlowReportSkeleton, CashflowPreviewSkeleton, SankeySkeleton, SkeletonRows, StatTilesSkeleton, WorkspaceSkeleton } from './loading-placeholder';
import { Bar, Figures, Heading, Loading, Merchant, Switches, Tiles, Toolbar, Track, times } from './skeleton-kit';
import { AssistantSkeleton, GoalsSkeleton, InvestmentsSkeleton, LoansSkeleton, RecentlyDeletedSkeleton, SettingsSkeleton } from './planning-skeletons';
import { CalendarSkeleton, ForecastSkeleton } from './tab-skeletons';

export { AssistantSkeleton, GoalsSkeleton, InvestmentsSkeleton, LoansSkeleton, PayoffPlanCardSkeleton, PreferencesSkeleton, RecoveryDetailSkeleton, RecoveryRowsSkeleton, SettingsSkeleton } from './planning-skeletons';
export { AllocationSkeleton, AssetCardsSkeleton, BudgetYearSkeleton, ForecastSkeleton, IncomeEstimatesSkeleton, PayoffPlannerSkeleton, PayoutsAlertsSkeleton, PerformanceSkeleton, RemindersSkeleton, TaxPrepSkeleton, WatchlistsSkeleton } from './tab-skeletons';

// Each screen's loading shape, built from the classes its loaded blocks use, in the loaded page's order, so the page keeps
// its layout when the records arrive. The drawer shows the whole screen's shape; a screen that already drew its toolbar
// asks for the rest. Change a screen, change its shape here with it (docs/agents/interface.md, Shimmer follows the screen).

/** A transactions table row: payee, category, account and amount, in the loaded table's cells. */
function TransactionRow({ row }: { row: number }) {
  return <tr className="transaction-row"><td><Merchant width={110 + (row % 3) * 30}/></td><td className="transaction-category-cell"><Skeleton className="h-7 w-28 rounded-full"/></td><td className="transaction-account"><Skeleton className="h-4 w-24"/></td><td className="num"><Skeleton className="ms-auto h-5 w-20"/></td></tr>;
}

/** Transactions: the filters, the column names over the day groups and the pages, beside the Summary and Top categories. */
export function TransactionsSkeleton({ label, tools = true }: { label: string; tools?: boolean }) {
  return <Loading label={label} heading={tools ? '/transactions' : undefined}>
    {tools && <Toolbar search controls={[176, 227]}/>}
    <div className="transactions-layout">
      <section className="panel transactions-list">
        <div className="table-scroll"><table className="transactions-table">
          <thead><tr>{[56, 64, 56, 56].map((width, index) => <th key={index} className={index === 3 ? 'num' : undefined}><Bar className={index === 3 ? 'ms-auto h-3' : 'h-3'} width={width}/></th>)}</tr></thead>
          {[2, 5, 3].map((rows, day) => <tbody className="transaction-day" key={day}>
            <tr className="table-group-row transaction-day-row"><th colSpan={3}><Skeleton className="h-4 w-32"/></th><th className="num"><Skeleton className="ms-auto h-4 w-16"/></th></tr>
            {times(rows).map(row => <TransactionRow key={row} row={row}/>)}
          </tbody>)}
        </table></div>
        <div className="records-pagination"><Skeleton className="h-4 w-44"/><Skeleton className="h-9 w-40 rounded-lg"/></div>
      </section>
      <div className="transactions-aside">
        <aside className="panel transactions-summary"><Heading width={120}/>
          <div className="transactions-net"><Skeleton className="h-5 w-12"/><Skeleton className="h-8 w-32"/></div>
          <div className="transactions-flow">{times(2).map(line => <div className="grid gap-2" key={line}><div className="flex justify-between"><Skeleton className="h-4 w-16"/><Skeleton className="h-4 w-20"/></div><Track/></div>)}</div>
          <Figures rows={3}/>
        </aside>
        <section className="panel transactions-top"><Heading width={140} link/><ul>{times(4).map(row => <li key={row}><Skeleton className="size-7 shrink-0 rounded-lg"/><span className="grid flex-1 gap-2"><span className="flex justify-between"><Skeleton className="h-4 w-24"/><Skeleton className="h-4 w-14"/></span><Track/></span></li>)}</ul></section>
      </div>
    </div>
  </Loading>;
}

/** Reports: with `heading` (the drawer's shimmer) the tabs and the business, interval and period filters where the top
 * bar has no room for them (in the bar they are not part of the page); then the Cash flow tab's
 * four figures and its Flow Sankey, or with `donut` the Spending and Income tabs' two figures and category donut; then
 * the transactions beside the Summary and its Download CSV. */
export function ReportsSkeleton({ label, donut = false, heading = false }: { label: string; donut?: boolean; heading?: boolean }) {
  return <Loading label={label} heading={heading ? '/reports' : undefined}>
    {donut ? <Tiles count={2} columns="auto"/> : <Tiles count={4}/>}
    <section className="panel"><div className="panel-title-skeleton"><Bar className="h-7" width={220}/><Switches widths={donut ? [190, 170, 150] : [260]}/></div>{donut
      ? <div className="portfolio-allocation-body"><Skeleton className="size-48 justify-self-center rounded-full"/><SkeletonRows rows={4}/></div>
      : <SankeySkeleton height={380}/>}</section>
    <div className="transactions-layout">
      <section className="panel report-transactions"><Heading width={150} link/><SkeletonRows rows={5}/></section>
      <aside className="panel transactions-summary"><Heading width={110}/><Figures rows={donut ? 6 : 7}/><Skeleton className="h-9 w-full rounded-lg"/></aside>
    </div>
  </Loading>;
}

/** Cash flow's Overview, top to bottom as the loaded page: the month bar (the drawer's shimmer only: the screen draws its
 * own), the month's four figures, the report (the recent months' bars beside Where the month went), the income table
 * beside Still to come. */
export function CashFlowSkeleton({ label, monthBar = false }: { label: string; monthBar?: boolean }) {
  return <Loading label={label} heading={monthBar ? '/income-expenses' : undefined}>
    {monthBar && <div className="cashflow-month-bar"><div className="flex gap-2"><Skeleton className="size-10 rounded-xl"/><Skeleton className="h-10 w-44 rounded-xl"/><Skeleton className="size-10 rounded-xl"/><Skeleton className="h-10 w-16 rounded-xl"/></div><div className="flex gap-2"><Skeleton className="h-7 w-28 rounded-full"/><Skeleton className="h-7 w-52 rounded-full"/></div></div>}
    <section className="cashflow-summary"><StatTilesSkeleton columns={4}/></section>
    <CashFlowReportSkeleton/>
    <CashflowPreviewSkeleton/>
  </Loading>;
}

/** Cash flow's other tabs. Income: the income sources and the month's estimated income. Spending: mortgages, the budget
 * and the way to Budget's watchlists. Forecast: Projected cash with its figures and chart, What if, then the cash movements
 * ahead (`ForecastSkeleton`, which the Forecast view's own loading state draws too). */
export function CashFlowTabSkeleton({ label, tab }: { label: string; tab: 'Income' | 'Spending' | 'Forecast' }) {
  if (tab === 'Forecast') return <ForecastSkeleton label={label}/>;
  // Income and Spending open with the month's four figures, as Overview does.
  const summary = <section className="cashflow-summary"><StatTilesSkeleton columns={4}/></section>;
  if (tab === 'Spending') return <Loading label={label}>
    {summary}
    <section className="panel monthly-mortgage-payments"><Heading width={260}/><SkeletonRows rows={1}/></section>
    <section className="panel overview-panel dashboard-budget"><Heading width={200} link/><Skeleton className="mb-4 h-8 w-40"/><SkeletonRows rows={4}/></section>
    <section className="panel tools-panel"><Heading width={180} link/></section>
  </Loading>;
  return <Loading label={label}>
    {summary}
    <section className="panel"><Heading width={200} aside={160}/><SkeletonRows rows={4}/></section>
    <section className="panel"><Heading width={240}/><SkeletonRows rows={3}/></section>
  </Loading>;
}

/** A budget row on the table's grid: grip, category, its state, then Planned, Actual and Remaining, and the row's end. */
function BudgetRow({ name = 120 }: { name?: number }) {
  return <div className="budget-row budget-category-row"><span className="drag-handle"><Skeleton className="h-6 w-4 rounded"/></span><span className="budget-category-name"><Merchant width={name}/></span><span className="budget-state"><Skeleton className="h-6 w-20 rounded-full"/></span>{cells}<span className="budget-row-end"><Skeleton className="size-7 rounded-lg"/></span></div>;
}

/** The Planned, Actual and Remaining cells, each in its own grid area. */
const cells = ['budget-planned', 'budget-actual', 'budget-remaining'].map(area => <span className={'budget-cell ' + area} key={area}><Skeleton className="ms-auto h-5 w-20"/></span>);

/** Budget's month: Income and Expenses, each a title over its column names, rows and total, beside Left to budget, the
 * spending pace and Age of money; then the spending watchlists. */
export function BudgetSkeleton({ label, heading = false }: { label: string; heading?: boolean }) {
  return <Loading label={label} heading={heading ? '/budget' : undefined}>
    <div className="budget-layout">
      <div className="budget-table">{[3, 6].map((rows, section) => <div className="budget-section" key={section}>
        <div className="panel-title"><Bar className="h-7" width={110}/><Skeleton className="h-4 w-36"/></div>
        <div className="budget-row budget-section-header">{cells}</div>
        <section className="budget-group">{times(rows).map(row => <BudgetRow key={row} name={100 + (row % 3) * 30}/>)}</section>
        <div className="budget-row budget-total-row"><span className="budget-total-name"><Skeleton className="h-5 w-28"/></span>{cells}</div>
      </div>)}</div>
      <div className="budget-side">
        <aside className="panel budget-left"><Heading width={140}/><div className="budget-left-figure"><Skeleton className="h-9 w-32"/></div><Skeleton className="h-11 w-full rounded-xl"/><Skeleton className="h-3 w-full rounded-full"/><Figures rows={4}/><Skeleton className="h-10 w-full rounded-lg"/></aside>
        <section className="panel budget-pace"><Heading width={150}/><Skeleton className="h-6 w-48"/><Skeleton className="h-28 w-full rounded-xl"/><Skeleton className="h-4 w-full"/></section>
        <article className="stat-tile"><Skeleton className="h-4 w-24"/><Skeleton className="h-8 w-20"/><Skeleton className="h-3 w-32"/></article>
      </div>
    </div>
    <section className="panel tools-panel"><Skeleton className="mb-4 h-6 w-48"/><Skeleton className="h-5 w-44"/></section>
  </Loading>;
}

/** A schedule on its day: tick, icon and name, its status, the amount, then Record payment and the row menu. */
function RecurringRow({ row }: { row: number }) {
  return <li className="recurring-row"><span className="transaction-merchant"><Skeleton className="size-[18px] shrink-0 rounded-full"/><Skeleton className="size-9 shrink-0 rounded-[10px]"/><span><Bar width={110 + (row % 3) * 30}/><Skeleton className="mt-1.5 h-3 w-28"/></span></span><Skeleton className="h-6 w-20 rounded-full"/><span className="transaction-amount"><Skeleton className="ms-auto h-5 w-16"/></span><div className="row-actions"><Skeleton className="h-9 w-32 rounded-lg"/><Skeleton className="size-9 rounded-lg"/></div></li>;
}

/** Recurring, as the view shown: on a phone the tabs, month arrows and Add recurring the page opens with (its
 * `PageHeader` loads with the page); for List and Calendar the month's income and bills bars and what is left, then the
 * schedules grouped by day or the month's calendar, beside what is coming up, and under the list the review
 * suggestions button. Subscriptions and Reminders draw their
 * own panels under the header. */
export function RecurringSkeleton({ label, view = 'list' }: { label: string; view?: 'list' | 'calendar' | 'subscriptions' | 'reminders' }) {
  const scheduled = view === 'list' || view === 'calendar';
  return <Loading label={label} heading="/upcoming">
    {scheduled && <section className="recurring-summary">
      <div className="recurring-summary-head"><Skeleton className="h-7 w-32"/><Skeleton className="h-10 w-32 rounded-xl"/></div>
      {times(2).map(bar => <div className="recurring-bar" key={bar}><Skeleton className="h-4 w-24"/><Skeleton className="h-8 w-32"/><Track/><Skeleton className="h-4 w-40"/></div>)}
      <div className="recurring-left"><Skeleton className="h-4 w-24"/><Skeleton className="h-8 w-28"/></div>
    </section>}
    {scheduled && <div className="recurring-layout">
      <div className="recurring-main">{view === 'calendar' ? <CalendarSkeleton/> : <section className="panel recurring-list">
        <div className="recurring-list-tools"><Skeleton className="ms-auto h-11 w-72 rounded-xl"/></div>
        <ul data-layout="columns">{[3, 4].flatMap((rows, day) => [<li className="transaction-day-heading" key={'d' + day}><Skeleton className="h-5 w-40"/><Skeleton className="h-5 w-16"/></li>, ...times(rows).map(row => <RecurringRow key={day + '-' + row} row={row}/>)])}</ul>
      </section>}</div>
      <aside className="recurring-side"><section className="panel recurring-coming"><Heading width={170} aside={92}/><ul>{times(3).map(row => <li key={row}><div className="recurring-coming-row"><Skeleton className="h-11 w-11 rounded-xl"/><Skeleton className="h-4 w-28"/><Skeleton className="h-4 w-12"/></div></li>)}</ul></section></aside>
    </div>}
    {/* Transaction review suggestions, under the list (`TransactionInsights`). */}
    {view === 'list' && <section className="panel tools-panel"><Skeleton className="h-11 w-60 rounded-xl"/></section>}
    {view === 'subscriptions' && <section className="panel subscriptions-panel"><Heading width={170} aside={220}/><ul className="subscription-list">{times(4).map(row => <RecurringRow key={row} row={row}/>)}</ul></section>}
  </Loading>;
}

type DashboardColumns = { left: readonly string[]; right: readonly string[] };


/** Every drawer destination's loading shape, by route; the dashboard's follows the person's saved card order. */
export const screenSkeletons: Record<string, (label: string, dashboard?: DashboardColumns, hints?: ShimmerHints) => ReactNode> = {
  '/': (label, dashboard) => <WorkspaceSkeleton label={label} columns={dashboard}/>,
  '/assistant': label => <AssistantSkeleton label={label}/>,
  '/accounts': (label, _dashboard, hints) => <AccountsSkeleton label={label} menu={hints?.accountsMenu}/>,
  '/transactions': label => <TransactionsSkeleton label={label}/>,
  '/income-expenses': label => <CashFlowSkeleton label={label} monthBar/>,
  '/reports': label => <ReportsSkeleton label={label} heading/>,
  '/budget': label => <BudgetSkeleton label={label} heading/>,
  '/upcoming': label => <RecurringSkeleton label={label}/>,
  '/goals': (label, _dashboard, hints) => <GoalsSkeleton label={label} empty={hints?.goals === false}/>,
  '/assets': (label, _dashboard, hints) => <InvestmentsSkeleton label={label} heading hint={hints?.investments}/>,
  '/loans-debts': (label, _dashboard, hints) => <LoansSkeleton label={label} heading side={hints?.debts ?? true}/>,
  '/recently-deleted': label => <RecentlyDeletedSkeleton label={label}/>,
  '/settings': label => <SettingsSkeleton label={label}/>,
};

/** Shimmer for a drawer tap, in the destination's own layout. The full workspace layout with its banner is for the first load and reloads. */
export function NavigationShimmer({ label, path, dashboard, hints }: { label: string; path: string; dashboard?: DashboardColumns; hints?: ShimmerHints }) {
  return <div className="content page-loading">{(screenSkeletons[path] ?? screenSkeletons['/'])(label, dashboard, hints)}</div>;
}
