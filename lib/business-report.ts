import { monthsBetween } from './budget';
import { monthEnd, shiftMonth } from './calendar-days';
import { HOUSEHOLD, inBusinessFilter, type BusinessFilter } from './business';
import { budgetKey, type Entry } from './finance';
import { convertAmount } from './market';
import type { Money } from './money';
import type { Share } from './cash-flow-report';
import type { PlanningData } from './planning';
import { cashFlowItems, isMortgagePayment } from './spending';
import type { TransactionSplit } from './transaction-tools';
import { ratesOf } from './transaction-rates';

type Rates = number | Record<string, number> | undefined;
export type Direction = 'income' | 'expense';

/** Inclusive ISO dates. Reports read at most 24 months of transactions. */
export type ReportRange = { from: string; to: string };
/** The months a range touches, which is what the planning read needs. */
export const rangeMonths = (range: ReportRange) => monthsBetween(range.from.slice(0, 7), range.to.slice(0, 7));
/** A range the planning read accepts: it ends with the later month and covers at most 24 months. */
export const readableRange = (range: ReportRange): ReportRange => {
 const months = rangeMonths(range);
 return months.length <= 24 ? range : { from: months[months.length - 24] + '-01', to: range.to };
};

/** One amount on a report: a transaction, or one split part of it, in the display currency. `entered` is the same amount
 * as it was recorded: one transaction reads this way, and only sums read `amount` (AGENTS.md, entered or converted). */
export type LedgerLine = { id: string; record: Entry | null; name: string; date: string; direction: Direction; amount: number; entered: Money; category: string; business: string | null };
/** A line no rate converts: known by its date, side, owner and category, so a screen counts it only where it is in view. */
export type UnconvertedLine = Omit<LedgerLine, 'amount' | 'entered'>;

/** The business a Tracker expense belongs to: its asset, or the business that asset is held under. */
const assetBusiness = (asset: Entry | undefined) => asset ? asset.kind === 'Business' ? asset.id : asset.business_id ?? null : null;

/** Recorded income and spending in the range, by the one walk of `cashFlowItems`: splits become their parts, mortgage
 * payments count their interest (`lib/spending.ts`), and tracker expenses on investments count where they have no
 * transaction of their own. `unconverted` lists what no rate converts; `missing` counts those transactions. */
export function reportLedger(data: Pick<PlanningData, 'records' | 'investmentLinks'>, splits: readonly TransactionSplit[], range: ReportRange, currency: string, today: string, rates: Rates) {
 const lines: LedgerLine[] = [], unconverted: UnconvertedLine[] = [];
 let missing = 0;
 const records = data.records as Entry[], byId = new Map(records.map(record => [record.id, record]));
 const splitsOf = new Map<string, TransactionSplit[]>();
 for (const part of splits) splitsOf.set(part.record_id, [...splitsOf.get(part.record_id) ?? [], part]);
 for (const item of cashFlowItems(records, range.from, range.to < today ? range.to : today, { splits, investmentLinks: data.investmentLinks ?? [] })) {
  const { record } = item, asset = item.link ? byId.get(item.link.investment_history?.record_id ?? '') : undefined;
  const split = record && !isMortgagePayment(record) ? splitsOf.get(record.id) ?? [] : [];
  // Spending carries its parts; a split income is read the same way, and otherwise stands in its own category.
  const parts = !item.income ? item.parts : split.length ? split.map(part => ({ category: part.category_id, amount: Number(part.amount) })) : [{ category: budgetKey(record!), amount: item.amount }];
  const base = { name: record ? record.name.trim() || record.kind : asset?.name ?? 'Other expense', date: item.date, direction: (item.income ? 'income' : 'expense') as Direction, record, business: record ? record.business_id ?? null : assetBusiness(asset) };
  const converted = parts.map((part, index) => ({ ...base, id: split.length ? `${item.id}:${index}` : item.id, category: part.category, part, value: item.currency === null ? null : convertAmount(part.amount, item.currency, currency, ratesOf(item.dated, rates)) }));
  if (converted.some(line => line.value === null || !Number.isFinite(line.value))) {
   missing++;
   for (const { id, category } of converted) unconverted.push({ ...base, id, category });
   continue;
  }
  for (const { part, value, ...line } of converted) lines.push({ ...line, amount: value!, entered: { amount: part.amount, currency: item.currency! } });
 }
 return { lines: lines.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), unconverted, missing };
}

/** How many transactions these unconverted lines come from: a split one is several lines. */
export const unconvertedCount = (lines: readonly UnconvertedLine[]) => new Set(lines.map(line => line.record?.id ?? line.id)).size;

