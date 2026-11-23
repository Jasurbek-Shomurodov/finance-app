import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboardColumns, defaultDashboardLayout } from '@/lib/dashboard-layout';
import { PageHeadingSkeleton, pageHeadings } from './page-heading-skeleton';

export function LoadingPlaceholder({ label, rows = 4 }: { label: string; rows?: number }) {
  return <div role="status" aria-busy="true" className="loading-placeholder">
    <span className="sr-only">{label}</span>
    <SkeletonRows rows={rows}/>
  </div>;
}

/** Icon, two lines and a figure per row: the shape of a record list. */
export function SkeletonRows({ rows }: { rows: number }) {
  return <div aria-hidden="true" className="loading-lines">{Array.from({ length: rows }, (_, index) =>
    <div className="loading-row" key={index}><Skeleton className="loading-icon"/><div className="loading-copy"><Skeleton className="loading-line"/><Skeleton className="loading-detail"/></div><Skeleton className="loading-value"/></div>
  )}</div>;
}

/** Placeholder tiles in the exact shape of a `StatTiles` row, so the figures do not push the page down when they arrive. */
/** `count` tiles in `columns` columns: one row unless told otherwise (the dashboard's 2×2 is four in two). */
export function StatTilesSkeleton({ label, columns = 3, count = columns }: { label?: string; columns?: 2 | 3 | 4; count?: number }) {
  const tiles = <div aria-hidden="true" className="stat-tiles" data-columns={columns}>{Array.from({ length: count }, (_, index) => <article className="stat-tile" key={index}><Skeleton className="h-4 w-2/3"/><Skeleton className="h-7 w-3/4"/><Skeleton className="h-3 w-full"/></article>)}</div>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{tiles}</div> : tiles;
}

/** A `.panel` whose heading and rows are still loading. */
export function PanelSkeleton({ label, rows = 3, className }: { label: string; rows?: number; className?: string }) {
  return <section className={className ? 'panel ' + className : 'panel'}><Skeleton aria-hidden="true" className="mb-4 h-5 w-1/3"/><LoadingPlaceholder label={label} rows={rows}/></section>;
}

/** The dashboard board's two columns of cards, in the person's saved order; with nothing saved, the default layout
 * itself, so the fallback can never drift from the board it stands in for. */
type DashboardSkeletonColumns = { left: readonly string[]; right: readonly string[] };
const defaultDashboardSkeleton: DashboardSkeletonColumns = dashboardColumns(defaultDashboardLayout);

/** A dashboard card's heading row: its title, and the "View all" link or figure at the end. */
function CardHeading({ width = 150, aside = true }: { width?: number; aside?: boolean }) {
  return <div className="panel-title-skeleton"><Skeleton className="h-7 max-w-full" style={{ width }}/>{aside && <Skeleton className="h-4 w-14"/>}</div>;
}
const bars = (count: number) => Array.from({ length: count }, (_, index) => index);

/** Each card's body while the workspace loads, in the loaded card's own blocks and classes. */
const dashboardCardBodies: Record<string, () => ReactNode> = {
  // Where it is going: five ranked bars (name and share, bar, amount).
  where: () => <><CardHeading width={230}/><div className="flow-bars where-bars">{bars(5).map(row => <div className="flow-bar-row" key={row}><span className="flow-bar-name"><Skeleton className="loading-icon"/><span><Skeleton className="h-4 w-24"/><Skeleton className="mt-1.5 h-3 w-16"/></span></span><Skeleton className="h-2.5 w-full"/><Skeleton className="h-4 w-16"/></div>)}</div></>,
  // Spending pace: the chart and its legend.
  spending: () => <><CardHeading width={210}/><ChartSkeleton height={220}/><div className="spending-pace-legend">{bars(3).map(key => <Skeleton key={key} className="h-4 w-20"/>)}</div></>,
  // Budget: how much of the plan is used and its bar, then the three categories closest to their limit.
  budget: () => <><CardHeading width={200}/><div className="dashboard-budget-total"><Skeleton className="h-8 w-40"/></div><Skeleton className="h-2 w-full"/><div className="dashboard-budget-list"><SkeletonRows rows={3}/></div></>,
  income: () => <><CardHeading width={190} aside={false}/><ChartSkeleton height={260} bars/></>,
  // Monthly commitments: three lines and the surplus at the foot.
  commitments: () => <><CardHeading width={220} aside={false}/><SkeletonRows rows={3}/><div className="cash-footer"><Skeleton className="h-5 w-44"/><Skeleton className="h-5 w-20"/></div></>,
  upcoming: () => <><CardHeading width={230}/><SkeletonRows rows={4}/></>,
  goals: () => <><CardHeading width={90}/><div className="dashboard-goal-list">{bars(2).map(goal => <div className="dashboard-goal-row" key={goal}><Skeleton className="size-10 rounded-[10px]"/><div><Skeleton className="h-4 w-full"/><Skeleton className="mt-2 h-2 w-full"/><Skeleton className="mt-2 h-3 w-32"/></div></div>)}</div></>,
  transactions: () => <><CardHeading width={150}/><SkeletonRows rows={5}/></>,
  // Asset allocation: the donut beside its list.
  allocation: () => <><CardHeading width={240}/><div className="dashboard-allocation"><Skeleton className="allocation-donut rounded-full"/><div className="overview-list"><SkeletonRows rows={4}/></div></div></>,
};
const dashboardCardClass: Record<string, string> = { where: ' dashboard-where', spending: ' spending-pace', budget: ' dashboard-budget', goals: ' dashboard-goals', transactions: ' dashboard-transactions' };

