import { financialTotals, type Entry } from './finance';
import { investmentValueChange } from './investment-portfolio';
import { changePercent } from './overview';
import type { HistoryEvent } from './investment-history';
import { portfolioHistory, portfolioWindow } from './portfolio-history';
import { mergePortfolioPoints } from './portfolio-snapshots';
import { shiftDay } from './calendar-days';

type History = { records: Entry[]; events: HistoryEvent[] } | null;

/** Net worth day by day: the recorded history up to today, ending on today's figure from the records themselves.
 * The dashboard's headline and its net worth card read the same points. */
export function netWorthPoints(history: History, entries: Entry[], currency: string, rates: number | Record<string, number> | undefined, today: string) {
 const { totalAssets, totalDebt } = financialTotals(entries);
 const net = totalAssets - totalDebt;
 const recorded = portfolioHistory(history?.records ?? [], history?.events ?? [], currency, rates, today, true);
 return { net, missing: recorded.missing, points: mergePortfolioPoints(recorded.points, [], { date: today, assets: totalAssets, debt: totalDebt, net }) };
}

/** How net worth moved over the last year, or over the whole history when it is shorter. `change` is null while any
 * point in the window is partial (a holding without history), so a part-figure is never shown as the change. */
export function netWorthTrend(points: ReturnType<typeof netWorthPoints>['points'], net: number, today: string, origin?: string | null) {
 const visible = portfolioWindow(points, 365, today, origin);
 const change = visible.some(point => point.partial) ? null : investmentValueChange(visible.map(point => point.net));
 // A year of history gives a year-long window starting exactly 365 days ago; anything later started later.
 const fullYear = visible[0]?.date === shiftDay(today, -365);
 return { values: visible.map(point => point.net), change, percent: changePercent(net, change), fullYear };
}