/** Lines of the selected businesses (and the household when it is selected, or nothing is). */
export const filterLines = <L extends Pick<LedgerLine, 'business'>>(lines: readonly L[], filter: BusinessFilter) => lines.filter(line => inBusinessFilter(filter, line.business));

export type Attribute = 'category' | 'group' | 'merchant' | 'business';
/** Totals by a key, largest first, with each one's share of the whole. */
export function sharesBy(lines: readonly LedgerLine[], keyOf: (line: LedgerLine) => string): Share[] {
 const totals = new Map<string, number>();
 for (const line of lines) totals.set(keyOf(line), (totals.get(keyOf(line)) ?? 0) + line.amount);
 const sum = [...totals.values()].reduce((total, amount) => total + amount, 0);
 return [...totals].filter(([, amount]) => amount > 0).map(([key, amount]) => ({ key, amount, share: sum > 0 ? amount / sum : 0 })).sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key));
}
export const businessKey = (line: Pick<LedgerLine, 'business'>) => line.business ?? HOUSEHOLD;

export type PnlLine = { key: string; amount: number };
export type BusinessPnl = { id: string; income: PnlLine[]; expenses: PnlLine[]; grossIncome: number; totalExpenses: number; net: number };
export type ProfitAndLoss = { household: { income: PnlLine[]; incomeTotal: number; expenses: PnlLine[]; expenseTotal: number } | null; businesses: BusinessPnl[]; totalIncome: number; net: number };
const pnlLines = (lines: readonly LedgerLine[], keyOf: (line: LedgerLine) => string) => sharesBy(lines, keyOf).map(({ key, amount }) => ({ key, amount }));
const sum = (lines: readonly { amount: number }[]) => lines.reduce((total, line) => total + line.amount, 0);

/** Profit and loss: each business's net income (gross income less business expenses) rolls up into total
 * income beside household income, as profit from a pass-through business does on a personal return; household
 * expenses then leave the net cash flow. `businessIds` gives the businesses to list, in display order. */
export function profitAndLoss(lines: readonly LedgerLine[], businessIds: readonly string[], keyOf: (line: LedgerLine) => string, includeHousehold: boolean): ProfitAndLoss {
 const of = (business: string | null, direction: Direction) => lines.filter(line => line.business === business && line.direction === direction);
 const businesses = businessIds.map(id => {
  const incomeLines = of(id, 'income'), expenseLines = of(id, 'expense');
  const grossIncome = sum(incomeLines), totalExpenses = sum(expenseLines);
  return { id, income: pnlLines(incomeLines, keyOf), expenses: pnlLines(expenseLines, keyOf), grossIncome, totalExpenses, net: grossIncome - totalExpenses };
 });
 const household = includeHousehold ? (() => {
  const incomeLines = of(null, 'income'), expenseLines = of(null, 'expense');
  return { income: pnlLines(incomeLines, keyOf), incomeTotal: sum(incomeLines), expenses: pnlLines(expenseLines, keyOf), expenseTotal: sum(expenseLines) };
 })() : null;
 const totalIncome = (household?.incomeTotal ?? 0) + businesses.reduce((total, business) => total + business.net, 0);
 return { household, businesses, totalIncome, net: totalIncome - (household?.expenseTotal ?? 0) };
}

/** What a click on a chart narrows the transactions to. */
/** `savings` is the period's net income: it narrows nothing and opens where that money went. */
export type Drill = { direction?: Direction; category?: string; categories?: readonly string[]; business?: string | null; merchant?: string; savings?: number };
export const drillMatches = <L extends UnconvertedLine>(drill: Drill | null, line: L, keyOf: (line: L) => string = line => line.category) => !drill || (
 (drill.direction === undefined || line.direction === drill.direction) && (drill.category === undefined || keyOf(line) === drill.category) && (drill.categories === undefined || drill.categories.includes(line.category))
 && (drill.business === undefined || line.business === drill.business) && (drill.merchant === undefined || line.name === drill.merchant));

/** Every node needs a name of its own: a business's line that shares its name with another node says whose it is. */
function nameEachOnce(nodes: SankeyNode[], used: ReadonlySet<number>, inBusiness: (name: string, business: string) => string) {
 const count = new Map<string, number>();
 for (const key of used) count.set(nodes[key].name, (count.get(nodes[key].name) ?? 0) + 1);
 for (const key of used) {
  const item = nodes[key], business = item.drill?.business;
  if ((item.kind === 'income' || item.kind === 'expense') && business && count.get(item.name)! > 1) nodes[key] = { ...item, name: inBusiness(item.name, business) };
 }
}

