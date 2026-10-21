import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountsSkeleton, CashflowPreviewSkeleton, ChartSkeleton, SankeySkeleton, SkeletonRows, StatTilesSkeleton, WorkspaceSkeleton } from './loading-placeholder';

// Each screen's loading shape, built from the classes its loaded blocks use, so the page keeps its layout when the
// records arrive. The drawer shows the whole screen's shape; a screen that already drew its toolbar asks for the rest.

/** A screen region still loading: announced once, its blocks spaced like the page's own `.content`. */
function Loading({ label, children }: { label: string; children: ReactNode }) {
  return <div role="status" aria-busy="true" className="screen-skeleton-region"><span className="sr-only">{label}</span><div aria-hidden="true" className="screen-skeleton">{children}</div></div>;
}

const times = (count: number) => Array.from({ length: count }, (_, index) => index);

/** A panel's heading row: the title, and an aside (a switch or a button) when the loaded panel has one. */
function Heading({ width = 160, aside = false }: { width?: number; aside?: boolean }) {
  return <div className="panel-title-skeleton"><Skeleton className="h-6 max-w-full" style={{ width }}/>{aside && <Skeleton className="h-9 w-40 rounded-xl"/>}</div>;
}

/** The filter row above a list: an optional search box that takes the room, then a control per width. */
function Toolbar({ search = false, controls }: { search?: boolean; controls: number[] }) {
  return <div className="transactions-tools">{search && <Skeleton className="h-11 min-w-48 flex-1 rounded-xl"/>}{controls.map((width, index) => <Skeleton key={index} className="h-11 rounded-xl" style={{ width }}/>)}</div>;
}

/** A row's name cell: the category tile, the name and the line under it. */
function Merchant({ width = 128 }: { width?: number }) {
  return <span className="transaction-merchant"><Skeleton className="size-9 shrink-0 rounded-[10px]"/><span><Skeleton className="h-4 max-w-full" style={{ width }}/><Skeleton className="mt-1.5 h-3 w-20"/></span></span>;
}

/** Label and figure pairs, as in the Summary and Left to budget lists. */
function Figures({ rows }: { rows: number }) {
  return <div className="budget-left-summary">{times(rows).map(row => <div key={row}><Skeleton className="h-4 w-24"/><Skeleton className="h-4 w-16"/></div>)}</div>;
}

function SummaryAside({ rows = 5 }: { rows?: number }) {
  return <aside className="panel transactions-summary"><Skeleton className="h-6 w-28"/><Figures rows={rows}/></aside>;
}

/** Transactions: the filters, then the day groups beside the Summary. */
export function TransactionsSkeleton({ label, tools = true }: { label: string; tools?: boolean }) {
  return <Loading label={label}>
    {tools && <Toolbar search controls={[150, 170]}/>}
    <div className="transactions-layout">
      <section className="panel transactions-list">{[3, 4, 2].map((rows, day) => <section className="transaction-day" key={day}>
        <div className="transaction-day-heading"><Skeleton className="h-4 w-28"/><Skeleton className="h-4 w-14"/></div>
        <ul>{times(rows).map(row => <li className="transaction-row skeleton-row" key={row}><Merchant width={110 + (row % 3) * 30}/><Skeleton className="h-6 w-28 rounded-full"/><Skeleton className="h-5 w-16"/></li>)}</ul>
      </section>)}</section>
      <SummaryAside/>
    </div>
  </Loading>;
}

/** Reports: the Cash flow tab's four figures and Breakdown Sankey, or with `donut` the Spending and Income tabs' two
 * figures and category donut; then the transactions beside the Summary. */
export function ReportsSkeleton({ label, donut = false }: { label: string; donut?: boolean }) {
  return <Loading label={label}>
    {donut ? <div className="stat-tiles" data-columns="auto">{times(2).map(tile => <article className="stat-tile" key={tile}><Skeleton className="h-4 w-24"/><Skeleton className="h-8 w-32"/></article>)}</div> : <StatTilesSkeleton columns={4}/>}
    <section className="panel"><Heading width={140} aside/>{donut
      ? <div className="portfolio-allocation-body"><Skeleton className="size-48 justify-self-center rounded-full"/><SkeletonRows rows={4}/></div>
      : <SankeySkeleton height={300}/>}</section>
    <div className="transactions-layout">
      <section className="panel report-transactions"><Heading width={140}/><SkeletonRows rows={4}/></section>
      <SummaryAside/>
    </div>
  </Loading>;
}

/** Cash flow's Overview: four figures, the monthly bars, the Breakdown Sankey and the two preview panels. */
export function CashFlowSkeleton({ label }: { label: string }) {
  return <Loading label={label}>
    <section className="cashflow-summary"><StatTilesSkeleton columns={4}/></section>
    <section className="panel"><Heading width={260}/><ChartSkeleton bars height={260}/></section>
    <section className="panel"><Heading width={140} aside/><SankeySkeleton height={300}/></section>
    <CashflowPreviewSkeleton/>
  </Loading>;
}

