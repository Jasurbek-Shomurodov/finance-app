import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartSkeleton } from './loading-placeholder';
import { Bar, Figures, Heading, Loading, Tiles, Toolbar, times } from './skeleton-kit';

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

/** A holding or account card: icon, name and line, menu; its worth, a fact, the share line and the details row. */
export function AssetCardSkeleton() {
 return <article className="panel asset-card asset-card-skeleton">
  <header className="asset-card-header"><Skeleton className="size-10 shrink-0 rounded-xl"/><div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-32"/><Skeleton className="h-3 w-24"/></div><Skeleton className="size-8 rounded-lg"/></header>
  <Skeleton className="h-8 w-36"/><Skeleton className="h-4 w-48 max-w-full"/><Skeleton className="h-1 w-full rounded-full"/>
  <div className="asset-card-details"><Skeleton className="h-10 w-full rounded-lg"/><Figures rows={3}/></div>
 </article>;
}

/** A grid of holding cards still loading, in the loaded grid's own class (`layout` as the Other assets switch sets it). */
export function AssetCardsSkeleton({ label, cards = 3, layout }: { label?: string; cards?: number; layout?: string }) {
 return <Part label={label}><div className={layout ? 'asset-card-grid asset-layout-' + layout : 'asset-card-grid'}>{times(cards).map(card => <AssetCardSkeleton key={card}/>)}</div></Part>;
}

/** Investments' Profit & loss: the total with its period switch and lines, two charts side by side, then the monthly
 * result beside the drawdown (`PerformanceCharts`). */
export function PerformanceSkeleton({ label }: { label: string }) {
 return <Loading label={label}><div className="performance">
  <section className="panel performance-hero">
   <header className="performance-hero-head"><div className="grid gap-2"><Skeleton className="h-4 w-28"/><Skeleton className="h-10 w-48 max-w-full"/><Skeleton className="h-4 w-56 max-w-full"/></div><div className="performance-hero-aside"><Skeleton className="h-10 w-72 max-w-full rounded-xl"/><Skeleton className="h-5 w-36"/></div></header>
   <ul className="performance-lines">{times(4).map(line => <li key={line}><Skeleton className="h-4 w-24"/><Skeleton className="h-5 w-20"/></li>)}</ul>
  </section>
  <div className="performance-columns">{[200, 210].map(width => <section className="panel" key={width}><Heading width={width}/><ChartSkeleton height={260}/></section>)}</div>
  <div className="performance-columns">{[180, 90].map((width, index) => <section className="panel" key={width}><Heading width={width}/><ChartSkeleton bars={index === 0} height={260}/></section>)}</div>
 </div></Loading>;
}

/** Investments' Target allocation: the heading, the target fields and the weights table. */
export function AllocationSkeleton({ label }: { label: string }) {
 return <Loading label={label}><section className="panel tools-panel"><Bar className="h-6" width={170}/>
  <div className="tracker-fields">{times(6).map(field => <label key={field}><Skeleton className="mb-2 h-4 w-28"/><Skeleton className="h-11 w-full rounded-xl"/></label>)}</div>
  <Skeleton className="h-10 w-28 rounded-lg"/>
  <div className="table-scroll"><table className="label-table">
   <thead><tr>{[64, 96, 92, 120, 150].map((width, column) => <th key={column}><Bar className="h-3" width={width}/></th>)}</tr></thead>
   <tbody>{times(4).map(row => <tr key={row}>{[96, 48, 48, 72, 72].map((width, column) => <td key={column}><Bar width={width}/></td>)}</tr>)}</tbody>
  </table></div>
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
