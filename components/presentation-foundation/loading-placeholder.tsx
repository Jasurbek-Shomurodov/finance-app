import { Skeleton } from '@/components/ui/skeleton';

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

/** The dashboard board's two columns of cards, in the person's saved order. */
type DashboardSkeletonColumns = { left: readonly string[]; right: readonly string[] };
const defaultDashboardSkeleton: DashboardSkeletonColumns = { left: ['net_worth', 'spending'], right: ['upcoming', 'goals', 'transactions'] };
const chartCards = new Set(['spending', 'allocation', 'income']);

/** One dashboard card while the workspace loads: Net worth in its full shape, chart cards with a chart, the rest with rows. */
function DashboardCardSkeleton({ card }: { card: string }) {
  if (card === 'net_worth') return <section className="panel overview-hero"><div className="overview-hero-head"><div className="overview-hero-value"><Skeleton className="h-8 w-56 max-w-full"/></div><Skeleton className="h-11 w-96 max-w-full rounded-xl"/></div><NetWorthBodySkeleton/></section>;
  return <section className="panel overview-panel"><Skeleton className="mb-6 h-8 w-1/3"/>{chartCards.has(card) ? <Skeleton className="h-52 w-full"/> : <SkeletonRows rows={3}/>}</section>;
}

/** The dashboard while the workspace loads: its headline tiles over the board's two columns. */
export function WorkspaceSkeleton({ label, columns = defaultDashboardSkeleton }: { label: string; columns?: DashboardSkeletonColumns }) {
  // The first few cards of each column fill the screen; drawing every card would only make the page longer than it loads.
  const beside = columns.left.includes('net_worth') ? 1 : columns.right.includes('net_worth') ? 0 : -1;
  return <div role="status" aria-busy="true" className="overview-content-loading">
    <span className="sr-only">{label}</span>
    {/* The key figures, as the loaded page places them: atop the column beside Net worth over time, or above the board. */}
    <div className="dashboard-headline" data-beside={beside >= 0 || undefined}><StatTilesSkeleton columns={beside >= 0 ? 2 : 4} count={4}/></div>
    <div aria-hidden="true" className="dashboard-grid">{[columns.left, columns.right].map((cards, index) => <div className="dashboard-column" key={index}>{index === beside && <div className="dashboard-lead"><StatTilesSkeleton columns={2} count={4}/></div>}{cards.slice(0, 3).map(card => <DashboardCardSkeleton card={card} key={card}/>)}</div>)}</div>
  </div>;
}

/** Accounts while records load, in the loaded page's shape: the Total tile, one account group with its cards, and the selected account's card beside it. */
export function AccountsSkeleton({ label, filters = false }: { label: string; filters?: boolean }) {
  return <div role="status" aria-busy="true" className="overview-content-loading">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="stat-tiles" data-columns="auto"><article className="stat-tile"><Skeleton className="h-4 w-28"/><Skeleton className="h-8 w-36"/></article></div>
    {filters && <div aria-hidden="true" className="transactions-tools"><Skeleton className="h-11 w-44 rounded-xl"/><Skeleton className="h-11 w-36 rounded-xl"/></div>}
    <div aria-hidden="true" className="accounts-master-detail">
      <section className="account-directory"><div className="panel account-group">
        <div className="account-group-skeleton-head"><Skeleton className="h-6 w-28"/><Skeleton className="ms-auto h-6 w-36"/></div>
        <div className="account-card-grid">{Array.from({ length: 5 }, (_, index) => <div className="account-sortable-row" key={index}><div className="account-list-row"><Skeleton className="size-[38px] rounded-[10px]"/><span className="account-list-name"><Skeleton className="h-5 w-36 max-w-full"/><Skeleton className="mt-1.5 h-[18px] w-24"/></span><strong><Skeleton className="h-6 w-24"/></strong></div></div>)}</div>
      </div></section>
      <div className="account-selected-panel"><article className="panel account-card">
        <header><Skeleton className="size-[38px] rounded-[10px]"/><div className="account-card-heading"><Skeleton className="h-6 w-32"/><Skeleton className="h-4 w-24"/></div></header>
        <Skeleton className="mt-2 h-12 w-48 max-w-full"/>
        <div className="account-balance-facts"><Skeleton className="h-5 w-full"/><Skeleton className="h-5 w-full"/></div>
        <div className="account-card-actions"><Skeleton className="h-[42px] w-full"/><Skeleton className="h-[42px] w-full"/></div>
      </article></div>
    </div>
  </div>;
}

/** The two Cash flow preview panels (income this month, spending plans) while their records load. */
export function CashflowPreviewSkeleton({ label }: { label?: string }) {
  const grid = <div aria-hidden="true" className="cashflow-preview-grid">
    <section className="panel"><Skeleton className="mb-4 h-5 w-1/3"/><SkeletonRows rows={3}/></section>
    <section className="panel"><Skeleton className="mb-4 h-5 w-1/3"/><SkeletonRows rows={3}/></section>
  </div>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{grid}</div> : grid;
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
