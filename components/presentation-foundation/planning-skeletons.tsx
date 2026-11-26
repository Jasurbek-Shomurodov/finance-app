import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { InvestmentsHint } from '@/lib/shimmer-hints';
import { ChartSkeleton } from './loading-placeholder';
import { Bar, Figures, Heading, Loading, Tiles, Track, times } from './skeleton-kit';
import { AssetCardsSkeleton } from './tab-skeletons';

// The planning and net-worth screens' loading shapes, block for block as each loaded page draws them. Change a screen,
// change its shape here with it (docs/agents/interface.md, Shimmer follows the screen).

/** A goal on the list: grip, cover, the name and saved figures over the progress line, and its menu. */
function GoalRow() {
  return <li className="goal-row"><Skeleton className="h-6 w-5 shrink-0 rounded"/><div className="goal-row-main"><Skeleton className="size-12 shrink-0 rounded-xl"/>
    <div className="goal-row-skeleton-body"><div><Skeleton className="h-4 w-40 max-w-full"/><Skeleton className="h-4 w-20"/></div><div><Skeleton className="h-3 w-32"/><Skeleton className="h-3 w-24"/></div><Track/></div>
  </div><Skeleton className="size-9 shrink-0 rounded-lg"/></li>;
}

/** Goals: on a phone the tabs and Add goal the page opens with (its `PageHeader` loads with the page); the goal list with its view switch, the chosen goal (figure, projection, four figures, when it is reached and
 * its action), and what is available for goals under the list. With `empty` (the workspace has no goals) the list's
 * empty state alone. */
export function GoalsSkeleton({ label, empty = false }: { label: string; empty?: boolean }) {
  // With no goals the page is the list's panel alone, its title over the empty state's icon, words and Add goal.
  if (empty) return <Loading label={label} heading="/goals"><div className="goals-split"><section className="panel goals-list"><Heading width={110}/>
    <div className="empty"><Skeleton className="size-10 rounded-xl"/><Skeleton className="h-5 w-56 max-w-full"/><Skeleton className="h-4 w-72 max-w-full"/><Skeleton className="h-4 w-56 max-w-full"/><Skeleton className="h-10 w-28 rounded-lg"/></div>
  </section></div></Loading>;
  return <Loading label={label} heading="/goals">
    <div className="goals-split">
      <section className="panel goals-list"><Heading width={110} aside={168}/><ul className="goal-rows">{times(3).map(row => <GoalRow key={row}/>)}</ul></section>
      <section className="panel goal-detail">
        <header className="goal-detail-head"><Skeleton className="size-11 rounded-xl"/><div className="grid flex-1 gap-2"><Skeleton className="h-6 w-48 max-w-full"/><Skeleton className="h-4 w-32"/></div><Skeleton className="size-10 rounded-lg"/></header>
        <div className="flex items-end justify-between gap-3"><Skeleton className="h-10 w-40"/><Skeleton className="h-5 w-10"/></div>
        <div className="goal-detail-chart"><Skeleton className="mb-2 h-4 w-48"/><ChartSkeleton height={150}/></div>
        <Tiles count={4} columns={2}/>
        <Skeleton className="h-10 w-full rounded-xl"/>
        <Skeleton className="h-10 w-full rounded-lg"/>
      </section>
      <section className="panel goal-funding-panel"><Heading width={240} aside={128}/><Skeleton className="h-12 w-72 max-w-full rounded-xl"/><Skeleton className="h-3 w-full rounded-full"/><Figures rows={5} className="goal-funding-figures"/></section>
    </div>
  </Loading>;
}

/** A summary figure as `portfolio-summary-metrics` lays it: its label over the figure (the loaded page's own loading bar). */
const Metric = ({ width, children }: { width: number; children?: ReactNode }) => <div><Bar className="h-3.5" width={width}/><Skeleton className="h-7 w-28 max-w-full"/>{children}</div>;