/** One dashboard card while the workspace loads: Net worth in its full shape, every other card in its own. */
function DashboardCardSkeleton({ card }: { card: string }) {
  if (card === 'net_worth') return <section className="panel overview-hero"><div className="overview-hero-head"><div className="overview-hero-value"><Skeleton className="h-8 w-56 max-w-full"/></div><Skeleton className="h-11 w-96 max-w-full rounded-xl"/></div><NetWorthBodySkeleton/></section>;
  return <section className={'panel overview-panel' + (dashboardCardClass[card] ?? '')} data-card={card}>{(dashboardCardBodies[card] ?? dashboardCardBodies.upcoming)()}</section>;
}

/** The dashboard while the workspace loads, block for block: its four key figures over the board's two columns, with
 * every shown card in its place and shape, so nothing appears from nowhere when the records arrive. */
export function WorkspaceSkeleton({ label, columns = defaultDashboardSkeleton }: { label: string; columns?: DashboardSkeletonColumns }) {
  const beside = columns.left.includes('net_worth') ? 1 : columns.right.includes('net_worth') ? 0 : -1;
  return <div role="status" aria-busy="true" className="overview-content-loading">
    <span className="sr-only">{label}</span>
    {/* The key figures, as the loaded page places them: atop the column beside Net worth over time, or above the board. */}
    <div className="dashboard-headline" data-beside={beside >= 0 || undefined}><StatTilesSkeleton columns={beside >= 0 ? 2 : 4} count={4}/></div>
    <div aria-hidden="true" className="dashboard-grid">{[columns.left, columns.right].map((cards, index) => <div className="dashboard-column" key={index}>{index === beside && <div className="dashboard-lead"><StatTilesSkeleton columns={2} count={4}/></div>}{cards.map(card => <DashboardCardSkeleton card={card} key={card}/>)}</div>)}</div>
  </div>;
}

/** Accounts while records load, in the loaded page's shape: on a phone the tabs and actions the page opens with (its `PageHeader` loads with the page), the Total tile, one account group with its cards, and the selected account's card beside it. */
export function AccountsSkeleton({ label, filters = false, menu = false }: { label: string; filters?: boolean; /** The page opens with ⋯ (owners or businesses to edit). */ menu?: boolean }) {
  const heading = pageHeadings['/accounts'];
  return <div role="status" aria-busy="true" className="overview-content-loading">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="contents"><PageHeadingSkeleton {...heading} actions={menu ? [42, ...heading.actions ?? []] : heading.actions}/></div>
    <div aria-hidden="true" className="accounts-hero"><div className="accounts-hero-figure"><Skeleton className="h-5 w-44"/><Skeleton className="h-10 w-52 max-w-full"/></div>
      {filters && <div className="accounts-hero-tools"><Skeleton className="h-11 w-44 rounded-xl"/><Skeleton className="h-11 w-36 rounded-xl"/></div>}</div>
    <div aria-hidden="true" className="panel accounts-mix"><Skeleton className="h-2.5 w-full"/><Skeleton className="mt-3 h-5 w-64 max-w-full"/></div>
    <div aria-hidden="true" className="accounts-master-detail">
      <section className="panel account-directory"><div className="account-group">
        <div className="account-group-skeleton-head"><Skeleton className="h-6 w-28"/><Skeleton className="ms-auto h-6 w-36"/></div>
        <div className="account-rows">{Array.from({ length: 5 }, (_, index) => <div className="account-sortable-row" key={index}><div className="account-list-row"><Skeleton className="size-[38px] rounded-[10px]"/><span className="account-list-name"><Skeleton className="h-5 w-36 max-w-full"/><Skeleton className="mt-1.5 h-[18px] w-24"/></span><span className="account-list-amount"><Skeleton className="h-6 w-24"/></span></div></div>)}</div>
      </div></section>
      <div className="account-selected-panel"><article className="panel account-card">
        <header><Skeleton className="size-[38px] rounded-[10px]"/><Skeleton className="h-6 w-32"/></header>
        <Skeleton className="h-9 w-40 max-w-full"/>
        <Skeleton className="mt-1 h-[150px] w-full"/>
        <div className="account-balance-facts"><Skeleton className="h-5 w-full"/><Skeleton className="h-5 w-full"/></div>
        <div className="account-card-actions"><Skeleton className="h-[42px] w-full"/><Skeleton className="h-[42px] w-full"/></div>
      </article></div>
    </div>
  </div>;
}

