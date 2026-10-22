"use client";
import { useLanguage } from '@/components/language-provider';
import { WorkspaceSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { OverviewHeading, useOverviewCards } from '@/components/overview-page';
import { useState, type ReactNode } from 'react';
import { Check, LayoutGrid } from 'lucide-react';
import { CustomizeDashboardDialog, DashboardBoard } from '@/components/dashboard-board';
import { BudgetCard, GoalsCard, RecentTransactionsCard, useMonthBudget } from '@/components/dashboard-cards';
import { DashboardHeadline } from '@/components/dashboard-headline';
import { BusinessCard } from '@/components/business-card';
import { Button } from '@/components/ui/button';
import { useDashboardLayout } from '@/hooks/use-dashboard-layout';
import { usePortfolioHistory } from '@/hooks/use-portfolio-history';
import { columnOf, dashboardColumns, type DashboardCard } from '@/lib/dashboard-layout';
import { depositToday } from '@/lib/deposit-interest';
import { savedGoalOrder } from '@/lib/goal-order';
import { firstVisit } from '@/lib/onboarding';
import { goalFinancials } from '@/lib/goal-projection';
import { PortfolioOverview } from '@/components/portfolio-overview';
import { SpendingPaceCard, useSpendingPace } from '@/components/spending-pace-card';
import { TelegramNudge } from '@/components/telegram-nudge';
import { ScreenNotices, ToolsUnavailable } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function OverviewScreen() {
 const { t } = useLanguage();
 const { user, demo, rows, netWorth, addCashFlow, current, currency, market, budget, forecastBudget, forecastBudgetState, reload, preferencesData, excludedCurrencies, snapshots, forecast, forecastReady, planning, transactionTools, workspacePreferences, workspaceLoading, businessList, setSettingUpBusinesses, setViewing, storedRecord } = useWorkspace();
 const planningReady = demo || (!planning.loading && !planning.error);
 const cards = useOverviewCards({ entries: current, currency, excludedCurrencies, forecast, forecastReady, planning: planningReady ? planning.data : null });
 const { layout, change } = useDashboardLayout(workspacePreferences, demo);
 const monthBudget = useMonthBudget({ owner: user, demo, revision: reload, budget, data: planning.data, currency, market, splits: transactionTools.data.splits });
 // The net worth history is read now, beside the workspace reads, not once they have finished.
 const portfolioHistory = usePortfolioHistory(user, demo, reload);
 const spending = useSpendingPace({ owner: user, demo, revision: reload, data: planning.data, splits: transactionTools.data.splits, snapshots: snapshots.snapshots, currency, market });
 const [customizing, setCustomizing] = useState(false);
 // Rearrange mode: handles show and the cards wiggle until Done.
 const [arranging, setArranging] = useState(false);
 const card = ({ netWorth, income }: { netWorth: ReactNode; income: ReactNode }): Record<DashboardCard, ReactNode> => ({
  net_worth: netWorth,
  spending: planningReady && <SpendingPaceCard state={spending} currency={currency}/>,
  budget: planningReady && <BudgetCard owner={user} demo={demo} revision={reload} budget={budget} data={planning.data} currency={currency} market={market} splits={transactionTools.data.splits} figures={monthBudget}/>,
  business: planningReady && <BusinessCard owner={user} demo={demo} revision={reload} data={planning.data} splits={transactionTools.data.splits} businesses={businessList} currency={currency} market={market} onSetup={() => setSettingUpBusinesses(true)}/>,
  commitments: cards.commitments,
  allocation: cards.allocation,
  goals: planningReady && <GoalsCard goals={planning.data.goals} order={savedGoalOrder(workspacePreferences.data.preferences)} data={planning.data} currency={currency} netWorth={code => goalFinancials(planning.data.records, depositToday().slice(0, 7), code, market).netWorth}/>,
  // A recent transaction opens its details, as a transaction row does everywhere.
  transactions: planningReady && <RecentTransactionsCard owner={user} demo={demo} revision={reload} data={planning.data} onOpen={record => setViewing(storedRecord(record))}/>,
  upcoming: cards.upcoming,
  income,
 });
 const showNetWorth = !layout.hidden.includes('net_worth');
 const headline = <DashboardHeadline netWorth={netWorth} netWorthTile={!showNetWorth} budget={monthBudget} spending={planningReady ? spending : undefined} data={planningReady ? planning.data : null} forecastBudget={forecastBudget} forecastLoading={forecastBudgetState?.loading} forecastError={!!forecastBudgetState?.error} currency={currency} market={market}/>;
 return <>
  <div data-page="Overview" className="content overview-content">
   <OverviewHeading name={preferencesData.display_name?.trim()} firstVisit={!demo && firstVisit(preferencesData, depositToday())}>{arranging ? <Button onClick={() => setArranging(false)}><Check size={16} aria-hidden="true"/>{t('Done')}</Button> : <Button variant="outline" onClick={() => setCustomizing(true)}><LayoutGrid size={16} aria-hidden="true"/>{t('Customize')}</Button>}</OverviewHeading>
   <ScreenNotices/>
   {!workspaceLoading&&<TelegramNudge demo={demo}/>}
   {workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} columns={dashboardColumns(layout)}/> : <PortfolioOverview excludedCurrencies={excludedCurrencies} snapshots={snapshots.snapshots} snapshotError={snapshots.error} onSnapshotRetry={snapshots.retry} key={demo ? 'demo' : user} entries={current} demoRecords={demo ? rows : undefined} currency={currency} market={market} demo={demo} savedHistory={portfolioHistory.history} historyError={portfolioHistory.error} onHistoryRetry={portfolioHistory.retry} onAddIncome={() => addCashFlow('Other income')} board={nodes => <>
    {/* The key figures sit at the top of the column beside Net worth over time; with one column, or no net worth
        card, they open the page instead. */}
    <div className="dashboard-headline" data-beside={showNetWorth || undefined}>{headline}</div>
    <DashboardBoard layout={layout} cards={card(nodes)} lead={showNetWorth ? { column: columnOf(layout, 'net_worth') === 'left' ? 'right' : 'left', node: headline } : undefined} arranging={arranging} onChange={change}/>
   </>}/>}
  </div>
  {customizing&&<CustomizeDashboardDialog layout={layout} onChange={change} onRearrange={() => { setCustomizing(false); setArranging(true); }} onClose={() => setCustomizing(false)}/>}
  {(workspacePreferences.error||planning.error||transactionTools.error)&&<ToolsUnavailable/>}
 </>;
}
