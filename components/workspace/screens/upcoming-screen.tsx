"use client";
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { LoadingPlaceholder, PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { SubscriptionsPanel } from '@/components/planning/subscriptions-panel';
import { UpcomingPage, type RecurringView } from '@/components/planning/upcoming-page';
import { ReminderPanel } from '@/components/reminder-panel';
import { PlanningError, ToolsUnavailable } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import type { RecurringKind } from '@/components/planning/add-recurring-menu';
import { marketRates } from '@/lib/market';

export function UpcomingScreen() {
 const { t } = useLanguage();
 const { user, demo, reload, planning, workspacePreferences, currency, preferencesData, market, reviewRecurring, editRecord, addCashFlow, addRecurringIncome, readOnly, archiveSchedule, deleteSchedule, setSankey, setDrilling } = useWorkspace();
 const [view, setView] = useState<RecurringView>('list');
 // Add recurring sets up schedules only; payments are recorded on their rows.
 const addRecurring = (kind: RecurringKind) => kind === 'income' ? addRecurringIncome() : addCashFlow('Other expense', 'Monthly');
 const subscriptions = useSubscriptions(user, demo, reload, planning.data.records);
 return <>
  <div data-page="Upcoming payments" className="content">
   <PlanningError/>
   {planning.loading ? <LoadingPlaceholder label={t('Loading records…')}/> : <UpcomingPage data={planning.data} save={planning.save} currency={currency} currencies={preferencesData.currencies} rates={marketRates(market)} view={view} onView={setView} onEdit={editRecord} onAddRecurring={readOnly ? undefined : addRecurring} onArchive={archiveSchedule} onDelete={deleteSchedule} onSankey={setSankey}/>}
   {view === 'subscriptions' && !planning.loading && <SubscriptionsPanel records={subscriptions.records} decisions={subscriptions.decisions} loading={subscriptions.loading} error={subscriptions.error} onRetry={subscriptions.retry} decide={subscriptions.decide} restore={subscriptions.restore} onTrack={reviewRecurring} onOpen={record => setDrilling(record)}/>}
  </div>
  {(workspacePreferences.error||planning.error)&&<ToolsUnavailable/>}
  {view === 'reminders' && (planning.loading||workspacePreferences.loading)&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')} rows={2}/></div>}
  {view === 'reminders' && !planning.loading&&!planning.error&&!workspacePreferences.loading&&!workspacePreferences.error&&<div className="content review-content" key={'reminders:'+user}><ReminderPanel data={planning.data} preferences={workspacePreferences}/></div>}
 </>;
}