/** Investments' Holdings, in the loaded `AssetDashboard`'s classes (`heading`: the drawer's shimmer also reserves the
 * phone's tabs and Add asset). The summary: Your holdings with its count over the total, then Net worth, Outstanding debt
 * and Profit & loss (its return badge and View all); Asset allocation as the donut beside a row a kind (dot, name,
 * amount, share, bar); Accounts with Manage accounts over its cards or the "No accounts yet." line; then Other assets
 * with the layout switch, the category filter and the cards. `hint` (lib/shimmer-hints.ts) says how many of each the
 * workspace will draw; without one the usual shape is drawn. */
export function InvestmentsSkeleton({ label, heading = false, hint }: { label: string; heading?: boolean; hint?: InvestmentsHint }) {
  const { accounts = 2, kinds = 3, assets = 3 } = hint ?? {};
  const count = <Skeleton className="h-5 w-6 rounded-full"/>;
  return <Loading label={label} heading={heading ? '/assets' : undefined}>
    <div className="asset-dashboard">
      <section className="portfolio-summary">
        <div className="portfolio-summary-main">
          <div className="portfolio-summary-total"><div className="flex items-center gap-2"><Bar className="h-4" width={96}/>{count}</div><div className="portfolio-summary-value"><Skeleton className="h-10 w-44 max-w-full"/></div></div>
          <div className="portfolio-summary-metrics"><Metric width={64}/><Metric width={110}/>
            <Metric width={80}><Skeleton className="h-6 w-20 rounded-full"/><Bar className="h-3.5" width={48}/></Metric></div>
        </div>
        <div className="portfolio-summary-allocation"><h3><Bar className="h-5" width={130}/></h3>
          <div className="portfolio-allocation-body">{kinds > 0 && <div className="allocation-donut grid place-items-center"><Skeleton className="size-[176px] rounded-full"/></div>}
            <ul className="overview-list">{times(Math.max(kinds, 1)).map(row => <li key={row}><div className="allocation-option"><Skeleton className="size-2 rounded-full"/><Bar width={[72, 96, 60][row % 3]}/><Bar width={56}/><Bar className="h-3.5" width={36}/><span className="allocation-share"/></div></li>)}</ul></div>
        </div>
      </section>
      <section className="asset-account-section"><div className="asset-holdings-heading"><div className="flex items-center gap-2"><Bar className="h-7" width={110}/>{count}</div><Bar width={120}/></div>
        {accounts ? <AssetCardsSkeleton cards={accounts}/> : <Bar width={130}/>}</section>
      <section className="asset-holdings"><div className="asset-holdings-heading"><div className="flex items-center gap-2"><Bar className="h-7" width={130}/>{count}</div><Skeleton className="h-11 w-[78px] rounded-xl"/></div>
        <Skeleton className="asset-category-filters h-11 w-56 max-w-full rounded-xl"/>
        {assets ? <AssetCardsSkeleton cards={assets} layout="grid"/> : <div className="empty"><Skeleton className="size-10 rounded-xl"/><Skeleton className="h-5 w-40"/><Skeleton className="h-4 w-72 max-w-full"/><Skeleton className="h-10 w-44 rounded-lg"/></div>}</section>
    </div>
  </Loading>;
}

/** A loans table row: icon and name, rate, start and due dates, the paid-off bar, monthly payment, balance and actions. */
function LoanRow({ row }: { row: number }) {
  return <tr className="loan-row">
    <td><div className="record-name"><Skeleton className="size-11 shrink-0 rounded-xl"/><div className="grid gap-1.5"><Bar width={110 + (row % 3) * 30}/><Skeleton className="h-3 w-20"/></div></div></td>
    <td data-label=""><Skeleton className="h-4 w-12"/></td>
    <td data-label=""><Skeleton className="h-4 w-28"/></td>
    <td data-label=""><Skeleton className="h-4 w-28"/></td>
    <td data-label="" className="loan-progress"><Track/><Skeleton className="mt-1.5 h-3 w-32"/></td>
    <td data-label="" className="num"><Skeleton className="ms-auto h-4 w-20"/></td>
    <td className="num loan-balance"><Skeleton className="ms-auto h-5 w-20"/></td>
    <td><div className="row-actions"><Skeleton className="h-9 w-16 rounded-lg"/></div></td>
  </tr>;
}