export type SankeyNode = { name: string; kind: 'income' | 'total' | 'expense' | 'savings' | 'business' | 'loss'; drill: Drill | null };
export type BusinessSankey = { nodes: SankeyNode[]; links: Array<{ source: number; target: number; value: number }> };
/** Where money came from and went, with a layer for each business: its income flows into it and its expenses out of
 * it (a business with one kind of income is its own source); a profit then flows into household income, while a loss leaves the household like any other expense. Without
 * the household, a business's profit or loss stands on its own. Small flows merge into "Other". */
export function businessSankey(pnl: ProfitAndLoss, labels: { category: (key: string) => string; business: (id: string) => string; total: string; savings: string; profit: string; loss: (name: string) => string; otherIncome: string; otherExpense: string; inBusiness: (name: string, business: string) => string }, limit = 7): BusinessSankey {
 const nodes: SankeyNode[] = [], links: BusinessSankey['links'] = [];
 const node = (item: SankeyNode) => nodes.push(item) - 1;
 const top = (items: PnlLine[], other: string, direction: Direction, business: string | null) => {
  const named = items.length <= limit ? items : items.slice(0, limit - 1);
  const rest = items.length <= limit ? [] : items.slice(limit - 1);
  return [...named.map(item => ({ name: labels.category(item.key), amount: item.amount, drill: { direction, category: item.key, business } as Drill })), ...(rest.length ? [{ name: other, amount: sum(rest), drill: { direction, business } as Drill }] : [])];
 };
 const household = pnl.household;
 const total = household ? node({ name: labels.total, kind: 'total', drill: { business: null } }) : -1;
 if (household) for (const item of top(household.income, labels.otherIncome, 'income', null)) links.push({ source: node({ name: item.name, kind: 'income', drill: item.drill }), target: total, value: item.amount });
 for (const business of pnl.businesses) {
  if (!business.grossIncome && !business.totalExpenses) continue;
  const name = labels.business(business.id);
  const hub = node({ name, kind: 'business', drill: { business: business.id } });
  // A business with a single kind of income is its own source: a node named only "Business income" would say less
  // than the business's name and repeat beside every other business.
  if (business.income.length > 1) for (const item of top(business.income, labels.otherIncome, 'income', business.id)) links.push({ source: node({ name: item.name, kind: 'income', drill: item.drill }), target: hub, value: item.amount });
  for (const item of top(business.expenses, labels.otherExpense, 'expense', business.id)) links.push({ source: hub, target: node({ name: item.name, kind: 'expense', drill: item.drill }), value: item.amount });
  if (business.net > 0) links.push({ source: hub, target: household ? total : node({ name: labels.profit, kind: 'savings', drill: { business: business.id } }), value: business.net });
  else if (business.net < 0) {
   if (household) links.push({ source: total, target: node({ name: labels.loss(name), kind: 'loss', drill: { business: business.id } }), value: -business.net });
   else links.push({ source: node({ name: labels.loss(name), kind: 'loss', drill: { business: business.id } }), target: hub, value: -business.net });
  }
 }
 if (household) {
  for (const item of top(household.expenses, labels.otherExpense, 'expense', null)) links.push({ source: total, target: node({ name: item.name, kind: 'expense', drill: item.drill }), value: item.amount });
  if (pnl.net > 0) links.push({ source: total, target: node({ name: labels.savings, kind: 'savings', drill: { savings: pnl.net } }), value: pnl.net });
 }
 const used = new Set(links.filter(link => link.value > 0).flatMap(link => [link.source, link.target]));
 nameEachOnce(nodes, used, (name, business) => labels.inBusiness(name, labels.business(business)));
 const index = new Map([...nodes.keys()].filter(key => used.has(key)).map((key, position) => [key, position]));
 return { nodes: nodes.filter((_, key) => used.has(key)), links: links.filter(link => link.value > 0).map(link => ({ source: index.get(link.source)!, target: index.get(link.target)!, value: link.value })) };
}

