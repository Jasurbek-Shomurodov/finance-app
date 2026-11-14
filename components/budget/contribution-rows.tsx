"use client";
import { useLanguage } from '@/components/language-provider';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { SortableItem, SortableList } from '@/components/presentation-foundation/sortable';
import { formatMoney, formatPercent } from '@/lib/format';
import { goalEmoji } from '@/lib/goal-emoji';
import { goalCurrency, goalCurrentValue } from '@/lib/goal-projection';
import { investmentGoalCompletion } from '@/lib/investment-goals';
import { convertAmount } from '@/lib/market';
import type { Goal, PlanningData } from '@/lib/planning';
import { BudgetProgress, BudgetSection } from './budget-rows';

type Props = { goals: Goal[]; data: PlanningData; currency: string; rates?: number | Record<string, number>;
 /** Net worth in the display currency, for goals that track it. */ netWorth: number | null;
 /** This month's contribution in the display currency; null without a rate. */ amountOf: (goal: Goal) => number | null; total: number | null;
 /** Drops a goal on another: the order is the one Goals keeps. */ onMove: (id: string, target: string, visible: string[]) => void; moveDisabled: boolean };

/** Goals with a planned monthly saving, each with how far it has come toward its target. Contributions are edited on the
 * goal itself; the rows drag into the order Goals lists them in. */
export function ContributionSection({ goals, data, currency, rates, netWorth, amountOf, total, onMove, moveDisabled }: Props) {
 const { t, locale } = useLanguage();
 const ids = goals.map(goal => goal.id);
 const money = (amount: number | null) => amount === null ? '—' : formatMoney(amount, currency, locale);
 // A goal's progress and target read in the goal's own currency, as Goals shows them.
 const progress = (goal: Goal) => {
  const own = goalCurrency(goal, data, currency);
  if (goal.kind === 'investment') { const percent = investmentGoalCompletion(goal, data); return percent === null ? null : { percent, label: t('{percent} of target', { percent: formatPercent(percent, locale, 0) }) }; }
  const current = goalCurrentValue(goal, netWorth === null ? null : convertAmount(netWorth, currency, own, rates));
  if (current === null || !(goal.target > 0)) return null;
  const percent = Math.max(0, Math.min(100, current / goal.target * 100));
  return { percent, label: t('{percent} of {amount}', { percent: formatPercent(percent, locale, 0), amount: formatMoney(goal.target, own, locale) }) };
 };
 return <BudgetSection section="contributions" title={t('Goal contributions')} summary={<DrawerLink className="panel-link" href="/goals">{t('Edit contributions in Goals')}</DrawerLink>} columns={<span className="budget-cell budget-remaining">{t('This month')}</span>}>
  <section className="budget-group" data-open>
   <SortableList id="budget-contributions" items={ids} disabled={moveDisabled} nameOf={id => goals.find(goal => goal.id === id)?.name ?? ''} onMove={(id, target) => onMove(id, target, ids)}>
    {goals.map(goal => {
     const state = progress(goal), account = goal.account_id ? data.records.find(record => record.id === goal.account_id)?.name : undefined;
     return <SortableItem key={goal.id} id={goal.id} label={goal.name} className="budget-row budget-category-row budget-contribution-row">
      <span className="budget-category-name"><span className="category-icon" data-size="sm" aria-hidden="true">{goalEmoji(goal)}</span><span>{goal.name}{account && <small className="budget-rollover">{t('From {account}', { account })}</small>}</span></span>
      {state && <span className="budget-state"><BudgetProgress row={{ progress: state.percent / 100, direction: 'income', remaining: 0 }}/><small>{state.label}</small></span>}
      <span className="budget-cell budget-remaining">{money(amountOf(goal))}</span>
     </SortableItem>;
    })}
   </SortableList>
  </section>
  <div className="budget-row budget-total-row"><span className="budget-total-name">{t('Total contributions')}</span><span className="budget-cell budget-remaining"><RollingText text={money(total)}/></span></div>
 </BudgetSection>;
}
