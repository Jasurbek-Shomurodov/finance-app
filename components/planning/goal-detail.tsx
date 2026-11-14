"use client";
import type { ReactNode } from 'react';
import { Check, Pencil, SlidersHorizontal } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { Button } from '@/components/ui/button';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';
import { goalEmoji } from '@/lib/goal-emoji';
import { goalPath, goalStatus, goalStatusLabels, goalSummary } from '@/lib/goal-projection';
import type { GoalEvent } from '@/lib/goal-funding';
import type { Goal, InvestmentTarget } from '@/lib/planning';
import { GoalProjectionChart } from './goals-lazy';
import type { GoalChartPoint } from './goal-projection-chart';

type Head = { goal: Goal; emoji: string; meta: ReactNode; status?: ReactNode; onEdit: () => void };

/** The panel's head: cover, name with its account or kind and status, and Edit. */
function DetailHead({ goal, emoji, meta, status, onEdit }: Head) {
 const { t } = useLanguage();
 return <header className="goal-detail-head">
  <span className="goal-detail-mark" aria-hidden="true">{emoji}</span>
  <div><h2>{goal.name}</h2><span className="goal-detail-meta">{status}<span>{meta}</span></span></div>
  <Button variant="ghost" size="icon" aria-label={t('Edit goal')} onClick={onEdit}><Pencil size={17} aria-hidden="true"/></Button>
 </header>;
}

type Props = { goal: Goal; current: number | null; currency: string; today: string; meta: ReactNode;
 /** What was saved before today, oldest first, in the goal's currency: goal activity balances or net-worth snapshots. */history: readonly { date: string; value: number }[];
 /** This goal's recorded activity, newest first; the latest three show under the figures. */activity: readonly GoalEvent[];
 onEdit: () => void; onPlanner: () => void; onHistory: () => void };

/** The selected goal beside the list: saved of target, where the monthly contribution takes it (saved line, projected
 * line, target level), the four figures, the day it reaches the target, and its latest activity. */
export function GoalDetail({ goal, current, currency, today, meta, history, activity, onEdit, onPlanner, onHistory }: Props) {
 const { t, locale } = useLanguage();
 // Figures read in the display currency.
 const { show, convert, currency: display } = useDisplayMoney();
 const money = (amount: number) => show(amount, currency);
 const summary = goalSummary(goal, current, today), status = goalStatus(summary);
 const path = goalPath(goal, current, summary.monthly, today);
 const shown = (value: number) => convert(value, currency);
 const target = shown(Number(goal.target));
 const chart = target === null ? null : chartPoints(history, current, path?.points ?? null, today, shown);
 const labels = { saved: t(goal.kind === 'net_worth' ? 'Net worth' : 'Already saved'), projected: t('Projected at {amount} a month', { amount: money(summary.monthly) }) };
 return <section className="panel goal-detail" aria-label={goal.name}>
  <DetailHead goal={goal} emoji={goalEmoji(goal)} meta={meta} onEdit={onEdit} status={status && <span className={'status-badge goal-status is-' + status}>{t(goalStatusLabels[status])}</span>}/>
  <p className="goal-detail-figure"><strong><RollingText text={current === null ? '—' : money(current)}/></strong><span>{t('of {amount}', { amount: money(Number(goal.target)) })}</span>{summary.percent !== null && <span className="goal-detail-percent"><RollingText text={formatPercent(summary.percent, locale, 0)}/></span>}</p>
  {chart ? <div className="goal-detail-chart">
   <div className="goal-projection-key"><span><i/>{labels.saved}</span>{summary.monthly > 0 && <span><i className="chart-planned-key"/>{labels.projected}</span>}<span><i className="is-target"/>{t('Target')}</span></div>
   <GoalProjectionChart points={chart} target={target!} today={today} currency={display ?? currency} labels={labels}/>
  </div> : <div className="progress-track" data-status={status ?? undefined}><span style={{ width: `${summary.percent ?? 0}%` }}/></div>}
  <GoalFigures summary={summary} targetDate={goal.target_date} money={money}/>
  <ReachNote reached={summary.left === 0} reachesOn={path?.reachesOn ?? null} targetDate={goal.target_date} amount={money(Number(goal.target))}/>
  <Button variant="outline" className="goal-detail-planner" onClick={onPlanner}><SlidersHorizontal size={16} aria-hidden="true"/>{t('Goal planner')}</Button>
  {activity.length > 0 && <RecentActivity activity={activity} currency={currency} onHistory={onHistory}/>}
 </section>;
}

/** The saved line up to today, then the projection from today, in the display currency (`shown`); null when one point
 * has no rate or there is nothing to draw. */