function BudgetRow({ name = 120 }: { name?: number }) {
  return <div className="budget-row skeleton-row"><Merchant width={name}/>{times(3).map(cell => <Skeleton key={cell} className="h-5 w-20"/>)}</div>;
}

/** Budget's month: income and expense categories in their columns, Left to budget and Age of money beside them. */
export function BudgetSkeleton({ label }: { label: string }) {
  return <Loading label={label}>
    <div className="budget-layout">
      <div className="budget-table">{[4, 6].map((rows, section) => <div className="budget-skeleton-section" key={section}>
        <div className="budget-row budget-section-header skeleton-row"><span><Skeleton className="h-4 w-20"/></span>{times(3).map(cell => <Skeleton key={cell} className="h-4 w-20"/>)}</div>
        <section className="budget-group">{times(rows).map(row => <BudgetRow key={row} name={100 + (row % 3) * 30}/>)}</section>
      </div>)}</div>
      <div className="budget-side">
        <aside className="panel budget-left"><div className="budget-left-figure"><Skeleton className="h-8 w-28"/><Skeleton className="h-4 w-24"/></div><Skeleton className="h-9 w-full rounded-xl"/><Figures rows={4}/></aside>
        <article className="stat-tile"><Skeleton className="h-4 w-24"/><Skeleton className="h-7 w-20"/><Skeleton className="h-3 w-32"/></article>
      </div>
    </div>
  </Loading>;
}

function RecurringRow({ row }: { row: number }) {
  return <li className="recurring-row skeleton-row"><Merchant width={110 + (row % 3) * 30}/><Skeleton className="h-6 w-16 rounded-full"/><Skeleton className="h-5 w-14"/><Skeleton className="h-9 w-32 rounded-xl"/></li>;
}

/** Recurring's list: the month's income and expense bars, then the schedules grouped by day. */
export function RecurringSkeleton({ label }: { label: string }) {
  return <Loading label={label}>
    <section className="panel recurring-summary">
      <div className="recurring-summary-head"><Skeleton className="h-6 w-36"/><Skeleton className="h-9 w-32 rounded-xl"/></div>
      {times(2).map(side => <div className="recurring-bar-skeleton" key={side}><div><Skeleton className="h-4 w-20"/><Skeleton className="h-4 w-24"/></div><Skeleton className="h-2 w-full rounded-full"/><div><Skeleton className="h-3 w-16"/><Skeleton className="h-3 w-24"/></div></div>)}
    </section>
    <section className="panel recurring-list"><ul>
      {[5, 3].flatMap((rows, day) => [<li className="transaction-day-heading" key={'d' + day}><Skeleton className="h-4 w-28"/><Skeleton className="h-4 w-16"/></li>, ...times(rows).map(row => <RecurringRow key={day + '-' + row} row={row}/>)])}
    </ul></section>
  </Loading>;
}

/** Goals: the goal list with its progress lines, then the chosen goal beside what is available for goals. */
export function GoalsSkeleton({ label }: { label: string }) {
  return <Loading label={label}>
    <section className="panel goals-list"><Heading width={100}/><ul className="goal-rows">{times(4).map(row => <li className="goal-row goal-row-skeleton" key={row}>
      <Skeleton className="size-10 shrink-0 rounded-xl"/>
      <div className="goal-row-skeleton-body"><div><Skeleton className="h-4 w-40 max-w-full"/><Skeleton className="h-4 w-20"/></div><div><Skeleton className="h-3 w-32"/><Skeleton className="h-3 w-24"/></div><Skeleton className="h-1.5 w-full rounded-full"/></div>
    </li>)}</ul></section>
    <div className="goals-split">
      <section className="panel goal-detail"><div className="goal-detail-head"><header><Skeleton className="size-10 rounded-xl"/><Skeleton className="h-6 w-48 max-w-full"/></header><Skeleton className="h-9 w-40"/><Skeleton className="h-2 w-full rounded-full"/></div><StatTilesSkeleton/></section>
      <section className="panel goal-funding-panel"><Heading width={180}/><Skeleton className="mb-4 h-24 w-full rounded-xl"/><Figures rows={4}/></section>
    </div>
  </Loading>;
}

/** Investments' Holdings: the total with its two figures and the allocation donut, then the account cards. */
export function InvestmentsSkeleton({ label }: { label: string }) {
  return <Loading label={label}>
    <div className="asset-dashboard">
      <section className="portfolio-summary">
        <div className="portfolio-summary-main"><div className="portfolio-summary-total"><Skeleton className="h-4 w-32"/><Skeleton className="mt-2 h-10 w-56 max-w-full"/></div><div className="portfolio-summary-metrics">{times(2).map(metric => <div key={metric}><Skeleton className="h-3 w-20"/><Skeleton className="h-7 w-28"/></div>)}</div></div>
        <div className="portfolio-summary-allocation"><Skeleton className="mb-4 h-5 w-36"/><div className="portfolio-allocation-body"><Skeleton className="size-44 justify-self-center rounded-full"/><SkeletonRows rows={4}/></div></div>
      </section>
      <section><div className="asset-holdings-heading"><Skeleton className="h-7 w-32"/><Skeleton className="h-5 w-28"/></div>
        <div className="asset-card-grid">{times(3).map(card => <article className="panel asset-card-skeleton" key={card}><Merchant width={120}/><Skeleton className="h-8 w-32"/></article>)}</div>
      </section>
    </div>
  </Loading>;
}

