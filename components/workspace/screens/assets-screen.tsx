"use client";
import { ClosedFold } from '@/components/closing/closed-fold';
import { openOnly } from '@/lib/closed-records';
import { AddAssetDialog } from '@/components/planning/add-asset-dialog';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AssetDashboard } from '@/components/asset-dashboard';
import { useLanguage } from '@/components/language-provider';
import { AllocationSkeleton, InvestmentsSkeleton, PayoutsAlertsSkeleton, PerformanceSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { PortfolioAllocationPlan } from '@/components/portfolio-allocation-plan';
import { Button } from '@/components/ui/button';
import { PlanningError, ScreenNotices } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useInvestmentPnl } from '@/hooks/use-investment-pnl';
import { usePropertyTotals } from '@/hooks/use-property-totals';
import { PerformanceView } from '@/components/performance/performance-view';
import { PayoutsAlertsView } from '@/components/performance/payouts-alerts-view';
import { useLocationSearch } from '@/hooks/use-location-search';
import { assetRecordKinds } from '@/lib/finance';
import { assetKindOf } from '@/lib/overview';

/** What was closed among the holdings and investment accounts, folded under the cards with the way back. */
function ClosedHoldings() {
 const { planning, reopenRecord, reopenAccount, requestDelete } = useWorkspace();
 const closed = (planning.data.closed ?? []).filter(record => assetRecordKinds.includes(record.kind));
 return <ClosedFold records={closed} accounts={planning.data.closedAccounts} onReopen={reopenRecord} onReopenAccount={reopenAccount} onDelete={requestDelete}/>;
}

export function AssetsScreen() {
 const { t } = useLanguage();
 // Four views switched from the top bar: what you hold, what it earned, what it is expected to pay with the price
 // alerts, and the target mix with its suggested contributions.
 const [view, setView] = useState<'holdings' | 'pnl' | 'payouts' | 'allocation'>('holdings');
 // Add asset asks for the kind first, as Add account does.
 const [choosing, setChoosing] = useState(false);
 const { user, demo, rows, currency, market, preferencesData, excludedCurrencies, planning, workspacePreferences, netWorth, totalDebt, forecast, forecastReady, tableLoading, workspaceLoading, addAsset, addAccountRecord, editRecord, setTracking, investIn, requestDelete, quoteLabel, refreshRecords, reload, businessList, setSettingUpBusinesses, readOnly, requestClose } = useWorkspace();
 // Closed holdings leave the cards and wait in the fold under them.
 const open = openOnly(rows);
 const properties = usePropertyTotals({ owner: user, demo, revision: reload, records: rows, sample: planning.data.records, currency, market });
 // Profit & loss reads the Tracker history the Overview charts use (one shared request): the Holdings tab shows each
 // holding's result from it, and the Profit & loss tab breaks it down.
 // The Dashboard's allocation rows link to one kind (`allocationHref`): Holdings opens filtered to it.
 const openKind = assetKindOf(useLocationSearch(), assetRecordKinds);
 const earned = useInvestmentPnl({ owner: user, demo, revision: reload, records: rows, currency, market });
 return <>
  <div data-page="Assets & investments" className="content assets-content">
   <PageHeader title={t('Investments')} tabs={<Segmented className="page-tabs" as="nav" label={t('Investments')} options={[{ value: 'holdings', label: t('Holdings') }, { value: 'pnl', label: t('Profit & loss') }, { value: 'payouts', label: t('Payouts & alerts') }, { value: 'allocation', label: t('Target allocation') }] as const} value={view} onChange={setView}/>}><Button onClick={() => setChoosing(true)}><Plus size={17} aria-hidden="true"/>{t("Add asset")}</Button></PageHeader>
   <ScreenNotices/>
   <AddAssetDialog open={choosing} onOpenChange={setChoosing} onChoose={addAsset} tracksBusinesses={businessList.length > 0} onBusinessSetup={readOnly ? undefined : () => setSettingUpBusinesses(true)}/>
   {view === 'holdings' && (workspaceLoading ? <InvestmentsSkeleton label={t("Loading your workspace…")}/> : <><AssetDashboard excludedCurrencies={excludedCurrencies} accounts={planning.data.holdingAccounts??[]} accountsLoading={planning.loading} accountsError={planning.error} onRetryAccounts={refreshRecords} onAddHolding={addAccountRecord} records={open} currency={currency} market={market} netWorth={netWorth} debt={totalDebt} forecast={forecast} forecastReady={forecastReady} loading={tableLoading} demo={demo} onAdd={() => setChoosing(true)} onEdit={editRecord} onTrack={setTracking} onInvest={investIn} onDelete={requestDelete} onClose={requestClose} quoteLabel={quoteLabel} propertyTotals={properties} pnl={earned.pnl} pnlError={earned.error} onShowPnl={() => setView('pnl')} openKind={openKind}/><ClosedHoldings/></>)}
  </div>
  {view === 'pnl' && <div className="content review-content" key={'pnl:' + (user ?? 'demo')}>{workspaceLoading ? <PerformanceSkeleton label={t('Loading your workspace…')}/> : <PerformanceView history={earned.history} rate={earned.rate} error={earned.error} onRetry={earned.retry} currency={currency} market={market} accounts={planning.data.holdingAccounts ?? []}/>}</div>}
  {view === 'payouts' && <div className="content review-content" key={'payouts:' + (user ?? 'demo')}>{workspaceLoading ? <PayoutsAlertsSkeleton label={t('Loading your workspace…')}/> : <PayoutsAlertsView history={earned.history} error={earned.error} onRetry={earned.retry} currency={currency} market={market} preferences={workspacePreferences} demo={demo}/>}</div>}
  {view === 'allocation' && planning.loading&&<div className="content review-content"><AllocationSkeleton label={t('Loading records…')}/></div>}
  {view === 'allocation' && planning.error&&<div className="content review-content"><PlanningError/></div>}
  {view === 'allocation' && !planning.loading&&!planning.error&&<div className="content review-content" key={user??'demo'}><PortfolioAllocationPlan currencies={preferencesData.currencies} records={planning.data.records} currency={currency} market={market} preferences={workspacePreferences}/></div>}
 </>;
}
