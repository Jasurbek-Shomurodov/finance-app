// What the personal financial report says about trends and what comes next: highlights in plain sentences, net worth
// month by month, spending per category against earlier months, payments due in the next 30 days and a few health
// ratios. Every combined figure is in the reporting currency; one that cannot be converted is Not available, never a guess.
import { shiftDay, shiftMonth } from './calendar-days';
import { trendMonths } from './cash-flow-report';
import { assets, income, liabilities } from './finance';
import { formatCompactMoney, formatMonthShort, formatNumber, formatPercent, formatSignedMoney } from './format';
import { convertAmount, marketRates } from './market';
import { debtPaymentsFrom, upcomingPayments, type DueItem, type Occurrence } from './planning';
import { reportNumber as number, wealthTotals } from './report-figures';
import { axisTicks, cashFlow, categoryLooks, plain, type Flow } from './financial-report-visuals';
import type { Report } from './financial-report-context';

/** The figures the new sections share, worked out once. */
export type Insights = ReturnType<typeof reportInsights>;

/** Round ticks around a range that may sit far from zero or below it: three or four steps of 1, 2, 2.5 or 5 × 10ⁿ. */
export function rangeTicks(min: number, max: number) {
 if (min >= 0 && max > 0 && min < max / 2) return axisTicks(max);
 const span = max - min || Math.abs(max) || 1, rough = span / 3, power = 10 ** Math.floor(Math.log10(rough));
 const step = [1, 2, 2.5, 5, 10].map(factor => factor * power).find(value => value >= rough)!;
 const lo = Math.floor(min / step) * step, hi = Math.max(lo + step, Math.ceil(max / step) * step);
 return Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, index) => lo + index * step);
}

const convert = (r: Report, amount: number, currency: string) => convertAmount(amount, currency, r.reporting, marketRates(r.market));

/** Net worth at the end of each of the last 12 months from the saved daily snapshots, each at its own saved rates; this
 * month ends with today's net worth. Null for a month with no snapshot. */
function netWorthTrend(r: Report) {
 const snapshots = (r.tables.portfolio_snapshots ?? []).filter(row => String(row.occurred_on) <= r.today).sort((a, b) => String(a.occurred_on).localeCompare(String(b.occurred_on)));
 const total = wealthTotals(r.wealth, r.reporting, r.market), now = total && !total.excluded.length ? total.net : null;
 return trendMonths(r.month, 'month').map(month => {
  if (month === r.month && now !== null) return { month, value: now };
  const snap = snapshots.filter(row => String(row.occurred_on).startsWith(month)).at(-1);
  const assetsValue = number(snap?.assets), debt = number(snap?.debt);
  return { month, value: snap && assetsValue !== null && debt !== null ? convertAmount(assetsValue - debt, 'USD', r.reporting, snap.rates as Record<string, number>) : null };
 });
}

/** Money in or out: income, maturing deposits and money lent coming back are in; bills and debt payments are out. */
const isIncoming = (item: DueItem) => income.includes(item.record.kind) || item.type === 'maturity' || (item.type === 'repayment' && assets.includes(item.record.kind));

function nextDays(r: Report) {
 const through = shiftDay(r.today, 30);
 // Monthly loan installments count as Overview counts them: a month without a recorded payment is still due.
 const paid = debtPaymentsFrom(r.ledger.activity as Parameters<typeof debtPaymentsFrom>[0], (r.tables.mortgage_payments ?? []) as unknown as Parameters<typeof debtPaymentsFrom>[1]);
 const items = upcomingPayments(r.records, (r.tables.payment_occurrences ?? []) as Occurrence[], r.today, through, paid).filter(item => !item.overdue && Number(item.amount) > 0);
 const sum = (incoming: boolean) => items.filter(item => isIncoming(item) === incoming).reduce<number | null>((total, item) => {
  const value = convert(r, Number(item.amount), item.record.currency);
  return total === null || value === null ? null : total + value;
 }, 0);
 return { items, through, in: sum(true), out: sum(false) };
}