const lines = (count: number) => Array.from({ length: count }, (_, index) => index);

/** A panel heading in a Cash flow column: the title with its month figure, and the link on the right. */
function PreviewHeading({ width }: { width: number }) {
  return <div className="panel-title-skeleton"><Skeleton className="h-6 max-w-full" style={{ width }}/><Skeleton className="h-4 w-14"/></div>;
}

/** Cash flow's lower half while its records load, block for block: Income this month's five-column table (Source, Status, Expected, Received, Progress) beside Still to come. */
export function CashflowPreviewSkeleton({ label }: { label?: string }) {
  const grid = <div aria-hidden="true" className="cashflow-preview-grid">
    <section className="panel cashflow-income-preview"><PreviewHeading width={240}/><div className="table-scroll"><table className="stack-table">
      <thead><tr>{[56, 48, 64, 64, 60].map((width, column) => <th key={column}><Skeleton className="h-3 max-w-full" style={{ width }}/></th>)}</tr></thead>
      <tbody>{lines(5).map(row => <tr key={row}><td><div className="record-name"><Skeleton className="size-9 shrink-0 rounded-[10px]"/><div className="grid gap-1.5"><Skeleton className="h-4 max-w-full" style={{ width: 110 + (row % 3) * 30 }}/><Skeleton className="h-3 w-20"/></div></div></td><td><Skeleton className="h-6 w-20 rounded-full"/></td><td><Skeleton className="h-4 w-20"/></td><td><Skeleton className="h-4 w-20"/></td><td><Skeleton className="h-1.5 w-full rounded-full"/></td></tr>)}</tbody>
    </table></div><footer><Skeleton className="h-5 w-36"/></footer></section>
    <div className="cashflow-spending-preview">
      <section className="panel cashflow-still-to-come"><PreviewHeading width={180}/><div className="grid gap-3">{lines(4).map(line => <div key={line} className="flex items-center justify-between gap-3"><Skeleton className="h-4 w-36"/><Skeleton className="h-4 w-16"/></div>)}</div></section>
    </div>
  </div>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{grid}</div> : grid;
}

/** Cash flow's report while its records load: the recent months' bars beside Where the month went. */
export function CashFlowReportSkeleton({ label }: { label?: string }) {
  const report = <div aria-hidden="true" className="cash-flow-report">
    <div className="cash-flow-report-grid">
      <section className="panel cash-flow-trend"><Skeleton className="mb-3 h-7 w-72 max-w-full"/><Skeleton className="mb-3 h-4 w-48"/><ChartSkeleton bars height={220}/><div className="cash-flow-totals"><Skeleton className="h-4 w-48"/></div></section>
      <section className="panel cash-flow-where"><Skeleton className="mb-3 h-7 w-60 max-w-full"/><div className="mb-4 flex flex-wrap gap-2"><Skeleton className="h-10 w-44 rounded-xl"/><Skeleton className="h-10 w-36 rounded-xl"/></div><SkeletonRows rows={5}/></section>
    </div>
  </div>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{report}</div> : report;
}

// Twelve months of bars, a pair a month, as the Cash flow chart draws income and spending.
const skeletonBars = [52, 38, 60, 44, 70, 48, 58, 40, 66, 50, 74, 46];

/** A chart while its data loads: a line, or with `bars` monthly bars. Without a label it is decoration inside a larger loading region. */
export function ChartSkeleton({ label, height = 310, bars = false }: { label?: string; height?: number; bars?: boolean }) {
  return <div role={label ? 'status' : undefined} aria-busy={label ? true : undefined} aria-hidden={label ? undefined : true} className="chart-skeleton skeleton-sheen" style={{ height }}>
    {label && <span className="sr-only">{label}</span>}
    <svg aria-hidden="true" viewBox="0 0 400 100" preserveAspectRatio="none">
      {[20, 45, 70].map(y => <line key={y} x1="0" x2="400" y1={y} y2={y}/>)}
      {bars ? skeletonBars.map((value, month) => <rect key={month} x={10 + month * 33} y={92 - value} width="14" height={value} rx="2"/>)
        : <path d="M0 82 C40 78 60 60 100 64 S160 40 200 46 S260 28 300 34 S360 14 400 18"/>}
    </svg>
  </div>;
}

