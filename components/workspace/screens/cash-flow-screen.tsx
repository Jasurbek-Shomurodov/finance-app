"use client";
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CashflowPreview, type IncomeCardRow } from '@/components/cashflow-preview';
import { CashFlowReport, type FlowView } from '@/components/cash-flow-report';
import { CashForecastView } from '@/components/cash-forecast';
import { CashFlowMonthBar } from '@/components/cash-flow/month-bar';
import { StillToCome } from '@/components/cash-flow/still-to-come';
import { useMonthOutlook } from '@/components/cash-flow/use-month-outlook';
import { EstimatedIncomeSources } from '@/components/estimated-income-sources';
import { BudgetCard } from '@/components/dashboard-cards';
import { CashflowSummarySkeleton, MonthlyReview } from '@/components/financial-review';
import { IncomeSourcesPanel } from '@/components/income-sources-panel';
import { useLanguage } from '@/components/language-provider';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { CashFlowSkeleton, CashFlowTabSkeleton, IncomeEstimatesSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { MonthlyMortgagePayments } from '@/components/monthly-mortgage-payments';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Button } from '@/components/ui/button';
import { ScreenNotices, ToolsUnavailable } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useHashRequest } from '@/hooks/use-hash-request';
import { flowHash, watchlistsLink } from '@/lib/add-links';
import { marketRates } from '@/lib/market';
import { useExpectedPayouts } from '@/hooks/use-expected-payouts';

const tabs = ['Overview', 'Income', 'Spending', 'Forecast'] as const;