/** The payoff plan card beside the loans: its method, the balance chart, two facts and the link to the planner. */
export function PayoffPlanCardSkeleton({ label }: { label?: string }) {
  const card = <section aria-hidden="true" className="panel payoff-plan-card"><Heading width={150}/><Skeleton className="h-6 w-36 rounded-full"/><ChartSkeleton height={110}/><Figures rows={2} className="payoff-plan-facts"/><Skeleton className="h-10 w-full rounded-lg"/></section>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{card}</div> : card;
}

/** Loans & debts: the four lending figures, then the list with its view switch, search, column names and groups. With
 * `side` (there are debts) what is owed stands beside it, and with `plan` (a payoff plan is worked out) the plan card
 * under that, as the loaded page shows them; without debts the list takes the whole width. */
export function LoansSkeleton({ label, side = true, plan = side, heading = false }: { label: string; side?: boolean; plan?: boolean; heading?: boolean }) {
  return <Loading label={label} heading={heading ? '/loans-debts' : undefined}>
    <Tiles count={4} note/>
    <div className="loans-layout">
      <section className="panel loans-list">
        <Heading width={220} aside={142}/>
        <div className="record-filters"><div className="grid flex-1 gap-2"><Skeleton className="h-4 w-24"/><Skeleton className="h-11 w-full rounded-xl"/></div><Skeleton className="h-11 w-24 rounded-xl"/></div>
        <div className="table-scroll"><table className="loans-table">
          <thead><tr>{[48, 40, 72, 64, 56, 112, 56].map((width, column) => <th key={column} className={column > 4 ? 'num' : undefined}><Skeleton className={column > 4 ? 'ms-auto h-3' : 'h-3'} style={{ width }}/></th>)}<th/></tr></thead>
          <tbody>{[3, 2].flatMap((rows, group) => [
            <tr className="table-group-row loan-group" key={'g' + group}><th colSpan={6}><Skeleton className="h-5 w-36"/></th><th className="num"><Skeleton className="ms-auto h-5 w-16"/></th><th/></tr>,
            ...times(rows).map(row => <LoanRow key={group + '-' + row} row={row}/>),
          ])}</tbody>
        </table></div>
      </section>
      {side && <div className="loans-side">
        <section className="panel owed-breakdown"><Heading width={140}/><div className="owed-breakdown-lead"><Skeleton className="size-32 rounded-full"/><div className="grid gap-2"><Skeleton className="h-4 w-20"/><Skeleton className="h-8 w-28"/></div></div><Figures rows={3} className="owed-breakdown-list"/></section>
        {plan && <PayoffPlanCardSkeleton/>}
      </div>}
    </div>
  </Loading>;
}

/** The Assistant before the first question: the opening message in the conversation's own height, the question box and
 * the note under it, beside Try asking. */
export function AssistantSkeleton({ label }: { label: string }) {
  return <Loading label={label}>
    <div className="assistant-layout"><section className="panel assistant-panel">
      <div className="assistant-log"><div className="empty"><Skeleton className="size-12 rounded-xl"/><Skeleton className="h-6 w-56 max-w-full"/></div></div>
      <div className="assistant-form"><Skeleton className="h-[77px] flex-1 rounded-xl"/><Skeleton className="size-10 rounded-xl"/></div>
      <Skeleton className="mx-auto h-4 w-80 max-w-full"/>
    </section>
    <aside className="panel assistant-prompts"><Heading width={110}/><ul>{times(5).map(row => <li key={row}><div className="assistant-prompt-skeleton"><Bar width={170 + (row % 3) * 40}/><Skeleton className="size-4 rounded"/></div></li>)}</ul></aside></div>
  </Loading>;
}

