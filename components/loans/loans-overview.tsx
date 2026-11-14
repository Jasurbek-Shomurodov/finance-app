"use client";
import { useMemo } from 'react';
import { DebtSummary } from '@/components/debt-summary';
import { LoansList } from '@/components/loans/loans-list';
import { OwedBreakdown, PayoffPlanCard } from '@/components/loans/loans-side';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { usePortfolioHistory } from '@/hooks/use-portfolio-history';
import { payoffDay, payoffPlan, planFor } from '@/lib/debt-plan';
import { demoHistory } from '@/lib/demo-finance';
import { depositToday } from '@/lib/deposit-interest';
import { liabilities } from '@/lib/finance';

/** Loans & debts, the overview: the key figures, every record with how far it is paid off, and beside them what is
 * owed by debt and the payoff plan. `onOpenPlanner` switches to the Debt payoff planner tab. */
export function LoansOverview({ onOpenPlanner }: { onOpenPlanner: () => void }) {
 const { user, demo, rows, current, currency, planning, workspacePreferences, reload } = useWorkspace();
 const today = depositToday();
 // The paid-off bars read the Tracker history the Overview charts use; the sample workspace builds its own.
 const saved = usePortfolioHistory(user, demo, reload);
 const sample = useMemo(() => demo ? demoHistory(rows, today) : null, [demo, rows, today]);
 const events = (demo ? sample : saved.history)?.events ?? [];
 const savedPlan = workspacePreferences.data.preferences.find(preference => preference.key === 'debt_plan')?.data;
 const plan = useMemo(() => planFor(savedPlan, currency), [savedPlan, currency]);
 const worked = useMemo(() => payoffPlan(planning.data.records, plan), [planning.data.records, plan]);
 const ready = !planning.loading && !planning.error && !workspacePreferences.loading && !!worked.result && worked.debts.length > 0;
 const debts = planning.data.records.filter(record => liabilities.includes(record.kind) && record.amount > 0);
 return <>
  <DebtSummary entries={current} currency={currency} debtFree={{ ready, day: payoffDay(today, worked.result?.months), minimumsDay: payoffDay(today, worked.minimums?.months), onOpen: onOpenPlanner }}/>
  <div className="loans-layout">
   <LoansList events={events}/>
   {debts.length > 0 && <div className="loans-side">
    <OwedBreakdown debts={debts}/>
    {ready && <PayoffPlanCard plan={plan} worked={worked} today={today} onOpen={onOpenPlanner}/>}
   </div>}
  </div>
 </>;
}
