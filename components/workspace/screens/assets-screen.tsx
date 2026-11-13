"use client";
import { AddAssetDialog } from '@/components/planning/add-asset-dialog';
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { AssetDashboard } from '@/components/asset-dashboard';
import { useLanguage } from '@/components/language-provider';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { InvestmentsSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { PortfolioAllocationPlan } from '@/components/portfolio-allocation-plan';
import { Button } from '@/components/ui/button';
import { PlanningError, ScreenNotices } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { usePortfolioHistory } from '@/hooks/use-portfolio-history';
import { usePropertyTotals } from '@/hooks/use-property-totals';
import { PerformanceView } from '@/components/performance/performance-view';
import { demoHistory } from '@/lib/demo-finance';
import { depositToday } from '@/lib/deposit-interest';

export function AssetsScreen() {
 const { t } = useLanguage();
 // Three views switched from the top bar: what you hold, what it earned, and the target mix with its suggested contributions.
 const [view, setView] = useState<'holdings' | 'pnl' | 'allocation'>('holdings');
 // Add asset asks for the kind first, as Add account does.
 const [choosing, setChoosing] = useState(false);
 const { user, demo, rows, currency, market, preferencesData, excludedCurrencies, planning, workspacePreferences, netWorth, totalDebt, forecast, forecastReady, tableLoading, workspaceLoading, addAsset, addAccountRecord, editRecord, setTracking, investIn, requestDelete, quoteLabel, refreshRecords, reload } = useWorkspace();
 const properties = usePropertyTotals({ owner: user, demo, revision: reload, records: rows, sample: planning.data.records, currency, market });
 // Profit & loss reads the Tracker history the Overview charts use, and only once its tab is opened.
 const today = depositToday();
 const saved = usePortfolioHistory(view === 'pnl' ? user : null, demo, reload);
 const sample = useMemo(() => demo && view === 'pnl' ? demoHistory(rows, today) : null, [demo, view, rows, today]);
 return <>
  <div data-page="Assets & investments" className="content assets-content">
   <PageHeader title={t('Investments')} tabs={<Segmented className="page-tabs" as="nav" label={t('Investments')} options={[{ value: 'holdings', label: t('Holdings') }, { value: 'pnl', label: t('Profit & loss') }, { value: 'allocation', label: t('Target allocation') }] as const} value={view} onChange={setView}/>}><Button onClick={() => setChoosing(true)}><Plus size={17} aria-hidden="true"/>{t("Add asset")}</Button></PageHeader>
   <ScreenNotices/>
   <AddAssetDialog open={choosing} onOpenChange={setChoosing} onChoose={addAsset}/>
   {view === 'holdings' && (workspaceLoading ? <InvestmentsSkeleton label={t("Loading your workspace…")}/> : <AssetDashboard excludedCurrencies={excludedCurrencies} accounts={planning.data.holdingAccounts??[]} accountsLoading={planning.loading} accountsError={planning.error} onRetryAccounts={refreshRecords} onAddHolding={addAccountRecord} records={rows} currency={currency} market={market} netWorth={netWorth} debt={totalDebt} forecast={forecast} forecastReady={forecastReady} loading={tableLoading} demo={demo} onAdd={() => setChoosing(true)} onEdit={editRecord} onTrack={setTracking} onInvest={investIn} onDelete={requestDelete} quoteLabel={quoteLabel} propertyTotals={properties}/>)}
  </div>
  {view === 'pnl' && <div className="content review-content" key={'pnl:' + (user ?? 'demo')}>{workspaceLoading ? <PanelSkeleton label={t('Loading your workspace…')}/> : <PerformanceView history={demo ? sample : saved.history} error={!demo && saved.error} onRetry={saved.retry} currency={currency} market={market} accounts={planning.data.holdingAccounts ?? []} preferences={workspacePreferences} demo={demo}/>}</div>}
  {view === 'allocation' && planning.loading&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')}/></div>}
  {view === 'allocation' && planning.error&&<div className="content review-content"><PlanningError/></div>}
  {view === 'allocation' && !planning.loading&&!planning.error&&<div className="content review-content" key={user??'demo'}><PortfolioAllocationPlan currencies={preferencesData.currencies} records={planning.data.records} currency={currency} market={market} preferences={workspacePreferences}/></div>}
 </>;
}