export function CashFlowScreen() {
 const { t } = useLanguage();
 const [tab, setTab] = useState<(typeof tabs)[number]>('Overview');
 // Where the month went, as ranked bars or the money flow diagram.
 const [flowView, setFlowView] = useState<FlowView>('bars');
 // Overview's Add income source opens the Income tab with the editor already on a new source.
 const [addingSource, setAddingSource] = useState(false);
 // The dashboard's forecast card links to #forecast; Budget's and Recurring's Money flow link to #flow, the diagram's one home.
 useHashRequest('#forecast', () => setTab('Forecast'));
 useHashRequest(flowHash, () => { setTab('Overview'); setFlowView('sankey'); });
 const { user, demo, rows, currency, market, reload, preferencesData, planning, earningSources, transactionTools, workspacePreferences, snapshots, forecast, forecastReady, forecastMonth, setForecastMonth, workspaceLoading, refreshRecords,
  addCashFlow, editRecord, setPayingMortgage, recordFromSource, budget, forecastBudget, forecastBudgetState, setViewing, storedRecord } = useWorkspace();
 // Each income source in its own currency, as entered; only the month's headline is converted (AGENTS.md, entered or converted).
 // The spending estimate follows the one definition of spending (lib/spending.ts): bills plus mortgage interest; mortgage
 // principal and loan repayments are transfers, so they leave the net estimate but never the spending one.
 const incomeSources = earningSources.sources;
 const payouts = useExpectedPayouts(user, demo, reload, rows);
 const estimates = forecastReady ? { income: forecast.plannedIncome, spending: forecast.monthlyExpenses + forecast.mortgageInterest, net: forecast.forecast } : null;
 // What the running month is still expected to bring: the tiles, the month's bars and the closing card all read this.
 const outlook = useMonthOutlook({ data: planning.data, sources: incomeSources, splits: transactionTools.data.splits, month: forecastMonth, currency, market, spendingEstimate: estimates?.spending ?? null });
 const settled = !planning.loading && !planning.error && !transactionTools.loading && !transactionTools.error && !earningSources.loading && !earningSources.error;
 const expected = settled && outlook && outlook.income !== null && outlook.bills !== null && outlook.other !== null ? { income: outlook.income, spending: outlook.bills + outlook.other } : null;
 const showIncome = () => { setTab('Income'); setAddingSource(false); };
 // A row of Income this month opens what it is: a payment its details, a schedule or an earning asset its form, and a
 // source estimated by the month the Income tab, where sources are edited.
 const openIncome = ({ entry }: IncomeCardRow) => entry.id.startsWith('source:') ? showIncome() : entry.frequency === 'Once' ? setViewing(storedRecord(entry)) : editRecord(entry);
 const mortgages = <MonthlyMortgagePayments records={demo?rows:planning.data.records} loading={planning.loading} error={planning.error} onPay={setPayingMortgage} onEdit={editRecord}/>;
 // This month's budget on the Spending tab, as on Budget: spending categories against their limits.
 const budgetCard = !transactionTools.loading && !transactionTools.error ? <BudgetCard owner={user} demo={demo} revision={reload} budget={budget} data={planning.data} currency={currency} market={market} splits={transactionTools.data.splits}/> : null;
 // Watchlists measure the budget, so they live on Budget; Spending keeps the way there.
 const watchlists = <section className="panel tools-panel"><PanelTitle title={t('Spending watchlists')}><DrawerLink href={watchlistsLink}>{t('Open in Budget')}</DrawerLink></PanelTitle></section>;
 return <>
  <div data-page="Income & expenses" className="content">
   <PageHeader title={t('Cash flow')} tabs={<Segmented as="nav" className="page-tabs" label={t('Cash flow')} options={tabs.map(name=>({value:name,label:t(name)}))} value={tab} onChange={name=>{setTab(name);setAddingSource(false);}}/>}>
    <Button variant="outline" className="cashflow-action" onClick={() => addCashFlow('Other income')}><Plus size={17} aria-hidden="true"/>{t("Add income")}</Button>
    {/* Expenses and transfers are added from the top bar's Add, the same forms on every page. */}
   </PageHeader>
   <ScreenNotices/>
   {tab!=='Forecast'&&<CashFlowMonthBar month={forecastMonth} onChange={setForecastMonth} outlook={settled?outlook:null} currency={currency}/>}
   {workspaceLoading ? (tab==='Overview' ? <CashFlowSkeleton label={t("Loading your workspace…")}/> : <CashFlowTabSkeleton label={t("Loading your workspace…")} tab={tab}/>) : <>
    {tab!=='Forecast'&&(planning.loading?<CashflowSummarySkeleton/>:!planning.error&&<MonthlyReview compact selectedMonth={forecastMonth} estimates={estimates} running={!!outlook} owner={user} demo={demo} revision={reload} market={market} data={planning.data} tools={transactionTools} snapshots={snapshots.snapshots} historyError={snapshots.error} currency={currency}/>)}
    {transactionTools.error&&<InlineError message={t(transactionTools.error)} onRetry={transactionTools.retry}/>}
    {tab==='Overview'&&<CashFlowReport onOpenRecord={record => setViewing(storedRecord(record))} owner={user} demo={demo} revision={reload} data={planning.data} splits={transactionTools.data.splits} month={forecastMonth} currency={currency} market={market} monthReviewAbove={!planning.error} expected={expected} view={flowView} onView={setFlowView}/>}
    {tab==='Overview'&&<CashflowPreview entries={planning.data.records} sources={incomeSources} month={forecastMonth} currency={currency} rates={marketRates(market)} loading={planning.loading||earningSources.loading} error={planning.error||earningSources.error} onRetry={refreshRecords} onIncome={showIncome} onOpen={openIncome} onAddSource={()=>{setTab('Income');setAddingSource(true);}} closing={settled&&outlook?<StillToCome outlook={outlook} month={forecastMonth} currency={currency} onIncome={showIncome}/>:null}/>}
    {tab==='Income'&&<IncomeSourcesPanel adding={addingSource} controller={earningSources} currencies={preferencesData.currencies} records={planning.data.records} onRecord={recordFromSource}/>}
    {tab==='Income'&&(planning.loading || earningSources.loading ? <IncomeEstimatesSkeleton label={t('Loading records…')}/> : planning.error || earningSources.error ? <InlineError as="div" message={t(planning.error || earningSources.error)} onRetry={refreshRecords}/> : <EstimatedIncomeSources earningSources={incomeSources} entries={planning.data.records} month={forecastMonth} rates={marketRates(market)}/>)}
    {tab==='Spending'&&mortgages}
    {tab==='Spending'&&budgetCard}
    {tab==='Spending'&&watchlists}
    {tab==='Forecast'&&<CashForecastView owner={user} data={planning.data} budget={forecastBudget} payouts={payouts} currency={currency} rates={marketRates(market)} loading={planning.loading||forecastBudgetState.loading} error={planning.error||forecastBudgetState.error} onRetry={()=>{refreshRecords();forecastBudgetState.retry();}}/>}
   </>}
  </div>
  {(workspacePreferences.error||planning.error)&&<ToolsUnavailable/>}
 </>;
}