/** Recently deleted rows, grouped under their day as the loaded list: icon, name and detail, amount, and the two actions. */
export function RecoveryRowsSkeleton({ label, rows = 4 }: { label?: string; rows?: number }) {
  const list = <div aria-hidden="true" className="recovery-list">{[Math.min(1, rows), rows - Math.min(1, rows)].filter(Boolean).map((count, day) => <section className="recovery-day" key={day}>
    <h3><Skeleton className="h-4 w-28"/></h3>
    <ul>{times(count).map(row => <li className="recovery-row skeleton-row" key={row}>
      <span className="transaction-merchant flex-1"><Skeleton className="size-9 shrink-0 rounded-[10px]"/><span className="grid gap-1.5"><Skeleton className="h-4 w-36 max-w-full"/><Skeleton className="h-3 w-48 max-w-full"/></span></span><Skeleton className="h-5 w-16"/><span className="row-actions"><Skeleton className="h-9 w-24 rounded-lg"/><Skeleton className="size-9 rounded-lg"/></span>
    </li>)}</ul>
  </section>)}</div>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{list}</div> : list;
}

/** The chosen deleted item beside the list: its icon, name and amount, its facts, and Delete and Restore. */
export function RecoveryDetailSkeleton() {
  return <aside aria-hidden="true" className="panel recovery-detail"><header className="recovery-detail-head"><Skeleton className="size-9 shrink-0 rounded-[10px]"/><div className="grid flex-1 gap-1.5"><Skeleton className="h-5 w-40"/><Skeleton className="h-4 w-28"/></div><Skeleton className="h-6 w-16"/></header><Figures rows={3} className="recovery-facts"/><div className="recovery-detail-actions"><Skeleton className="size-10 rounded-lg"/><Skeleton className="h-10 flex-1 rounded-lg"/></div></aside>;
}

/** Recently deleted: the search over the day groups, beside the first item's details (the loaded page
 * opens with its first item chosen, so the list never starts at full width and then narrows). */
export function RecentlyDeletedSkeleton({ label }: { label: string }) {
  return <Loading label={label} heading="/recently-deleted"><div className="recovery-layout"><section className="panel records recovery-panel"><div className="recovery-tools"><Skeleton className="h-11 w-full rounded-xl"/></div><RecoveryRowsSkeleton rows={6}/></section>
    <div className="recovery-side"><RecoveryDetailSkeleton/></div>
  </div></Loading>;
}

/** The three Profile & preferences cards, each a heading over its rows of label and control. */
export function PreferencesSkeleton({ label }: { label?: string }) {
  // Each card's rows by the height of their control: fields, then the larger choosers (currencies, the time zone and region).
  const cards = <div aria-hidden="true">{[[44, 44, 44], [44, 176], [112, 112]].map((rows, card) => <section className="panel preferences-card" key={card}>
    <header><Skeleton className="h-5 w-28"/></header>
    {rows.map((height, row) => <div className="setting-row" key={row}><span className="setting-label"><Skeleton className="h-4 w-32"/></span><div className="setting-control"><Skeleton className="w-full rounded-xl" style={{ height }}/></div></div>)}
  </section>)}</div>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{cards}</div> : cards;
}

/** Settings: the section list in its groups beside Profile & preferences. */
export function SettingsSkeleton({ label }: { label: string }) {
  return <Loading label={label}>
    <div className="settings-layout"><div className="settings-columns">
      <nav className="settings-nav">{[3, 7].map((items, group) => <div className="settings-nav-group" key={group}><h2><Skeleton className="h-3 w-16"/></h2><ul>{times(items).map(item => <li key={item}><Skeleton className="h-10 w-full rounded-lg"/></li>)}</ul></div>)}</nav>
      <div className="settings-sections"><section className="settings-area"><div className="settings-page"><Skeleton className="mb-4 h-6 w-48"/><PreferencesSkeleton/></div></section></div>
    </div></div>
  </Loading>;
}
