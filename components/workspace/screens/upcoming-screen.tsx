"use client";
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { RecurringSkeleton, RemindersSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { SubscriptionsPanel } from '@/components/planning/subscriptions-panel';
import { UpcomingPage, type RecurringView } from '@/components/planning/upcoming-page';
import { ReminderPanel } from '@/components/reminder-panel';
import { TransactionInsights } from '@/components/transaction-insights';
import { depositToday } from '@/lib/deposit-interest';
import { PlanningError, ToolsUnavailable } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import type { RecurringKind } from '@/components/planning/add-recurring-menu';
import { marketRates } from '@/lib/market';

export function UpcomingScreen() {
 const { t } = useLanguage();
 const { user, demo, reload, planning, workspacePreferences, currency, preferencesData, market, reviewRecurring, editRecord, addCashFlow, addRecurringIncome, readOnly, archiveSchedule, deleteSchedule, setViewing, storedRecord, setForecastMonth } = useWorkspace();
 const [view, setView] = useState<RecurringView>('list');
 // Add recurring sets up schedules only; payments are recorded on their rows.
 const addRecurring = (kind: RecurringKind) => kind === 'income' ? addRecurringIncome() : addCashFlow('Other expense', 'Monthly');
 const subscriptions = useSubscriptions(user, demo, reload, planning.data.records, view === 'subscriptions');
 return <>
  <div data-page="Upcoming payments" className="content">
   <PlanningError/>
   {planning.loading ? <RecurringSkeleton label={t('Loading records…')} view={view}/> : <UpcomingPage data={planning.data} save={planning.save} currency={currency} currencies={preferencesData.currencies} rates={marketRates(market)} view={view} onView={setView} onEdit={editRecord} onAddRecurring={readOnly ? undefined : addRecurring} onArchive={archiveSchedule} onDelete={deleteSchedule} onFlow={setForecastMonth}
    suggestions={<TransactionInsights owner={user} demo={demo} revision={reload} records={planning.data.records} today={depositToday()} onReview={reviewRecurring}/>}/>}
   {view === 'subscriptions' && !planning.loading && <SubscriptionsPanel records={subscriptions.records} decisions={subscriptions.decisions} loading={subscriptions.loading} error={subscriptions.error} onRetry={subscriptions.retry} decide={subscriptions.decide} restore={subscriptions.restore} onTrack={reviewRecurring} onOpen={record => setViewing(storedRecord(record))}/>}
  </div>
  {(workspacePreferences.error||planning.error)&&<ToolsUnavailable/>}
  {view === 'reminders' && (planning.loading||workspacePreferences.loading)&&<div className="content review-content"><RemindersSkeleton label={t('Loading records…')}/></div>}
  {view === 'reminders' && !planning.loading&&!planning.error&&!workspacePreferences.loading&&!workspacePreferences.error&&<div className="content review-content" key={'reminders:'+user}><ReminderPanel data={planning.data} preferences={workspacePreferences}/></div>}
 </>;
}
