"use client";
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { demoHistory } from '@/lib/demo-finance';
import { InvestmentPeriodSummary, type PeriodOpener } from '@/components/investment-period-summary';
import { InvestmentComparison } from '@/components/investment-comparison';
import { PartialTotal } from '@/components/presentation-foundation/partial-total';
import { IncomeHistoryChart } from '@/components/charts-lazy';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { signTone } from '@/components/presentation-foundation/tone';
import type { PeriodGrowth } from '@/lib/period-growth';
import { Maximize2, Minimize2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFullscreenCard } from '@/hooks/use-fullscreen-card';
import { changePercent } from '@/lib/overview';
import { useLanguage } from '@/components/language-provider';
import { NetWorthBodySkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { financialTotals, type Entry } from '@/lib/finance';
import { formatMoney, formatNumber, formatPercent, formatSignedMoney } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import { mergePortfolioPoints } from '@/lib/portfolio-snapshots';
import { chartDay, currentParts, joinedToday, periodChange, portfolioHistory, portfolioWindow, trackingWindowStart } from '@/lib/portfolio-history';
import { pricesByRecord } from '@/lib/holding-prices';
import { netWorthBalances } from '@/lib/cash-ledger';
import { historyFx } from '@/lib/history-rates';
import { useComparisonProfile } from '@/hooks/use-comparison-profile';
import { type MarketData, marketRates } from '@/lib/market';
import type { PortfolioHistory } from '@/hooks/use-portfolio-history';

/** One empty history for every render, so the comparison's memos keyed on it hold until the real one loads. */
const noHistory: PortfolioHistory = { records: [], events: [] };
/** `savedHistory` is the screen's read (`usePortfolioHistory`), started before this card mounts; the sample workspace builds its own. */
export function PortfolioOverview({ entries, excludedCurrencies = [], demoRecords, currency, market, demo, savedHistory, historyError: error, onHistoryRetry, onAddIncome, board, categories, holdings, businesses, opener }: { /** The workspace's own categories and records, naming a detail line's category and business; `businesses` says it has any. */ categories?: readonly { id: string; name: string }[]; holdings?: readonly { id: string; name: string }[]; businesses?: boolean; /** Opens what a detail line came from. */ opener?: PeriodOpener; savedHistory: PortfolioHistory | null; historyError: boolean; onHistoryRetry: () => void; board: (cards: { netWorth: ReactNode; income: ReactNode }) => ReactNode; onAddIncome?: () => void; demoRecords?: Entry[]; excludedCurrencies?:string[]; entries: Entry[]; currency: string; market: MarketData | null; demo: boolean }) {
 const { t, locale } = useLanguage();
 const [range, setRange] = useState<number | null>(null);
 // Counts period choices: in full screen choosing a period zooms the chart to it, even the one already chosen.
 const [periodPick, setPeriodPick] = useState(0);
 // In full screen a drag or zoom leaves the chosen period, so no period button looks chosen until one is pressed again;
 // the headline and the summary keep following the chosen period. -1 matches no button.
 const [movedAway, setMovedAway] = useState(false);
 const markMoved = useCallback(() => setMovedAway(true), []);
 const [growth, setGrowth] = useState<PeriodGrowth | null>(null);
 const comparison = useComparisonProfile(demo);
 const { ref: cardRef, open: filling, toggle: toggleFullscreen, chartHeight } = useFullscreenCard<HTMLElement>();
 const shownRange = filling && movedAway ? -1 : range;
 // The read names its day; the chart ends on that day unless the browser is already on a later one (`chartDay`).
 const today = chartDay(depositToday(), demo ? null : savedHistory?.today);
 const history: PortfolioHistory | null = useMemo(() => demo ? demoHistory(demoRecords ?? [], today) : savedHistory, [demo, demoRecords, today, savedHistory]);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const {totalAssets:assetTotal,totalDebt:debt}=financialTotals(entries);
 const rates = marketRates(market);
 // Each day shows what had happened by then: a cash account is its balance today walked back through its dated
 // changes, and any other change entered late counts from its own date.
 const balances = useMemo(() => netWorthBalances(history ?? noHistory, today), [history, today]);
 // Each past day converts at its own day's rates and today at the live ones; the comparison reads the same series.
 const fx = useMemo(() => historyFx(history?.fx, rates, today), [history, rates, today]);
 const recorded = useMemo(() => portfolioHistory(history?.records ?? noHistory.records, balances.events, { currency, rates, today, includePartial: true, moves: balances.moves, prices: pricesByRecord(history?.records ?? noHistory.records, history?.prices), fx }), [history, balances, currency, rates, today, fx]);
 const portfolioValue = assetTotal - debt;
 // Today's point carries its own breakdown by kind, so the chart can say what moved net worth since the last recorded day.
 // It also says what it counts for the first time (a holding added today), which the period's change leaves out.
 const points = useMemo(() => mergePortfolioPoints(recorded.points, [], {date:today,assets:assetTotal,debt,net:portfolioValue,parts:currentParts(entries),joined:joinedToday(recorded,today,entries)}), [recorded, today, assetTotal, debt, portfolioValue, entries]);
 const windowStart = trackingWindowStart(range, today, comparison.trackingStart);
 const visible = portfolioWindow(points, range, today, comparison.trackingStart);
 const tracked = useMemo(() => portfolioWindow(points, null, today, comparison.trackingStart), [points, today, comparison.trackingStart]);
 // A holding whose history begins inside the period was owned before its first record: the change leaves its arrival
 // out and counts it from its first recorded value, and the headline says so behind its ⓘ.
 const { change, joined } = periodChange(visible);
 const newlyCounted = Math.abs(joined) >= .5;
 const loading = !demo && !history && !error;
 const percent = changePercent(portfolioValue, change);
 const Trend = change !== null && change < 0 ? TrendingDown : TrendingUp;
 // Net worth and income over time are cards of the dashboard board, which places them wherever the person dragged them.
 const netWorth = <section ref={cardRef} data-fullscreen={filling || undefined} className="panel portfolio-trend overview-hero" aria-labelledby="overview-net-worth">
   <header className="overview-hero-head">
    <div className="overview-hero-value">
     <h2 id="overview-net-worth">{t('Net worth over time')}</h2>
     {/* Today's figure leads the card; the tiles beside it are this month's. */}
     <strong className="overview-hero-figure"><RollingText text={money(portfolioValue)}/></strong>
     {!loading && !error && change !== null && <p><span className={change >= 0 ? 'overview-delta positive' : 'overview-delta negative'}><Trend size={15} aria-hidden="true"/>{change > 0 ? '+' : ''}{money(change)}{percent !== null && <> · {percent > 0 ? '+' : ''}{formatPercent(percent, locale)}</>}</span><span>{t('Change in selected period')}</span>{newlyCounted && <InfoHint>{t('Holdings first recorded in this period count from their first recorded value, so adding one is not shown as a gain or a loss.')}</InfoHint>}</p>}
     {/* The change in two parts: what the investments earned, and the rest, which came from the person's own money. */}
     {!loading && !error && change !== null && !newlyCounted && growth && <p className="overview-change-split"><span><i className="returns" aria-hidden="true"/>{t('Investment returns')} <b className={signTone(growth.returns)}>{formatSignedMoney(growth.returns, currency, locale)}</b></span><span><i aria-hidden="true"/>{t('Your own money')} <b className={signTone(change - growth.returns)}>{formatSignedMoney(change - growth.returns, currency, locale)}</b></span><InfoHint>{t('Investment returns are what your investments earned beyond the money put into them. Your own money is the rest of the change: income you kept after spending and debts you paid off. In this period you put {amount} of your own money into investments.', { amount: money(Math.max(0, growth.invested)) })}</InfoHint></p>}
     <PartialTotal currencies={excludedCurrencies}/>
    </div>
    <div className="overview-hero-tools">
     <Segmented label={t('History period')} options={[30, 90, 365, null].map(days => ({ value: days, label: days === null ? t('All history') : t('{days} days', { days: formatNumber(days, locale, 0) }) }))} value={shownRange} onChange={days => { setRange(days); setPeriodPick(pick => pick + 1); setMovedAway(false); }}/>
     {/* The card fills the window and comes back; the period, the lines shown and an open day all stay as they were. */}
     <Button type="button" variant="outline" size="icon" aria-pressed={filling} aria-label={t(filling ? 'Exit full screen' : 'Open in full screen')} title={t(filling ? 'Exit full screen' : 'Open in full screen')} onClick={() => { setMovedAway(false); toggleFullscreen(); }}>{filling ? <Minimize2 aria-hidden="true"/> : <Maximize2 aria-hidden="true"/>}</Button>
    </div>
   </header>
   {loading ? <NetWorthBodySkeleton label={t('Loading history…')}/> : error ? <InlineError message={t('Could not load portfolio history.')} onRetry={onHistoryRetry}/> : <>
    <InvestmentComparison fx={fx} allPoints={tracked} periodPick={periodPick} onViewMove={markMoved} chartHeight={chartHeight} history={history??noHistory} today={today} currency={currency} market={market} demo={demo} windowStart={windowStart} points={visible} profile={comparison.profile} profileError={comparison.error} trackingStart={comparison.trackingStart} onTrackingStartChange={comparison.saveTrackingStart} onGrowth={setGrowth} summary={(fx,scope)=><InvestmentPeriodSummary scope={scope} opener={opener} input={{records:history?.records??noHistory.records,events:history?.events??noHistory.events,cashflows:history?.cashflows,movements:history?.movements,market,currency,today,fx,categories,holdings,businesses}} start={windowStart}/>}/>
    {recorded.missing > 0 && <p className="muted overview-hero-note">{t('Some holdings have no recorded history yet.')}</p>}
    {excludedCurrencies.length > 0 && <p className="muted overview-hero-note">{t('Some currencies could not be converted and are excluded from totals.')}</p>}
   </>}
  </section>;
 return board({ netWorth, income: !loading && !error && <IncomeHistoryChart records={history?.records??[]} events={history?.events??[]} incomeRecords={history?.incomeRecords??[]} currency={currency} rates={marketRates(market)} today={today} onAddIncome={onAddIncome}/> });
}
