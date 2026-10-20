"use client";
import { AddAssetDialog } from '@/components/planning/add-asset-dialog';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AssetDashboard } from '@/components/asset-dashboard';
import { useLanguage } from '@/components/language-provider';
import { PanelSkeleton, WorkspaceSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { PortfolioAllocationPlan } from '@/components/portfolio-allocation-plan';
import { Button } from '@/components/ui/button';
import { ScreenNotices } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { usePropertyTotals } from '@/hooks/use-property-totals';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
import type { HoldingAccount } from '@/lib/holding-accounts';

export function AssetsScreen() {
 const { t } = useLanguage();
 // Two views switched from the top bar: what you hold, and the target mix with its suggested contributions.
 const [view, setView] = useState<'holdings' | 'allocation'>('holdings');
 // Add asset asks for the kind first, as Add account does.
 const [choosing, setChoosing] = useState(false);
 const { user, demo, rows, currency, market, preferencesData, excludedCurrencies, planning, workspacePreferences, netWorth, totalDebt, forecast, forecastReady, tableLoading, workspaceLoading, addAsset, addAccountRecord, editRecord, setTracking, investIn, requestDelete, quoteLabel, refreshRecords, reload, setSankey } = useWorkspace();
 // A holding opens its Sankey for this month (what it was bought with, then where it stands); its Details edit it. A
 // holding account opens its holdings together.
 const month = depositToday().slice(0, 7);
 const openHolding = (record: Entry) => setSankey({ target: { side: 'account', key: record.id }, title: record.name, month, onDetails: () => editRecord(record) });
 const openAccount = (account: HoldingAccount, holdings: string[]) => setSankey({ target: { side: 'holdings', keys: holdings }, title: account.name, month });
 const properties = usePropertyTotals({ owner: user, demo, revision: reload, records: rows, sample: planning.data.records, currency, market });
 return <>
  <div data-page="Assets & investments" className="content assets-content">
   <PageHeader title={t('Investments')} tabs={<Segmented className="page-tabs" as="nav" label={t('Investments')} options={[{ value: 'holdings', label: t('Holdings') }, { value: 'allocation', label: t('Target allocation') }] as const} value={view} onChange={setView}/>}><Button onClick={() => setChoosing(true)}><Plus size={17} aria-hidden="true"/>{t("Add asset")}</Button></PageHeader>
   <ScreenNotices/>
   <AddAssetDialog open={choosing} onOpenChange={setChoosing} onChoose={addAsset}/>
   {view === 'holdings' && (workspaceLoading ? <WorkspaceSkeleton label={t("Loading your workspace…")} section="Assets & investments"/> : <AssetDashboard excludedCurrencies={excludedCurrencies} accounts={planning.data.holdingAccounts??[]} accountsLoading={planning.loading} accountsError={planning.error} onRetryAccounts={refreshRecords} onAddHolding={addAccountRecord} records={rows} currency={currency} market={market} netWorth={netWorth} debt={totalDebt} forecast={forecast} forecastReady={forecastReady} loading={tableLoading} demo={demo} onAdd={() => setChoosing(true)} onEdit={editRecord} onTrack={setTracking} onInvest={investIn} onDelete={requestDelete} quoteLabel={quoteLabel} onOpen={openHolding} onOpenAccount={openAccount} propertyTotals={properties}/>)}
  </div>
  {view === 'allocation' && planning.loading&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')}/></div>}
  {view === 'allocation' && !planning.loading&&!planning.error&&<div className="content review-content" key={user??'demo'}><PortfolioAllocationPlan currencies={preferencesData.currencies} records={planning.data.records} currency={currency} market={market} preferences={workspacePreferences}/></div>}
 </>;
}
