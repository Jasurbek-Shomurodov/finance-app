"use client";
import { ArrowRight } from 'lucide-react';
import { useDisplayMoney } from '@/components/display-money';
import { useLanguage } from '@/components/language-provider';
import { OwedDonut, PayoffChartCompact } from '@/components/loans/loans-lazy';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { Button } from '@/components/ui/button';
import { methodLabels, payoffSeries, type DebtPlan, type payoffPlan } from '@/lib/debt-plan';
import type { Entry } from '@/lib/finance';
import { formatMoney, formatMonthYear, formatPercent } from '@/lib/format';

const sliceColors = ['var(--chart-3)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-1)', 'var(--chart-5)'];

/** What is owed, by debt: a donut of the balances, the interest this month's balances earn the lender, and each debt's
 * rate beside its balance. */
export function OwedBreakdown({ debts }: { debts: readonly Entry[] }) {
 const { t, locale } = useLanguage();
 const { currency, convert, show, sum } = useDisplayMoney();
 const rows = debts.map((debt, index) => ({ debt, color: sliceColors[index % sliceColors.length], amount: convert(debt.amount, debt.currency) }));
 const interest = sum(debts.map(debt => ({ amount: debt.amount * debt.rate / 1200, currency: debt.currency })));
 const payments = sum(debts.map(debt => ({ amount: debt.estimated_monthly_payment ?? 0, currency: debt.currency })));
 const unit = currency ?? debts[0]?.currency ?? 'USD';
 return <section className="panel owed-breakdown">
  <PanelTitle title={t('What you owe')}/>
  <div className="owed-breakdown-lead">
   <OwedDonut currency={unit} slices={rows.flatMap(row => row.amount === null ? [] : [{ id: row.debt.id, name: row.debt.name, amount: row.amount, color: row.color }])}/>
   <div><span>{t('Interest this month')}</span><strong><RollingText text={interest === null ? '—' : formatMoney(interest, unit, locale)}/></strong>{!!payments && <small>{t('of {amount} in payments', { amount: formatMoney(payments, unit, locale) })}</small>}</div>
  </div>
  <ul className="owed-breakdown-list">{rows.map(({ debt, color }) => <li key={debt.id}>
   <span><i style={{ background: color }} aria-hidden="true"/>{debt.name}</span>
   <span>{debt.rate > 0 ? formatPercent(debt.rate, locale, 2) : ''}</span>
   <strong>{show(debt.amount, debt.currency)}</strong>
  </li>)}</ul>
 </section>;
}

/** The saved payoff plan at a glance: the balance against minimum payments only, the extra paid each month and the
 * interest it saves, with the way into the planner. */
export function PayoffPlanCard({ plan, worked, today, onOpen }: { plan: DebtPlan; worked: ReturnType<typeof payoffPlan>; today: string; onOpen: () => void }) {
 const { t, locale } = useLanguage();
 const { result, minimums } = worked;
 if (!result || !worked.debts.length) return null;
 const money = (amount: number) => formatMoney(amount, plan.currency, locale);
 const points = payoffSeries(today, result, plan.extra > 0 ? minimums : null);
 const saved = minimums?.months != null && result.months !== null ? minimums.interest - result.interest : null;
 return <section className="panel payoff-plan-card">
  <PanelTitle title={t('Payoff plan')} hint={<><p>{t('Compare fixed-rate monthly scenarios. Minimum payments are planning assumptions; this does not record payments. Fees, new borrowing and rate changes are excluded.')}</p><p>{t('Only debts in {currency} are included.', { currency: plan.currency })}</p></>}><span className="status-badge payoff-method-badge">{t(methodLabels[plan.method])}</span></PanelTitle>
  <div><PayoffChartCompact points={points} currency={plan.currency} compact/><p className="payoff-chart-ends"><span>{formatMonthYear(points[0].month, locale)}</span><span>{formatMonthYear(points[points.length - 1].month, locale)}</span></p></div>
  <dl className="payoff-plan-facts">
   <div><dt>{t('Extra monthly payment')}</dt><dd>{money(plan.extra)}</dd></div>
   <div><dt>{t('Interest saved by extra payments')}</dt><dd className={saved !== null && saved > 0 ? 'positive' : undefined}>{saved === null ? '—' : money(saved)}</dd></div>
  </dl>
  <Button variant="outline" onClick={onOpen}>{t('Debt payoff planner')}<ArrowRight size={16} aria-hidden="true"/></Button>
 </section>;
}
