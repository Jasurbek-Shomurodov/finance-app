import { monthDays, shiftMonth } from './calendar-days';
import type { Entry } from './finance';
import { convertAmount } from './market';
import type { PlanningData } from './planning';
import { cashFlowItems } from './spending';
import type { TransactionSplit } from './transaction-tools';
import { ratesOf } from './transaction-rates';

type Rates = number | Record<string, number> | undefined;
export type SpendingPacePoint = { day: number; current: number | null; previous: number | null; /** The plan spread evenly over the month, by this day; null without a plan. */ pace: number | null };
export type PaceStatus = 'on_pace' | 'above_pace' | 'over_plan';
export type SpendingPace = { month: string; previousMonth: string; /** `month` is the month today is in. */ running: boolean; points: SpendingPacePoint[]; spent: number; previousToDate: number; missing: boolean; empty: boolean;
 /** The day of `month` reached (0 before it starts, its last day once it is over) and the month's length. */
 day: number; days: number;
 /** The month's plan for spending, when one was given and a rate converts it. */
 plan: number | null;
 /** Today's total against the even pace toward the plan; null outside the running month or without a plan. */
 status: PaceStatus | null };
type Input = { records: Entry[]; splits: TransactionSplit[]; activity?: PlanningData['activity']; investmentLinks?: PlanningData['investmentLinks'] };
/** `month` is the running month unless given (Budget shows any month); `plan` adds the even-pace line toward it;
 * `excluded` leaves categories out, as the budget totals do. */
type Options = { month?: string; plan?: number | null; excluded?: ReadonlySet<string> };

const dayOf = (month: string, day: number) => `${month}-${String(day).padStart(2, '0')}`;
const paceStatus = (spent: number, plan: number, share: number): PaceStatus => spent > plan + 0.005 ? 'over_plan' : spent > plan * share + 0.005 ? 'above_pace' : 'on_pace';

/** What was spent on each day of `month` up to `through`, by the Monthly review's own walk (`cashFlowItems`), in
 * `currency`. An amount no rate converts is left out and reported as `missing`, never added as it stands. */
function spentByDay(input: Input, month: string, through: string, read: { currency: string; rates: Rates; excluded?: ReadonlySet<string> }) {
 const byDay = new Map<string, number>();
 let missing = false;
 if (through < month + '-01') return { byDay, missing };
 for (const item of cashFlowItems(input.records, month + '-01', through, { splits: input.splits, investmentLinks: input.investmentLinks ?? [] })) {
  if (item.income) continue;
  // The whole item unless categories are left out: then its parts, one category each.
  for (const part of read.excluded ? item.parts : [{ category: '', amount: item.amount }]) {
   if (read.excluded?.has(part.category)) continue;
   const value = item.currency === null ? null : convertAmount(part.amount, item.currency, read.currency, ratesOf(item.dated, read.rates));
   if (value === null || !Number.isFinite(value)) { missing = true; continue; }
   byDay.set(item.date, (byDay.get(item.date) ?? 0) + value);
  }
 }
 return { byDay, missing };
}

type PaceMonth = { month: string; days: number; byDay: Map<string, number> };
/** The running totals of both months day by day, and the even pace toward the plan. */
function pacePoints(shown: PaceMonth, before: PaceMonth, day: number, plan: number | null): SpendingPacePoint[] {
 let current = 0, previous = 0;
 const points: SpendingPacePoint[] = [];
 for (let index = 1; index <= Math.max(shown.days, before.days); index++) {
  if (index <= shown.days) current += shown.byDay.get(dayOf(shown.month, index)) ?? 0;
  // A shorter previous month keeps its final total for the days it does not have.
  if (index <= before.days) previous += before.byDay.get(dayOf(before.month, index)) ?? 0;
  points.push({ day: index, current: index <= day ? current : null, previous, pace: plan === null || index > shown.days ? null : plan * index / shown.days });
 }
 return points;
}

/** Cumulative spending by day of a month (through today) and of the month before, beside an even pace toward the plan:
 * the one series the Spending pace chart draws on the Dashboard and on Budget. It takes the Monthly review's own walk,
 * so today's total is the review's spending total. */
export function spendingPace(input: Input, today: string, currency: string, rates?: Rates, { month = today.slice(0, 7), plan = null, excluded }: Options = {}): SpendingPace {
 const previousMonth = shiftMonth(month, -1), days = monthDays(month), previousDays = monthDays(previousMonth);
 const end = dayOf(month, days), running = today.slice(0, 7) === month, read = { currency, rates, excluded };
 const day = today < month + '-01' ? 0 : running ? Number(today.slice(8, 10)) : days;
 const now = spentByDay(input, month, today < end ? today : end, read), before = spentByDay(input, previousMonth, dayOf(previousMonth, previousDays), read);
 const length = Math.max(days, previousDays);
 const points = pacePoints({ month, days, byDay: now.byDay }, { month: previousMonth, days: previousDays, byDay: before.byDay }, day, plan);
 const reached = points[Math.max(1, Math.min(day, length)) - 1], missing = now.missing || before.missing;
 const spent = day > 0 ? reached.current ?? 0 : 0;
 // Nothing spent in either month: the card shows an empty state rather than a meaningless $0–$1 axis.
 const empty = !missing && points.every(point => !point.current && !point.previous);
 return { month, previousMonth, running, points, spent, previousToDate: reached.previous ?? 0, missing, empty, day, days, plan, status: running && plan !== null && plan > 0 ? paceStatus(spent, plan, day / days) : null };
}

/** `amount` is in `currency`, for ordering and sums; `entered` is the transaction as it was entered, in its own currency, which is what a person reads. */
export type SpendingItem = { id: string; name: string; kind: string; amount: number; entered: { amount: number; currency: string } };
/** Where the money went on one day: that day's actual spending, by the Monthly review's own walk (`cashFlowItems`),
 * largest first. A Tracker expense is named after its holding. An amount without a rate to `currency` is left out rather than guessed. */
export function spendingOnDay(records: Entry[], date: string, currency: string, rates?: number | Record<string, number>, investmentLinks: NonNullable<PlanningData['investmentLinks']> = []): SpendingItem[] {
 const names = new Map(records.map(record => [record.id, record.name]));
 const items: SpendingItem[] = [];
 for (const item of cashFlowItems(records, date, date, { investmentLinks })) {
  if (item.income || item.currency === null) continue;
  const amount = convertAmount(item.amount, item.currency, currency, ratesOf(item.dated, rates));
  if (amount === null || !Number.isFinite(amount) || amount <= 0) continue;
  const { record, link } = item, entered = { amount: item.amount, currency: item.currency };
  items.push(record ? { id: record.id, name: record.name, kind: record.kind, amount, entered } : { id: item.id, name: names.get(link?.investment_history?.record_id ?? '') ?? '', kind: 'Other expense', amount, entered });
 }
 return items.sort((a, b) => b.amount - a.amount);
}
