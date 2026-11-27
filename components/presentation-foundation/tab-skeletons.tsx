import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { assetRecordKinds } from '@/lib/finance';
import { ChartSkeleton } from './loading-placeholder';
import { Bar, Heading, Loading, Tiles, Toolbar, times } from './skeleton-kit';

// The loading shapes of the views behind a screen's tabs and of the panels that load after their screen, block for block
// as each loaded view draws them. Change a view, change its shape here with it (docs/agents/interface.md, Shimmer follows
// the screen).

/** A part that loads inside a page already on screen: announced when it carries a label, decoration otherwise. */
function Part({ label, children }: { label?: string; children: ReactNode }) {
 return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span><div aria-hidden="true">{children}</div></div> : <>{children}</>;
}

/** A record table's name cell: the category tile over the name and its line. */
const nameCell = (width: number) => <div className="record-name"><Skeleton className="size-9 shrink-0 rounded-[10px]"/><div className="grid gap-1.5"><Bar width={width}/><Skeleton className="h-3 w-20"/></div></div>;

/** Cash flow's Forecast: Projected cash (horizon switch, the balance picker, three figures, the chart), What if with its
 * form, then Cash movements ahead as a table grouped by month. */
export function ForecastSkeleton({ label }: { label: string }) {
 return <Loading label={label}>
  <section className="panel forecast-panel"><Heading width={160} aside={250}/>
   <Skeleton className="forecast-series h-11 w-full rounded-xl"/>
   <Tiles count={3} note/>
   <ChartSkeleton height={260}/>
  </section>
  <section className="panel forecast-what-if"><Heading width={90}/>
   <div className="forecast-what-if-form">{[0, 180, 0, 200, 0].map((width, field) => width ? <Skeleton key={field} className="h-11 rounded-xl" style={{ width }}/> : <label key={field}><Skeleton className="h-4 w-20"/><Skeleton className="h-11 w-full rounded-xl"/></label>)}<Skeleton className="h-11 w-32 rounded-lg"/></div>
  </section>
  <section className="panel upcoming-section forecast-events"><header className="upcoming-section-heading"><Bar className="h-6" width={220}/></header>
   <div className="table-scroll"><table>
    <thead><tr>{[48, 40, 56].map((width, column) => <th key={column}><Bar className="h-3" width={width}/></th>)}</tr></thead>
    <tbody>{[3, 2].flatMap((rows, month) => [
     <tr className="table-group-row" key={'m' + month}><th colSpan={3}><div className="table-group-label"><Skeleton className="h-4 w-32"/><Skeleton className="h-4 w-20"/></div></th></tr>,
     ...times(rows).map(row => <tr key={month + '-' + row}><td>{nameCell(120 + (row % 3) * 30)}</td><td><Skeleton className="h-4 w-28"/></td><td><Skeleton className="h-4 w-20"/></td></tr>),
    ])}</tbody>
   </table></div>
  </section>
 </Loading>;
}

/** Spending watchlists: the heading over the cards (name, spent of target, two lines) and the Add disclosure. */
export function WatchlistsSkeleton({ label }: { label: string }) {
 return <Loading label={label}><section className="panel tools-panel"><Bar className="h-6" width={200}/>
  <div className="review-grid">{times(3).map(card => <article key={card}><Skeleton className="h-4 w-24"/><Skeleton className="h-5 w-36 max-w-full"/><Skeleton className="h-4 w-32"/><Skeleton className="h-4 w-40 max-w-full"/><Skeleton className="size-9 rounded-lg"/></article>)}</div>
  <Skeleton className="h-5 w-44"/>
 </section></Loading>;
}

/** The Income tab's estimate: Your monthly income sources as cards (icon, name and badge over the amount). */
export function IncomeEstimatesSkeleton({ label }: { label: string }) {
 return <Loading label={label}><section className="panel income-estimates"><Heading width={260} link/>
  <ul className="income-source-grid">{times(3).map(card => <li className="income-source-card" key={card}><div className="income-source-heading"><Skeleton className="size-10 shrink-0 rounded-xl"/><Skeleton className="h-4 w-28"/><Skeleton className="h-6 w-20 rounded-full"/></div><Skeleton className="h-7 w-32"/></li>)}</ul>
 </section></Loading>;
}