function chartPoints(history: Props['history'], current: number | null, path: readonly { date: string; projected: number }[] | null, today: string, shown: (value: number) => number | null): GoalChartPoint[] | null {
 if (current === null || !path) return null;
 const points = [
  ...history.filter(point => point.date < today).map(point => ({ date: point.date, saved: shown(point.value) })),
  { date: today, saved: shown(current), projected: shown(current) },
  ...path.slice(1).map(point => ({ date: point.date, projected: shown(point.projected) })),
 ];
 return points.length > 1 && points.every(point => Object.values(point).every(value => value !== null)) ? points as GoalChartPoint[] : null;
}

/** The day the target is reached at the monthly contribution: green when on time, caution when after the target date. */
function ReachNote({ reached, reachesOn, targetDate, amount }: { reached: boolean; reachesOn: string | null; targetDate: string | null; amount: string }) {
 const { t, locale } = useLanguage();
 if (!reached && !reachesOn) return null;
 const late = !reached && !!reachesOn && !!targetDate && reachesOn > targetDate;
 return <p className={'goal-reach ' + (late ? 'is-late' : 'is-on-time')} role="status"><Check size={16} aria-hidden="true"/>{reached || !reachesOn ? t('Target reached') : t('Reaches {amount} on {date}', { amount, date: formatDate(reachesOn, locale) })}</p>;
}

/** Left to save, the monthly contribution (with what finishes on time when it falls short), the target date and the time left. */
function GoalFigures({ summary, targetDate, money }: { summary: ReturnType<typeof goalSummary>; targetDate: string | null; money: (amount: number) => string }) {
 const { t, locale } = useLanguage();
 const timeLeft = summary.monthsLeft === null ? '—' : summary.monthsLeft > 0 ? t('{count} months', { count: formatNumber(summary.monthsLeft, locale, 0) }) : t('Target date reached');
 return <StatTiles columns={2} label={t('Goal summary')}>
  <StatTile label={t('Left to save')} value={summary.left === null ? '—' : money(summary.left)}/>
  <StatTile label={t('Monthly contribution')} value={summary.monthly ? money(summary.monthly) : '—'}>{summary.needed !== null && summary.needed > summary.monthly && <p>{t('{amount} a month reaches the target on time', { amount: money(summary.needed) })}</p>}</StatTile>
  <StatTile label={t('Target date')} rolling={false} value={targetDate ? formatDate(targetDate, locale) : t('No target date')}/>
  <StatTile label={t('Time left')} rolling={false} value={timeLeft}/>
 </StatTiles>;
}

/** The latest three movements of a cash goal, each as it was entered, with a link to its History. */
function RecentActivity({ activity, currency, onHistory }: { activity: readonly GoalEvent[]; currency: string; onHistory: () => void }) {
 const { t, locale } = useLanguage();
 const { entered, enteredSigned } = useDisplayMoney();
 return <div className="goal-detail-activity">
  <h3>{t('Recent activity')}<Button variant="link" size="sm" onClick={onHistory}>{t('History')}</Button></h3>
  <ul>{activity.slice(0, 3).map(event => <li key={event.id}><span>{formatDate(event.occurred_on, locale)}<small>{t(event.event_type)}</small></span><strong>{Number(event.delta) < 0 ? enteredSigned(Number(event.delta), currency) : entered(Number(event.delta), currency)}</strong></li>)}</ul>
 </div>;
}

/** A stock or crypto goal: each holding as "1.16 of 1.5 BTC" with its progress, and its planner. */
export function InvestmentGoalDetail({ goal, items, meta, onEdit, onPlanner }: { goal: Goal; items: readonly { target: InvestmentTarget; current: number | null }[]; meta: ReactNode; onEdit: () => void; onPlanner: () => void }) {
 const { t, locale } = useLanguage();
 return <section className="panel goal-detail" aria-label={goal.name}>
  <DetailHead goal={goal} emoji={goalEmoji(goal, items.length > 0 && items.every(item => item.target.asset_kind === 'Crypto'))} meta={meta} onEdit={onEdit}/>
  <ul className="goal-detail-holdings">{items.map(({ target, current }) => {
   const percent = current === null || !(target.target > 0) ? null : Math.max(0, Math.min(100, current / target.target * 100));
   return <li key={target.holding_account_id + target.asset_symbol}>
    <span className="goal-row-line"><strong>{target.asset_symbol}</strong><span>{t('{current} of {target}', { current: current === null ? '—' : formatNumber(current, locale), target: `${formatNumber(target.target, locale)} ${target.asset_symbol}` })}</span></span>
    <span className="progress-track"><span style={{ width: `${percent ?? 0}%` }}/></span>
    {percent !== null && <small>{formatPercent(percent, locale, 0)}</small>}
   </li>;
  })}</ul>
  <Button variant="outline" className="goal-detail-planner" onClick={onPlanner}><SlidersHorizontal size={16} aria-hidden="true"/>{t('Goal planner')}</Button>
 </section>;
}