/** Cash in the reporting currency, debt payments a month, and the debt-to-assets share; null where a figure is unknown. */
function balances(r: Report) {
 const cash = r.wealth.filter(w => w.record.kind === 'Cash').reduce<number | null>((total, w) => {
  const value = w.amount === null ? null : convert(r, w.amount, w.record.currency);
  return total === null || value === null ? null : total + value;
 }, 0);
 const debts = r.wealth.filter(w => liabilities.includes(w.record.kind) && (w.amount ?? 0) > 0);
 const payments = debts.reduce<number | null>((total, w) => {
  const payment = Number(r.byId.get(w.record.id)?.estimated_monthly_payment), value = payment > 0 ? convert(r, payment, w.record.currency) : null;
  return total === null || value === null ? null : total + value;
 }, 0);
 const total = r.consolidated && !r.consolidated.excluded.length ? r.consolidated : null;
 return { cash, payments, debtToAssets: total && total.assets > 0 ? total.debt / total.assets * 100 : null };
}

export function reportInsights(r: Report) {
 const previous = shiftMonth(r.month, -1), earlier = [shiftMonth(r.month, -3), shiftMonth(r.month, -2), previous];
 const month = cashFlow(r, [r.month]), last = cashFlow(r, [previous]), prior = cashFlow(r, earlier);
 const known = (flow: Flow) => flow.missing === 0;
 const average = (value: number) => known(prior) && prior.series.some(item => item.income > 0 || item.expenses > 0) ? value / 3 : null;
 const avgSpending = average(prior.expenses), avgIncome = average(prior.income), held = balances(r);
 return {
  month, last, prior, known, avgSpending, avgIncome, ...held,
  trend: netWorthTrend(r), next: nextDays(r),
  cover: held.cash !== null && avgSpending ? held.cash / avgSpending : null,
  debtShare: held.payments !== null && avgIncome ? held.payments / avgIncome * 100 : null,
  savingsRate: known(prior) ? prior.savingsRate : null,
 };
}

const months = (r: Report, value: number) => r.t('{count} months', { count: formatNumber(value, r.locale, 1) });
const percent = (r: Report, value: number) => plain(formatPercent(value, r.locale, 0));

/** Each category's spending this month so far, last month and on average over the three months before, largest first. */
function categoryRows(r: Report, x: Insights) {
 const amounts = (flow: Flow) => new Map(flow.categories.expense.map(share => [share.key, share.amount]));
 const now = amounts(x.month), last = amounts(x.last), prior = amounts(x.prior);
 return [...new Set([...now.keys(), ...last.keys(), ...prior.keys()])]
  .map(key => ({ key, now: now.get(key) ?? 0, last: last.get(key) ?? 0, average: (prior.get(key) ?? 0) / 3 }))
  .sort((a, b) => Math.max(b.now, b.average) - Math.max(a.now, a.average)).slice(0, 12);
}

/** Plain sentences on the figures that matter most this period; each only when its figures are known. */
export function highlightsBlock(r: Report, x: Insights) {
 const { t, reporting } = r, items: string[] = [];
 const first = x.trend.find(point => point.value !== null), latest = x.trend.at(-1)?.value ?? null;
 if (latest !== null) items.push(first && first.month !== r.month
  ? t('Net worth is {amount}, {change} since {date}.', { amount: r.money(latest, reporting), change: plain(formatSignedMoney(latest - first.value!, reporting, r.locale)), date: r.date(first.month + '-01') })
  : t('Net worth is {amount}.', { amount: r.money(latest, reporting) }));
 if (x.known(x.month) && x.avgSpending) items.push(t('Spending so far this month is {amount}, {percent} of your 3-month monthly average.', { amount: r.money(x.month.expenses, reporting), percent: percent(r, x.month.expenses / x.avgSpending * 100) }));
 if (x.known(x.month) && x.known(x.prior) && x.avgSpending) {
  const rise = categoryRows(r, x).map(row => ({ ...row, over: row.now - row.average })).sort((a, b) => b.over - a.over)[0];
  if (rise && rise.over >= 1) items.push(t('{category} spending is {amount} above its 3-month average.', { category: categoryLooks(r).label(rise.key), amount: r.money(rise.over, reporting) }));
 }
 if (x.cover !== null) items.push(t('Your cash covers {months} of average spending.', { months: months(r, x.cover) }));
 if (x.debtShare !== null && x.debtShare > 0) items.push(t('Debt payments take {percent} of your average income.', { percent: percent(r, x.debtShare) }));
 if (x.next.items.some(item => !isIncoming(item)) && x.next.out !== null) items.push(t('{amount} is due to go out in the next 30 days.', { amount: r.money(x.next.out, reporting) }));
 if (items.length) r.push({ kind: 'list', text: t('Highlights'), items });
}