/** A holding or account card in the loaded `AssetCard`'s own classes, so a grid lays it on the same rows: icon, name over
 * its kind badge, menu; its worth; its one fact; the share line; then its details heading and rows, always shown. */
export function AssetCardSkeleton() {
 return <article className="asset-card">
  <header className="asset-card-header"><span className="asset-card-icon"><Skeleton className="size-10 rounded-xl"/></span><div><Bar width={112}/><Skeleton className="h-5 w-16 rounded-full"/></div><span className="shrink-0"><Skeleton className="size-8 rounded-lg"/></span></header>
  <div className="asset-card-worth"><Skeleton className="h-8 w-32 max-w-full"/></div>
  <div className="asset-card-facts"><div><Skeleton className="h-4 w-20"/><Skeleton className="h-4 w-24"/></div></div>
  <div className="asset-card-share"/>
  <div className="asset-card-details"><div className="asset-card-details-head"><Skeleton className="h-4 w-24"/></div>
   <div className="grid gap-2 pt-1 pb-3">{[84, 60, 72].map(width => <div key={width} className="flex justify-between gap-3.5"><Skeleton className="h-4" style={{ width }}/><Skeleton className="h-4 w-16"/></div>)}</div></div>
 </article>;
}

/** A grid of holding cards still loading, in the loaded grid's own class (`layout` as the Other assets switch sets it). */
export function AssetCardsSkeleton({ label, cards = 3, layout }: { label?: string; cards?: number; layout?: string }) {
 return <Part label={label}><div className={layout ? 'asset-card-grid asset-layout-' + layout : 'asset-card-grid'}>{times(cards).map(card => <AssetCardSkeleton key={card}/>)}</div></Part>;
}

/** A holdings list row as `perf-list` draws it: the icon tile, the name over its line, then what sits at the end. */
const perfRow = (row: number, end: ReactNode) => <li key={row}><Skeleton className="size-9 shrink-0 rounded-[10px]"/><span className="grid gap-1.5"><Bar width={[120, 96, 140][row % 3]}/><Skeleton className="h-3 w-24"/></span>{end}</li>;

/** Investments' Profit & loss, as `PerformanceView` draws it: the total with its return badge, the period switch over
 * today's value, the five lines and the four return tiles; two charts side by side, then the monthly result beside the
 * drawdown (`PerformanceCharts`); Where it came from with its grouping switch over the holdings table; Realized gains. */
export function PerformanceSkeleton({ label }: { label: string }) {
 return <Loading label={label}><div className="performance">
  <section className="panel performance-hero">
   <header className="performance-hero-head"><div className="grid gap-2"><Skeleton className="h-4 w-28"/><Skeleton className="h-10 w-40 max-w-full"/><div className="flex items-center gap-2"><Skeleton className="h-7 w-20 rounded-full"/><Skeleton className="h-4 w-32"/></div></div>
    <div className="performance-hero-aside"><Skeleton className="h-11 w-80 max-w-full rounded-xl"/><div className="grid justify-items-end gap-1.5"><Skeleton className="h-4 w-20"/><Skeleton className="h-6 w-24"/></div></div></header>
   <ul className="performance-lines">{times(5).map(line => <li key={line}><Skeleton className="h-4 w-24"/><Skeleton className="h-5 w-16"/></li>)}</ul>
   <Tiles count={4} columns="auto"/>
  </section>
  <div className="performance-columns">{[230, 230].map((width, index) => <section className="panel" key={index}><Heading width={width}/><ChartSkeleton height={260}/></section>)}</div>
  <div className="performance-columns">{[230, 140].map((width, index) => <section className="panel" key={width}><Heading width={width}/><ChartSkeleton bars={index === 0} height={260}/></section>)}</div>
  <section className="panel"><Heading width={200} aside={290}/>
   <div className="table-scroll"><table className="perf-table">
    <thead><tr>{[44, 40, 56, 72, 60, 110, 84, 44].map((width, column) => <th key={column}><Bar className="h-3" width={width}/></th>)}</tr></thead>
    <tbody>{times(3).map(row => <tr key={row}><th><span className="perf-name"><Skeleton className="size-10 shrink-0 rounded-xl"/><span className="grid gap-1.5"><Bar width={[64, 88, 52][row]}/><Skeleton className="h-3 w-12"/></span></span></th>{times(7).map(column => <td key={column}><Bar className="ms-auto h-4" width={48}/></td>)}</tr>)}</tbody>
   </table></div>
  </section>
  <section className="panel"><Heading width={170}/><ul className="perf-list">{times(2).map(row => perfRow(row, <Bar width={64}/>))}</ul></section>
 </div></Loading>;
}


