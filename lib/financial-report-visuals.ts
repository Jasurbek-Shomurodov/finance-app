// The opening pages of the personal financial report: key figures, where the money went (Sankey, as on Cash flow),
// income and spending by month, spending by category and what the assets are made of. Every figure is in the
// reporting currency, counted the way Cash flow counts it (`cashFlowReport`), each transaction at its own day's rates.
import { signTone } from '@/components/presentation-foundation/tone';
import { cashFlowReport, otherShareKey, sankeyFlows, topShares, trendMonths, type Share } from './cash-flow-report';
import { chosenCategoryEmoji, type CategoryIcons } from './category-icons';
import { chosenCategoryHue, type CategoryColors } from './category-colors';
import { assets } from './finance';
import { formatCompactMoney, formatMonthShort, formatMonthYear, formatPercent, formatSignedMoney } from './format';
import { convertAmount, marketRates } from './market';
import type { Category } from './planning';
import { sankeyNodeValue } from './sankey-labels';
import type { Report } from './financial-report-context';
import type { ReportBar, ReportIcon, ReportShare, ReportTile } from './financial-report-context';

/** The bundled PDF font has no minus sign (U+2212); a hyphen is printed in its place, as in the report's tables. */
export const plain = (text: string) => text.replace(/−/g, '-');
/** Savings has no category of its own: a piggy bank in the positive green. */
export const savingsIcon: ReportIcon = { emoji: '🐷', hue: 150 };

type Looks = { label: (key: string) => string; icon: (key: string) => ReportIcon };
/** Category names and looks as the app shows them: an added category's name, else the translated built-in name, with
 * the icon and colour chosen in Settings (`category_icons`) or the category's default. */
export function categoryLooks(r: Pick<Report, 't' | 'tables'>): Looks {
 const categories = (r.tables.transaction_categories ?? []).map(row => ({ id: String(row.id), name: typeof row.name === 'string' ? row.name.trim() : '' }));
 const saved = (r.tables.workspace_preferences ?? []).find(row => row.key === 'category_icons')?.data as { icons?: CategoryIcons; colors?: CategoryColors } | undefined;
 const icons = saved?.icons ?? {}, colors = saved?.colors ?? {};
 const nameOf = (key: string) => categories.find(category => category.id === key)?.name || key;
 return {
  label: key => key === otherShareKey ? r.t('Other') : categories.find(category => category.id === key)?.name || r.t(key),
  icon: key => { const name = key === otherShareKey ? 'Other' : nameOf(key); return { emoji: chosenCategoryEmoji(name, icons, categories), hue: chosenCategoryHue(name, colors, categories) }; },
 };
}

/** Cash flow in the reporting currency over `months`, through the report's day. */
export function cashFlow(r: Report, months: string[]) {
 const data = { records: r.ledger.records, activity: r.ledger.activity, investmentLinks: r.ledger.links, categories: (r.tables.transaction_categories ?? []) as unknown as Category[] };
 return cashFlowReport(data, r.ledger.splits, months, r.reporting, r.today, marketRates(r.market));
}
export type Flow = ReturnType<typeof cashFlow>;

/** The first page's heading: the report's name, the period and when it was made. */
export function coverBlocks(r: Report, title: string, generated: string) {
 const { t } = r;
 r.push({ kind: 'cover', text: title, brand: 'Hoggish', lines: [
  `${t('Reporting period')}: ${r.date(r.start)} – ${r.date(r.today)} · ${t(r.today === r.end ? 'Full month' : 'Month to date')}`,
  `${t('Reporting currency')}: ${r.reporting} · ${t('Generated')}: ${generated}`,
 ] });
}

function keyTiles(r: Report, month: Flow): ReportTile[] {
 const { t, na, reporting } = r, unknown = month.missing > 0, total = r.consolidated;
 const net = total && !total.excluded.length ? total.net : null;
 const rateNote = t('Exchange rate unavailable.');
 const tone = (value: number | null, negativeOnly = false) => signTone(value, negativeOnly) ?? 'plain';
 return [
  { label: t('Net worth'), value: r.money(net, reporting), tone: tone(net, true), ...(net === null ? { detail: rateNote } : {}) },
  { label: t('Income'), value: unknown ? na : r.money(month.income, reporting), tone: unknown ? 'plain' : tone(month.income), ...(unknown ? { detail: rateNote } : {}) },
  { label: t('Spending'), value: unknown ? na : r.money(month.expenses, reporting), tone: 'plain' },
  { label: t('Savings rate'), value: unknown || month.savingsRate === null ? na : plain(formatPercent(month.savingsRate, r.locale, 0)), tone: unknown ? 'plain' : tone(month.savings), ...(unknown ? {} : { detail: plain(formatSignedMoney(month.savings, reporting, r.locale)) }) },
 ];
}