export const intervals = ['month', 'quarter', 'year'] as const;
export type Interval = typeof intervals[number];
/** The interval a date falls in: `2026-07`, `2026-Q3` or `2026`. */
export const intervalOf = (date: string, interval: Interval) => interval === 'month' ? date.slice(0, 7) : interval === 'year' ? date.slice(0, 4) : `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
const intervalMonths: Record<Interval, number> = { month: 1, quarter: 3, year: 12 };
/** The month, quarter or year that `date` falls in, ending today at the latest. */
export function periodOf(interval: Interval, date: string, today: string): ReportRange {
 const month = date.slice(0, 7), first = interval === 'month' ? month : interval === 'year' ? `${month.slice(0, 4)}-01` : shiftMonth(month, -((Number(month.slice(5, 7)) - 1) % 3));
 const last = monthEnd(shiftMonth(first, intervalMonths[interval] - 1));
 return { from: first + '-01', to: last < today ? last : today };
}
/** The first day of the period `steps` months, quarters or years away. */
export const shiftPeriod = (date: string, interval: Interval, steps: number) => shiftMonth(date.slice(0, 7), steps * intervalMonths[interval]) + '-01';
/** Trends end with the period: the last 12 months, 8 quarters or 2 years, within the 24 months a report reads. */
export function trendWindow(period: ReportRange, interval: Interval): ReportRange {
 const back = interval === 'month' ? 11 : interval === 'quarter' ? 21 : 12;
 return { from: shiftMonth(period.from.slice(0, 7), -back) + '-01', to: period.to };
}
export const intervalsIn = (range: ReportRange, interval: Interval) => [...new Set(rangeMonths(range).map(month => intervalOf(month + '-01', interval)))];

/** Income, expenses and net for each interval of the range. */
export function cashFlowTrend(lines: readonly LedgerLine[], range: ReportRange, interval: Interval) {
 const rows = new Map(intervalsIn(range, interval).map(period => [period, { period, income: 0, expenses: 0, net: 0 }]));
 for (const line of lines) {
  const row = rows.get(intervalOf(line.date, interval));
  if (!row) continue;
  if (line.direction === 'income') { row.income += line.amount; row.net += line.amount; } else { row.expenses += line.amount; row.net -= line.amount; }
 }
 return [...rows.values()];
}

/** One direction's totals for each interval, split by a key; keys past the largest `limit` share one "other" series. */
export function attributeTrend(lines: readonly LedgerLine[], range: ReportRange, interval: Interval, keyOf: (line: LedgerLine) => string, limit = 6, other = 'other') {
 const ranked = sharesBy(lines, keyOf);
 const kept = ranked.length <= limit ? ranked.map(item => item.key) : ranked.slice(0, limit - 1).map(item => item.key);
 const keys = ranked.length > kept.length ? [...kept, other] : kept;
 const rows = new Map(intervalsIn(range, interval).map(period => [period, Object.fromEntries([['period', period], ...keys.map(key => [key, 0])]) as Record<string, number | string>]));
 for (const line of lines) {
  const row = rows.get(intervalOf(line.date, interval));
  if (!row) continue;
  const key = kept.includes(keyOf(line)) ? keyOf(line) : other;
  row[key] = Number(row[key]) + line.amount;
 }
 return { keys, rows: [...rows.values()] };
}

/** Net income (income less expenses) for each interval, one series per key such as a business or the household. */
export function netTrendBy(lines: readonly LedgerLine[], range: ReportRange, interval: Interval, keyOf: (line: LedgerLine) => string, keys: readonly string[]) {
 const rows = new Map(intervalsIn(range, interval).map(period => [period, Object.fromEntries([['period', period], ...keys.map(key => [key, 0])]) as Record<string, number | string>]));
 for (const line of lines) {
  const row = rows.get(intervalOf(line.date, interval)), key = keyOf(line);
  if (!row || !keys.includes(key)) continue;
  row[key] = Number(row[key]) + (line.direction === 'income' ? line.amount : -line.amount);
 }
 return [...rows.values()];
}

/** The summary beside a report's transactions: how many, each direction's total, the largest one and the first and last dates. */
export function summarizeLines(lines: readonly LedgerLine[]) {
 let incomeTotal = 0, expenseTotal = 0, largest: LedgerLine | null = null, first: string | null = null, last: string | null = null;
 for (const line of lines) {
  if (line.direction === 'income') incomeTotal += line.amount; else expenseTotal += line.amount;
  if (!largest || line.amount > largest.amount) largest = line;
  if (!first || line.date < first) first = line.date;
  if (!last || line.date > last) last = line.date;
 }
 return { count: lines.length, income: incomeTotal, expenses: expenseTotal, largest, first, last };
}

/** A report's transactions as export rows, newest first as shown. Spending is negative; amounts stay unrounded numbers. */
export const ledgerExportRows = (lines: readonly LedgerLine[], categoryName: (key: string) => string, businessName: (id: string | null) => string) =>
 lines.map(line => ({ date: line.date, name: line.name, category: categoryName(line.category), business: businessName(line.business), amount: line.direction === 'income' ? line.amount : -line.amount }));