/** Investments' Payouts & alerts: Expected payouts (its months, the first one open) beside Price alerts (the alerts,
 * then the add form), as `PayoutsAlertsView` draws them. The Bitcoin panels below come only with a Bitcoin holding. */
export function PayoutsAlertsSkeleton({ label }: { label: string }) {
 return <Loading label={label}><div className="performance">
  <div className="performance-columns">
   <section className="panel"><Heading width={190} link/>
    <div className="payout-months">{times(3).map(month => <div key={month}>
     <div className="flex items-center justify-between gap-3 py-3"><Bar width={110}/><Bar width={64}/></div>
     {month === 0 && <ul className="perf-list">{times(3).map(row => perfRow(row, <Bar width={56}/>))}</ul>}
    </div>)}</div>
   </section>
   <section className="panel"><Heading width={140}/>
    <ul className="perf-list">{times(2).map(row => perfRow(row, <Skeleton className="h-6 w-16 rounded-full"/>))}</ul>
    <div className="alert-form">{[80, 104, 72].map(width => <label key={width}><Skeleton className="mb-2 h-4" style={{ width }}/><Skeleton className="h-11 w-full rounded-xl"/></label>)}<Skeleton className="h-10 w-28 rounded-lg"/></div>
   </section>
  </div>
 </div></Loading>;
}

/** A labelled field as the allocation form lays it out: the label over the input. */
const Field = ({ width }: { width: number }) => <label><Skeleton className="mb-2 h-4" style={{ width }}/><Skeleton className="h-11 w-full rounded-xl"/></label>;

/** Investments' Target allocation, as `PortfolioAllocationPlan` draws it: the heading; the target net worth, its
 * currency and date; a weight field a kind and the cash to allocate; the weights total; the drift table; Save targets. */
export function AllocationSkeleton({ label }: { label: string }) {
 return <Loading label={label}><section className="panel tools-panel"><Bar className="h-6" width={150}/>
  <div className="tracker-fields"><div className="allocation-net-worth-target">{[110, 70, 90].map(width => <Field key={width} width={width}/>)}</div>
   {times(assetRecordKinds.length + 1).map(field => <Field key={field} width={[70, 96, 84, 120][field % 4]}/>)}</div>
  <Bar width={160}/>
  <div className="table-scroll"><table className="label-table">
   <thead><tr>{[64, 96, 92, 120, 150].map((width, column) => <th key={column}><Bar className="h-3" width={width}/></th>)}</tr></thead>
   <tbody>{times(2).map(row => <tr key={row}><td><Skeleton className="h-6 w-20 rounded-full"/></td>{[48, 48, 40, 40].map((width, column) => <td key={column}><Bar className="ms-auto h-4" width={width}/></td>)}</tr>)}</tbody>
  </table></div>
  <Skeleton className="h-11 w-28 rounded-lg"/>
 </section></Loading>;
}