// A Sankey's outline: sources on the left flow into one total, which flows out to the right, as the real chart lays them out.
const sankeySources = [[2, 50], [66, 84], [100, 110], [122, 126]], sankeyTargets = [[2, 42], [58, 80], [96, 108], [120, 126]];
const sankeyBand = (from: number[], to: number[], x1: number, x2: number) => { const middle = (x1 + x2) / 2; return `M${x1} ${from[0]} C${middle} ${from[0]} ${middle} ${to[0]} ${x2} ${to[0]} L${x2} ${to[1]} C${middle} ${to[1]} ${middle} ${from[1]} ${x1} ${from[1]} Z`; };
const sankeySlots = (nodes: number[][], top: number) => nodes.reduce<number[][]>((slots, [start, end]) => [...slots, [slots.at(-1)?.[1] ?? top, (slots.at(-1)?.[1] ?? top) + end - start]], []);

/** A Sankey loading in its place: nodes and bands in the chart's shape, and optionally the transaction rows listed under it. */
export function SankeySkeleton({ label, height = 280, rows = 0 }: { label?: string; height?: number; rows?: number }) {
  const into = sankeySlots(sankeySources, 24), out = sankeySlots(sankeyTargets, 24);
  return <div role={label ? 'status' : undefined} aria-busy={label ? true : undefined} aria-hidden={label ? undefined : true}>
    {label && <span className="sr-only">{label}</span>}
    <div className="sankey-skeleton skeleton-sheen" style={{ height }}>
      <svg aria-hidden="true" viewBox="0 0 400 128" preserveAspectRatio="none">
        {sankeySources.map((node, index) => <path key={'in' + index} d={sankeyBand(node, into[index], 70, 194)}/>)}
        {sankeyTargets.map((node, index) => <path key={'out' + index} d={sankeyBand(out[index], node, 202, 326)}/>)}
        {sankeySources.map(([y1, y2]) => <rect key={'s' + y1} x="64" y={y1} width="6" height={y2 - y1} rx="2"/>)}
        <rect x="194" y="24" width="8" height={into.at(-1)![1] - 24} rx="2"/>
        {sankeyTargets.map(([y1, y2]) => <rect key={'t' + y1} x="326" y={y1} width="6" height={y2 - y1} rx="2"/>)}
        {sankeySources.map(([y1, y2], index) => <rect key={'sl' + y1} className="sankey-skeleton-label" x={20 + index * 6} y={(y1 + y2) / 2 - 2} width={38 - index * 6} height="4" rx="2"/>)}
        {sankeyTargets.map(([y1, y2], index) => <rect key={'tl' + y1} className="sankey-skeleton-label" x="338" y={(y1 + y2) / 2 - 2} width={44 - index * 5} height="4" rx="2"/>)}
      </svg>
    </div>
    {rows > 0 && <div className="drill-transactions drill-skeleton" aria-hidden="true"><Skeleton className="h-4 w-24"/><ul>{Array.from({ length: rows }, (_, index) =>
      <li className="drill-skeleton-row" key={index}><span><Skeleton className="h-4 w-36"/><Skeleton className="h-3 w-24"/></span><Skeleton className="h-4 w-20"/></li>)}</ul></div>}
  </div>;
}

/** The Net worth card below its header while history loads: chart heading, tracking date, legend, chart, the three period totals and the settings row, in the card's final shape so nothing moves when they arrive. */
export function NetWorthBodySkeleton({ label }: { label?: string }) {
  const body = <div aria-hidden="true">
    <div className="overview-chart-heading"><div className="overview-chart-title"><Skeleton className="h-6 w-36"/><Skeleton className="h-9 w-56"/></div><div className="comparison-legend w-full">{[112, 96, 120, 136].map(width => <Skeleton key={width} className="h-8 rounded-full" style={{ width }}/>)}</div></div>
    <ChartSkeleton/>
    <div className="portfolio-headline">{[0, 1, 2].map(index => <div key={index}><Skeleton className="h-5 w-28 max-w-full"/><Skeleton className="h-8 w-32 max-w-full"/></div>)}</div>
    <div className="overview-details"><div className="net-worth-skeleton-settings"><Skeleton className="h-4 w-44"/></div></div>
  </div>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{body}</div> : body;
}