/** Net worth month by month, when at least two months are known. */
export function trendBlock(r: Report, x: Insights) {
 const values = x.trend.flatMap(point => point.value === null ? [] : [point.value]);
 if (values.length < 2) return;
 const ticks = rangeTicks(Math.min(...values), Math.max(...values));
 r.push({ kind: 'line', text: `${r.t('Net worth over time')} · ${r.t('Last 12 months')}`, points: x.trend.map(point => ({ label: formatMonthShort(point.month, r.locale), value: point.value })), ticks: ticks.map(value => ({ value, label: plain(formatCompactMoney(value, r.reporting, r.locale)) })), note: r.t('Month-end snapshots at their own saved rates; the last point is today.') });
}

/** A few ratios that say how resilient the finances are, each with how it is worked out. */
export function healthSection(r: Report, x: Insights) {
 const { t, na } = r;
 r.add('heading', t('Financial health'));
 r.table(['Measure', 'Value', 'How it is worked out'], [
  [t('Months of spending covered by cash'), x.cover === null ? na : months(r, x.cover), t('Cash ÷ average monthly spending over the last 3 full months.')],
  [t('Savings rate, last 3 months'), x.savingsRate === null ? na : percent(r, x.savingsRate), t('(Income - spending) ÷ income over the last 3 full months.')],
  [t('Debt payments to income'), x.debtShare === null ? na : percent(r, x.debtShare), t('Scheduled monthly debt payments ÷ average monthly income over the last 3 full months.')],
  [t('Debt to assets'), x.debtToAssets === null ? na : percent(r, x.debtToAssets), t('Outstanding debt ÷ total assets.')],
 ], [.3, .18, .52], [1]);
 r.add('text', t('General guides only, not advice. A ratio stays Not available while a figure or an exchange rate is missing.'));
}

/** Spending per category this month so far beside last month and the three months before. */
export function comparisonTable(r: Report, x: Insights) {
 const { t, reporting } = r;
 r.add('subheading', `${t('Spending compared with earlier months')} · ${reporting}`);
 if (![x.month, x.last, x.prior].every(x.known)) { r.add('text', t('Exchange rate unavailable.')); return; }
 const label = categoryLooks(r).label;
 r.table(['Category', 'This month so far', 'Last month', '3-month average', 'Compared with average'], categoryRows(r, x).map(row =>
  [label(row.key), r.money(row.now, reporting), r.money(row.last, reporting), r.money(row.average, reporting), plain(formatSignedMoney(Math.round(row.now - row.average), reporting, r.locale))]), [.28, .18, .18, .18, .18], [1, 2, 3, 4]);
 r.add('text', t('This month is counted through the report date; the other columns are full months.'));
}

/** Bills, income, loan payments and maturities due in the next 30 days, each as entered, with totals in and out. */
export function nextDaysSection(r: Report, x: Insights) {
 const { t, reporting } = r, { items } = x.next;
 r.add('heading', `${t('Next 30 days')} · ${r.date(r.today)} - ${r.date(x.next.through)}`);
 if (!items.length) { r.add('text', t('Nothing scheduled in the next 30 days.')); return; }
 r.table(['Date', 'Item', 'Money in', 'Money out'], items.map(item => {
  const amount = r.money(Number(item.amount), item.record.currency), incoming = isIncoming(item);
  return [r.date(item.date), `${item.record.name} · ${t(item.record.kind)}`, incoming ? amount : '', incoming ? '' : amount];
 }), [.2, .44, .18, .18], [2, 3]);
 r.add('text', `${t('Expected in: {in} · Expected out: {out}', { in: r.money(x.next.in, reporting), out: r.money(x.next.out, reporting) })}. ${t('Unpaid scheduled payments as entered; totals in the reporting currency.')}`);
}