/** Loans & debts: the three lending figures, then the records with their search. */
export function LoansSkeleton({ label }: { label: string }) {
  return <Loading label={label}>
    <StatTilesSkeleton/>
    <section className="panel records"><Heading width={150}/><Skeleton className="h-11 w-full rounded-xl"/><SkeletonRows rows={4}/></section>
  </Loading>;
}

/** The Assistant's panel: the opening message, the question box and the note under it. */
export function AssistantSkeleton({ label }: { label: string }) {
  return <Loading label={label}>
    <section className="panel assistant-panel">
      <div className="assistant-log is-unavailable"><div className="empty"><Skeleton className="size-10 rounded-xl"/><Skeleton className="h-5 w-56 max-w-full"/><Skeleton className="h-4 w-72 max-w-full"/></div></div>
      <div className="assistant-form"><Skeleton className="h-12 flex-1 rounded-xl"/><Skeleton className="size-11 rounded-xl"/></div>
      <Skeleton className="h-3 w-64 max-w-full self-center"/>
    </section>
  </Loading>;
}

/** Recently deleted rows: icon, name and category, amount and date, and the two actions. */
export function RecoveryRowsSkeleton({ label, rows = 4 }: { label?: string; rows?: number }) {
  const list = <ul aria-hidden="true" className="recovery-list">{times(rows).map(row => <li className="recovery-row skeleton-row" key={row}>
    <span className="transaction-merchant"><Skeleton className="size-9 shrink-0 rounded-[10px]"/><span className="grid gap-1.5"><Skeleton className="h-4 w-36 max-w-full"/><Skeleton className="h-5 w-24 rounded-full"/></span></span><span className="grid gap-1.5"><Skeleton className="h-4 w-16"/><Skeleton className="h-3 w-24"/></span><span className="flex gap-2"><Skeleton className="h-9 w-24 rounded-xl"/><Skeleton className="size-9 rounded-xl"/></span>
  </li>)}</ul>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{list}</div> : list;
}

/** The four Profile & preferences cards, each a heading over its fields. */
export function PreferencesSkeleton({ label }: { label?: string }) {
  const cards = <div aria-hidden="true">{[2, 1, 2, 2].map((rows, card) => <section className="panel preferences-card" key={card}>
    <Skeleton className="mb-4 h-5 w-28"/>
    <div className="grid gap-3">{times(rows).map(row => <div className="preferences-setting-row" key={row}><Skeleton className="h-4 w-32"/><Skeleton className="h-11 w-full rounded-xl"/></div>)}</div>
  </section>)}</div>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{cards}</div> : cards;
}

/** Settings: the section list beside Profile & preferences. */
export function SettingsSkeleton({ label }: { label: string }) {
  return <Loading label={label}>
    <div className="settings-layout"><div className="settings-columns">
      <nav className="settings-nav">{[3, 7].map((items, group) => <div className="grid gap-1.5 p-1" key={group}><Skeleton className="mb-1 h-3 w-16"/>{times(items).map(item => <Skeleton key={item} className="h-8 w-full rounded-lg"/>)}</div>)}</nav>
      <div className="settings-sections"><Skeleton className="mb-4 h-7 w-48"/><PreferencesSkeleton/></div>
    </div></div>
  </Loading>;
}

function RecentlyDeletedSkeleton({ label }: { label: string }) {
  return <Loading label={label}><section className="panel records recovery-panel"><RecoveryRowsSkeleton/></section></Loading>;
}

/** Every drawer destination's loading shape, by route. */
export const screenSkeletons: Record<string, (label: string) => ReactNode> = {
  '/': label => <WorkspaceSkeleton label={label}/>,
  '/assistant': label => <AssistantSkeleton label={label}/>,
  '/accounts': label => <AccountsSkeleton label={label}/>,
  '/transactions': label => <TransactionsSkeleton label={label}/>,
  '/income-expenses': label => <CashFlowSkeleton label={label}/>,
  '/reports': label => <ReportsSkeleton label={label}/>,
  '/budget': label => <BudgetSkeleton label={label}/>,
  '/upcoming': label => <RecurringSkeleton label={label}/>,
  '/goals': label => <GoalsSkeleton label={label}/>,
  '/assets': label => <InvestmentsSkeleton label={label}/>,
  '/loans-debts': label => <LoansSkeleton label={label}/>,
  '/recently-deleted': label => <RecentlyDeletedSkeleton label={label}/>,
  '/settings': label => <SettingsSkeleton label={label}/>,
};

/** Shimmer for a drawer tap, in the destination's own layout. The full workspace layout with its banner is for the first load and reloads. */
export function NavigationShimmer({ label, path }: { label: string; path: string }) {
  return <div className="content page-loading">{(screenSkeletons[path] ?? screenSkeletons['/'])(label)}</div>;
}