/** A Sankey of the period's cash flow, or a note when an amount could not be converted (never a figure that is too low). */
function sankeyBlock(r: Report, flow: Flow, title: string, looks: Looks) {
 if (flow.missing > 0) { r.add('subheading', title); r.add('text', r.t('Exchange rate unavailable.')); return; }
 const flows = sankeyFlows(flow, looks.label);
 if (!flows.links.length) return;
 const nodes = flows.nodes.map((node, index) => {
  const amount = sankeyNodeValue(flows, index);
  const icon = node.kind === 'total' ? undefined : node.kind === 'savings' ? savingsIcon : looks.icon(node.key ?? (node.kind === 'income' ? 'Other income' : 'Other expense'));
  // The merged rest is "Other", never a second node under a category's own name such as Other expense.
  return { label: node.keys && !node.key && node.kind !== 'total' ? r.t('Other') : node.name, value: r.money(amount, r.reporting), amount, kind: node.kind, icon };
 });
 r.push({ kind: 'sankey', text: title, nodes, links: flows.links });
}

/** Round axis steps (1, 2, 2.5 or 5 times a power of ten) reaching past the largest bar, three or four of them. */
export function axisTicks(max: number) {
 if (!(max > 0)) return [];
 const rough = max / 3, power = 10 ** Math.floor(Math.log10(rough));
 const step = [1, 2, 2.5, 5, 10].map(factor => factor * power).find(value => value >= rough)!;
 return Array.from({ length: Math.ceil(max / step) + 1 }, (_, index) => index * step);
}

function barsBlock(r: Report, flow: Flow, title: string) {
 const bars: ReportBar[] = flow.series.map(item => ({ label: formatMonthShort(item.month, r.locale), income: item.missing ? null : item.income, spending: item.missing ? null : item.expenses }));
 const ticks = axisTicks(Math.max(0, ...bars.flatMap(bar => [bar.income ?? 0, bar.spending ?? 0])));
 if (!ticks.length) return;
 r.push({ kind: 'bars', text: title, legend: [r.t('Income'), r.t('Spending')], bars, ticks: ticks.map(value => ({ value, label: plain(formatCompactMoney(value, r.reporting, r.locale)) })), ...(bars.some(bar => bar.income === null) ? { missing: r.t('Exchange rate unavailable.') } : {}) });
}

const shareRows = (r: Report, items: readonly Share[], label: (key: string) => string, icon: (key: string) => ReportIcon): ReportShare[] =>
 items.map(item => ({ label: label(item.key), value: r.money(item.amount, r.reporting), share: plain(formatPercent(item.share * 100, r.locale, 0)), fraction: item.share, icon: icon(item.key) }));

/** What the assets are made of, by kind, in the reporting currency; a note when one cannot be converted. */
function allocationBlock(r: Report, looks: Looks) {
 const title = r.t('Asset allocation'), rates = marketRates(r.market), byKind = new Map<string, number>();
 for (const item of r.wealth.filter(w => assets.includes(w.record.kind) && w.amount !== null && w.amount > 0)) {
  const amount = convertAmount(item.amount!, item.record.currency, r.reporting, rates);
  if (amount === null) { r.add('subheading', title); r.add('text', r.t('Exchange rate unavailable.')); return; }
  byKind.set(item.record.kind, (byKind.get(item.record.kind) ?? 0) + amount);
 }
 const total = [...byKind.values()].reduce((sum, value) => sum + value, 0);
 if (!(total > 0)) return;
 const shares = [...byKind].map(([key, amount]) => ({ key, amount, share: amount / total })).sort((a, b) => b.amount - a.amount);
 r.push({ kind: 'shares', text: title, stacked: true, rows: shareRows(r, topShares(shares, 8), looks.label, looks.icon) });
}

/** Key figures and charts, before the detailed tables. */
export function summaryBlocks(r: Report, afterTiles?: () => void) {
 const looks = categoryLooks(r), year = trendMonths(r.month, 'month'), last12 = r.t('Last 12 months');
 const month = cashFlow(r, [r.month]), annual = cashFlow(r, year);
 r.push({ kind: 'tiles', text: '', tiles: keyTiles(r, month) });
 r.add('text', r.t('Actuals: recorded so far this month. Budgets: full month. Plans and forecasts are not payments.'));
 afterTiles?.();
 sankeyBlock(r, month, `${r.t('Where your money went')} · ${formatMonthYear(r.month, r.locale)}`, looks);
 barsBlock(r, annual, `${r.t('Income and spending')} · ${last12}`);
 sankeyBlock(r, annual, `${r.t('Where your money went')} · ${last12}`, looks);
 const spending = topShares(annual.categories.expense, 7);
 if (spending.length && !annual.missing) r.push({ kind: 'shares', text: `${r.t('Spending by category')} · ${last12}`, rows: shareRows(r, spending, looks.label, looks.icon) });
 allocationBlock(r, looks);
}