/** Loans' Debt payoff planner: the three answers, then Balance owed and the payoff order beside the method and payments. */
export function PayoffPlannerSkeleton({ label }: { label: string }) {
 return <Loading label={label}>
  <Tiles count={3} note/>
  <div className="loans-layout">
   <div className="loans-main">
    <section className="panel"><Heading width={140} aside={120}/><div className="payoff-today"><Skeleton className="h-8 w-36"/><Skeleton className="h-4 w-12"/></div><ChartSkeleton height={260}/></section>
    <section className="panel"><Heading width={130} aside={96}/><ol className="payoff-order">{times(3).map(row => <li key={row}><Skeleton className="size-6 rounded-full"/><Skeleton className="size-9 rounded-[10px]"/><span className="grid gap-1.5"><Bar width={120 + row * 20}/><Skeleton className="h-3 w-24"/></span><Skeleton className="h-4 w-24"/></li>)}</ol></section>
   </div>
   <div className="loans-side">
    <section className="panel"><Heading width={140}/><div className="payoff-methods">{times(2).map(method => <Skeleton key={method} className="h-24 w-full rounded-xl"/>)}</div></section>
    <section className="panel"><Heading width={110}/><div className="payoff-payments">{times(3).map(field => <label key={field}><Skeleton className="h-4 w-36"/><Skeleton className="h-11 w-full rounded-xl"/></label>)}</div><Skeleton className="h-10 w-28 rounded-lg"/></section>
   </div>
  </div>
 </Loading>;
}

/** Recurring's Reminders: the heading over each reminder (name and its line) with its two actions. */
export function RemindersSkeleton({ label }: { label: string }) {
 return <Loading label={label}><section className="panel tools-panel reminders-panel"><Heading width={130}/>
  <ul className="tool-list">{times(3).map(row => <li key={row}><div className="grid gap-1.5"><Bar width={130 + (row % 3) * 30}/><Skeleton className="h-3 w-56 max-w-full"/></div><div className="entry-actions"><Skeleton className="h-[42px] w-44 rounded-lg"/></div></li>)}</ul>
 </section></Loading>;
}

/** Recurring's Calendar: the weekday names over five weeks of days, some with a payment chip, and the legend. */
export function CalendarSkeleton() {
 return <section className="panel recurring-calendar">
  <div className="recurring-calendar-grid">
   <div className="recurring-calendar-week">{times(7).map(day => <span role="columnheader" key={day}><Skeleton className="h-3 w-8"/></span>)}</div>
   {times(5).map(week => <div className="recurring-calendar-week" key={week}>{times(7).map(day => <div className="recurring-calendar-day" key={day}>
    <span className="recurring-calendar-date"><Skeleton className="size-5 rounded-full"/></span>
    {(week * 7 + day) % 5 === 2 && <Skeleton className="mt-1 h-5 w-full max-w-20 rounded-full"/>}
   </div>)}</div>)}
  </div>
  <ul className="recurring-calendar-legend">{times(3).map(tone => <li key={tone}><Skeleton className="h-3 w-16"/></li>)}</ul>
 </section>;
}

/** Budget's Year: a category a row, a month a column and the total, in the loaded table. */
export function BudgetYearSkeleton({ label }: { label: string }) {
 return <Loading label={label}><section className="panel budget-year"><div className="budget-year-scroll"><table>
  <thead><tr><th scope="col"><Skeleton className="h-3 w-16"/></th>{times(13).map(month => <th scope="col" key={month}><Skeleton className="ms-auto h-3 w-8"/></th>)}</tr></thead>
  <tbody>{times(8).map(row => <tr key={row}><th scope="row"><Bar width={100 + (row % 3) * 30}/></th>{times(13).map(month => <td key={month}><Skeleton className="ms-auto h-3 w-12"/><Skeleton className="ms-auto mt-1.5 h-3 w-10"/></td>)}</tr>)}</tbody>
 </table></div></section></Loading>;
}

/** Reports' Tax: the business, year and period row, the note, then the Income and Expenses parts line by line and the net. */
export function TaxPrepSkeleton({ label }: { label: string }) {
 return <Loading label={label}><div className="tax-prep">
  <Toolbar controls={[200, 120, 220, 190, 160]}/>
  <Skeleton className="h-4 w-full max-w-2xl"/>
  {[3, 6].map((lines, part) => <section className="panel tax-part" key={part}><Heading width={120}/>
   <ol className="tax-lines">{times(lines).map(line => <li key={line}><div className="tax-line-heading"><Skeleton className="size-4 rounded"/><Bar width={150 + (line % 3) * 40}/><Skeleton className="ms-auto h-4 w-20"/></div></li>)}</ol>
  </section>)}
  <section className="panel tax-net"><Skeleton className="h-5 w-32"/><Skeleton className="h-4 w-36"/><Skeleton className="ms-auto h-6 w-24"/></section>
 </div></Loading>;
}
