"use client";
import type { Entry } from '@/lib/finance';
import type { PlanningData } from '@/lib/planning';
import { useLanguage } from '@/components/language-provider';
import { WorkspaceSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { OverviewHeading, useOverviewCards } from '@/components/overview-page';
import { useState, type ReactNode } from 'react';
import { Check, LayoutGrid } from 'lucide-react';
import { CustomizeDashboardDialog, DashboardBoard } from '@/components/dashboard-board';
import { BudgetCard, GoalsCard, RecentTransactionsCard, useMonthBudget } from '@/components/dashboard-cards';
import { DashboardHeadline, useHeadlineFigures } from '@/components/dashboard-headline';
import { dashboardGlance, WhereCard } from '@/components/dashboard-where';
import { Button } from '@/components/ui/button';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { usePortfolioHistory } from '@/hooks/use-portfolio-history';
import { useExpectedPayouts } from '@/hooks/use-expected-payouts';
import { columnOf, dashboardColumns, type DashboardCard } from '@/lib/dashboard-layout';
import { depositToday } from '@/lib/deposit-interest';
import { savedGoalOrder } from '@/lib/goal-order';
import { firstVisit } from '@/lib/onboarding';
import { goalFinancials } from '@/lib/goal-projection';
import { transactionsHref } from '@/lib/transaction-list';
import { PortfolioOverview } from '@/components/portfolio-overview';
import { SpendingPaceCard, useSpendingPace } from '@/components/spending-pace-card';
import { TelegramNudge } from '@/components/telegram-nudge';
import { ScreenNotices, ToolsUnavailable } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

type Lists = readonly (readonly Entry[] | undefined)[];
/** Opens the record with an id, looked up in each list; an id found nowhere opens nothing. */
const openFrom = (lists: Lists, open: (record: Entry) => void) => (id: string) => {
 const found = lists.flatMap(list => list ?? []).find(row => row.id === id);
 if (found) open(found);
};
/** What the net worth card's detail lines open: a transaction its details (`view`), and a holding its history (`track`),
 * which the sample workspace does not offer, as on Loans & debts. Records are looked up in `lists`, then in the history. */
function periodOpener({ lists, history, demo, view, track }: { lists: Lists; history: { records: readonly Entry[]; cashflows?: readonly Entry[] } | null | undefined; demo: boolean; view: (record: Entry) => void; track: (record: Entry) => void }) {
 const all = [...lists, history?.cashflows, history?.records];
 return { transaction: openFrom(all, view), ...(!demo && { holding: openFrom(all, track) }) };
}
/** This month's budget, once one is saved and known: where the even-pace line runs to. */
const settledPlan = (budget: { budgeted: boolean; loading: boolean; error?: unknown; plan: number | null }) => budget.budgeted && !budget.loading && !budget.error ? budget.plan : null;
/** With the Net worth card shown, the key figures lead the column beside it. */
const headlineLead = (layout: Parameters<typeof columnOf>[0], shown: boolean, node: ReactNode) => shown ? { column: columnOf(layout, 'net_worth') === 'left' ? 'right' as const : 'left' as const, node } : undefined;
const anyFailed = (...errors: unknown[]) => errors.some(Boolean);
type CardContext = { planningReady: boolean; spending: ReturnType<typeof useSpendingPace>; glance: ReturnType<typeof dashboardGlance>; monthBudget: ReturnType<typeof useMonthBudget>; cards: ReturnType<typeof useOverviewCards>;
 planning: PlanningData; preferences: Parameters<typeof savedGoalOrder>[0]; currency: string; market: Parameters<typeof goalFinancials>[3]; user: string | null | undefined; demo: boolean; reload: number; open: (record: Entry) => void };
/** Every Dashboard card by its id; the ones that read records wait for them (`planningReady`). */
function dashboardCards({ netWorth, income }: { netWorth: ReactNode; income: ReactNode }, { planningReady, spending, glance, monthBudget, cards, planning, preferences, currency, market, user, demo, reload, open }: CardContext): Record<DashboardCard, ReactNode> {
 return {
  net_worth: netWorth,
  // Where the money is going and what to improve, then how fast: both read the month's spending once (`useSpendingPace`).
  where: planningReady && <WhereCard spending={spending} glance={glance} categories={planning.categories} currency={currency}/>,
  spending: planningReady && <SpendingPaceCard pace={spending.pace} data={spending.data} rates={spending.rates} currency={currency} loading={spending.loading} error={spending.error} onRetry={spending.retry} href={transactionsHref({ direction: 'expense', period: 'this_month' })}/>,
  budget: planningReady && <BudgetCard figures={monthBudget} currency={currency}/>,
  commitments: cards.commitments,
  allocation: cards.allocation,
  goals: planningReady && <GoalsCard goals={planning.goals} order={savedGoalOrder(preferences)} data={planning} currency={currency} netWorth={code => goalFinancials(planning.records, depositToday().slice(0, 7), code, market).netWorth}/>,
  // A recent transaction opens its details, as a transaction row does everywhere.
  transactions: planningReady && <RecentTransactionsCard owner={user} demo={demo} revision={reload} data={planning} onOpen={open}/>,
  upcoming: cards.upcoming,
  income,
 };
}
export function OverviewScreen() {
 const { t } = useLanguage();
 const { user, demo, rows, netWorth, addCashFlow, current, currency, market, budget, earningSources, forecastBudget, forecastBudgetState, reload, preferencesData, excludedCurrencies, forecast, forecastReady, planning, transactionTools, workspacePreferences, workspaceLoading, setViewing, setTracking, storedRecord, refreshRecords, businessList, openPayment } = useWorkspace();
 const planningReady = demo || (!planning.loading && !planning.error);
 const cards = useOverviewCards({ entries: current, currency, excludedCurrencies, forecast, forecastReady, planning: planningReady ? planning.data : null, planningError: planning.error, onPlanningRetry: refreshRecords, onPay: (recordId, date) => { openPayment({ recordId, date }); } });
 const { layout, change } = useDashboardLayout(workspacePreferences, demo);
 const monthBudget = useMonthBudget({ owner: user, demo, revision: reload, budget, data: planning.data, currency, market, splits: transactionTools.data.splits });
 // The net worth history is read now, beside the workspace reads, not once they have finished.
 const portfolioHistory = usePortfolioHistory(user, demo, reload);
 // The even-pace line runs toward this month's budget, once one is saved and known.
 const spending = useSpendingPace({ owner: user, demo, revision: reload, data: planning.data, splits: transactionTools.data.splits, currency, market, plan: settledPlan(monthBudget) });
 const payouts = useExpectedPayouts(user, demo, reload, rows);
 // The key figures and what the cards say about them, worked out once for every spot they stand in.
 const figures = useHeadlineFigures({ data: planningReady ? planning.data : null, forecastBudget, payouts, forecastLoading: forecastBudgetState?.loading, forecastError: !!forecastBudgetState?.error, surplus: forecast.forecast, surplusReady: forecastReady, budget: monthBudget, spending, sources: earningSources.sources, currency, market });
 const glance = dashboardGlance({ spending, budget: monthBudget, figures });
 // A line of the net worth card's details opens what it came from: a transaction its details, as a row in Transactions
 // does, and a holding its history (the Tracker, which the sample workspace does not offer, as on Loans & debts).
 const opener = periodOpener({ lists: [planning.data.records, rows], history: portfolioHistory.history, demo, view: found => setViewing(storedRecord(found)), track: found => setTracking(storedRecord(found)) });
 const [customizing, setCustomizing] = useState(false);
 // Rearrange mode: handles show and the cards wiggle until Done.
 const [arranging, setArranging] = useState(false);
 const card = (nodes: { netWorth: ReactNode; income: ReactNode }) => dashboardCards(nodes, { planningReady, spending, glance, monthBudget, cards, planning: planning.data, preferences: workspacePreferences.data.preferences, currency, market, user, demo, reload, open: record => setViewing(storedRecord(record)) });
 const showNetWorth = !layout.hidden.includes('net_worth');
 const headline = <DashboardHeadline netWorth={netWorth} netWorthTile={!showNetWorth} budget={monthBudget} spending={planningReady ? spending : undefined} figures={figures} currency={currency}/>;
 return <>
  <div data-page="Overview" className="content overview-content">
   <OverviewHeading name={preferencesData.display_name?.trim()} firstVisit={!demo && firstVisit(preferencesData, depositToday())}>{arranging ? <Button onClick={() => setArranging(false)}><Check size={16} aria-hidden="true"/>{t('Done')}</Button> : <Button variant="outline" onClick={() => setCustomizing(true)}><LayoutGrid size={16} aria-hidden="true"/>{t('Customize')}</Button>}</OverviewHeading>
   <ScreenNotices/>
   {!workspaceLoading&&<TelegramNudge demo={demo}/>}
   {workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} columns={dashboardColumns(layout)}/> : <PortfolioOverview categories={planning.data.categories} holdings={planning.data.records} businesses={businessList.length > 0} opener={opener} excludedCurrencies={excludedCurrencies} key={demo ? 'demo' : user} entries={current} demoRecords={demo ? rows : undefined} currency={currency} market={market} demo={demo} savedHistory={portfolioHistory.history} historyError={portfolioHistory.error} onHistoryRetry={portfolioHistory.retry} onAddIncome={() => addCashFlow('Other income')} board={nodes => <>
    {/* The key figures sit at the top of the column beside Net worth over time; with one column, or no net worth
        card, they open the page instead. */}
    <div className="dashboard-headline" data-beside={showNetWorth || undefined}>{headline}</div>
    <DashboardBoard layout={layout} cards={card(nodes)} lead={headlineLead(layout, showNetWorth, headline)} arranging={arranging} onChange={change}/>
   </>}/>}
  </div>
  {customizing&&<CustomizeDashboardDialog layout={layout} onChange={change} onRearrange={() => { setCustomizing(false); setArranging(true); }} onClose={() => setCustomizing(false)}/>}
  {anyFailed(workspacePreferences.error, planning.error, transactionTools.error, budget.error)&&<ToolsUnavailable/>}
 </>;
}
