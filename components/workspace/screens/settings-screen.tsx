"use client";
import { useMemo } from 'react';
import { LogOut, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BusinessSettings, TagSettings } from '@/components/business-settings';
import { useLanguage } from '@/components/language-provider';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { rulesLink } from '@/lib/add-links';
import { depositToday } from '@/lib/deposit-interest';
import { marketRates } from '@/lib/market';
import { AccountAccessPanel } from '@/components/account-access-panel';
import { DataTools } from '@/components/data-tools';
import { sampleBackup } from '@/lib/report-figures';
import { DatabaseHealth } from '@/components/database-health';
import { HouseholdPanel } from '@/components/household-panel';
import { ImportHistory } from '@/components/import-history';
import { InvestmentComparisonSettings } from '@/components/investment-comparison-settings';
import { SettingsLayout } from '@/components/settings-layout';
import { SettingsPanel } from '@/components/settings-panel';
import { TelegramPanel } from '@/components/telegram-panel';
import { TransactionToolsPanel } from '@/components/transaction-tools-panel';
import { PlanningError } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function SettingsScreen() {
 const { household, user, demo, logout, currency, market, reload, preferencesData, applyPreferences, settingsLoading, settingsError, retrySettings, planning, workspacePreferences, refreshRecords, clearLocalSession, restartOnboarding,
  businessList, tags, transactionTools, editRecord, requestDelete, setSettingUpBusinesses, categoryIcons, removedCategories, budget } = useWorkspace();
 const { t } = useLanguage();
 const rates = marketRates(market);
 // What each category plans this month: its budget and the schedules still running under it.
 const plans = useMemo(() => ({ amounts: budget.loading || budget.error ? [] : budget.state.amounts, records: planning.data.records, month: depositToday().slice(0, 7), currency, rates }), [budget.loading, budget.error, budget.state.amounts, planning.data.records, currency, rates]);
 return <div data-page="Settings" className="content">
  {/* Signing out (or leaving the sample workspace) lives here, beside the account's other settings. */}
  <SettingsLayout
   actions={<Button variant="outline" onClick={logout}><LogOut size={16} aria-hidden="true"/>{demo ? t('Exit demo') : t('Sign out')}</Button>}
   preferences={<><SettingsPanel key={String(user) + settingsLoading} ratesDate={market?.ratesDate} rates={rates} initial={preferencesData} demo={demo} onSaved={applyPreferences} loading={!demo && settingsLoading} loadError={settingsError} onRetry={retrySettings} onRestartSetup={demo?undefined:restartOnboarding}/><PlanningError/></>}
   telegram={<TelegramPanel demo={demo}/>}
   household={<HouseholdPanel household={household} demo={demo}/>}
   benchmarks={<InvestmentComparisonSettings demo={demo} currencies={preferencesData.currencies}/>}
   security={<AccountAccessPanel onSignedOut={clearLocalSession}/>}
   categories={<TransactionToolsPanel plans={plans} preferences={workspacePreferences} owner={demo?null:user} demo={demo} onDeleted={refreshRecords} categories={planning.data.categories} loading={planning.loading} error={planning.error} onRetry={refreshRecords} icons={categoryIcons} removed={removedCategories} saveCategory={async (name,direction,existing)=>{const id=existing??crypto.randomUUID();await planning.save('category',{id,name,direction});return id;}}/>}
   businesses={<BusinessSettings businesses={businessList} records={planning.data.records} preferences={workspacePreferences} owner={demo?null:user} demo={demo} onEdit={editRecord} onDelete={requestDelete} onSetup={() => setSettingUpBusinesses(true)} onGuide={() => setSettingUpBusinesses('guide')}/>}
   tags={<TagSettings tags={tags} preferences={workspacePreferences} owner={demo?null:user} demo={demo}/>}
   /* Rules have one home, Transactions, where their effect shows; this section is the way there. */
   rules={<section className="panel tools-panel"><PanelTitle title={t('Rules')} description={t('Sort new transactions automatically by words in their name.')} hint={t('A rule sets the category, business or tags of transactions whose name contains its words. New bank statement imports follow your rules too.')}><Button variant="outline" asChild><DrawerLink href={rulesLink}><Wand2 size={16} aria-hidden="true"/>{t('Open in Transactions')}</DrawerLink></Button></PanelTitle></section>}
   data-tools={<><DataTools owner={user} currency={currency} market={market} preferences={workspacePreferences} records={planning.data.records} onSaved={refreshRecords} demo={demo} sample={demo?()=>sampleBackup(planning.data,transactionTools.data.splits,categoryIcons):undefined}/><ImportHistory owner={user} demo={demo} revision={reload} onSaved={refreshRecords}/><DatabaseHealth demo={demo}/></>}
  />
 </div>;
}
