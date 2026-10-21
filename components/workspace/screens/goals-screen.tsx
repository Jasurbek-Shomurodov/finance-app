"use client";
import { useLanguage } from '@/components/language-provider';
import { GoalsSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { GoalsPage } from '@/components/planning/goals-page';
import { PlanningError } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function GoalsScreen() {
 const { t } = useLanguage();
 const { user, demo, goalBudget, currency, market, reload, preferencesData, planning, workspacePreferences, snapshots, refreshRecords, earningSources, setSankey } = useWorkspace();
 return <div data-page="Savings goals" className="content">
  <PlanningError/>
  {planning.loading ? <GoalsSkeleton label={t('Loading records…')}/> : <GoalsPage onSankey={setSankey} budget={goalBudget} sources={earningSources.sources} currency={currency} preferences={workspacePreferences} owner={user} demo={demo} revision={reload} onSaved={refreshRecords} data={planning.data} save={planning.save} currencies={preferencesData.currencies} market={market} snapshots={snapshots.snapshots} historyError={snapshots.error}/>}
 </div>;
}
