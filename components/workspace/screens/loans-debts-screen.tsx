"use client";
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { LoansOverview } from '@/components/loans/loans-overview';
import { useLanguage } from '@/components/language-provider';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { LoansSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { DebtPayoffPanel } from '@/components/planning/debt-payoff-panel';
import { Button } from '@/components/ui/button';
import { depositToday } from '@/lib/deposit-interest';
import { PlanningError, ScreenNotices } from '@/components/workspace/screen-notices';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function LoansDebtsScreen() {
 const { t } = useLanguage();
 // Two views switched from the top bar: what is owed and lent, and the plan for paying it off.
 const [view, setView] = useState<'overview' | 'payoff'>('overview');
 const { user, currency, planning, workspacePreferences, workspaceLoading, addRecord } = useWorkspace();
 return <>
  <div data-page="Loans & debts" className="content">
   <PageHeader title={t('Loans & debts')} tabs={<Segmented className="page-tabs" as="nav" label={t('Loans & debts')} options={[{ value: 'overview', label: t('Overview') }, { value: 'payoff', label: t('Debt payoff planner') }] as const} value={view} onChange={setView}/>}><Button onClick={addRecord}><Plus size={17} aria-hidden="true"/>{t("Add loan or debt")}</Button></PageHeader>
   <ScreenNotices/>
   {view === 'overview' && (workspaceLoading ? <LoansSkeleton label={t("Loading your workspace…")}/> : <LoansOverview onOpenPlanner={() => setView('payoff')}/>)}
  </div>
  {view === 'payoff' && planning.loading&&<div className="content review-content"><PanelSkeleton label={t('Loading records…')}/></div>}
  {view === 'payoff' && planning.error&&<div className="content review-content"><PlanningError/></div>}
  {view === 'payoff' && !planning.loading&&!planning.error&&<div className="content review-content" key={user??'demo'}><DebtPayoffPanel records={planning.data.records} currency={currency} today={depositToday()} preferences={workspacePreferences}/></div>}
 </>;
}
