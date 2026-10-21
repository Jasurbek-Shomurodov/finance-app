"use client";
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { demoHistory } from '@/lib/demo-finance';
import { InvestmentPeriodSummary } from '@/components/investment-period-summary';
import { InvestmentComparison } from '@/components/investment-comparison';
import { investmentValueChange } from '@/lib/investment-portfolio';
import { PartialTotal } from '@/components/presentation-foundation/partial-total';
import { IncomeHistoryChart } from '@/components/charts-lazy';
import { useMemo, useState, type ReactNode } from 'react';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { signTone } from '@/components/presentation-foundation/tone';
import type { PeriodGrowth } from '@/lib/period-growth';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { changePercent } from '@/lib/overview';
import { useLanguage } from '@/components/language-provider';
import { NetWorthBodySkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { financialTotals, type Entry } from '@/lib/finance';
import { formatMoney, formatNumber, formatPercent, formatSignedMoney } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import { mergePortfolioPoints, type PortfolioSnapshot } from '@/lib/portfolio-snapshots';
import { portfolioHistory, portfolioWindow, trackingWindowStart } from '@/lib/portfolio-history';
import { useComparisonProfile } from '@/hooks/use-comparison-profile';
import { type MarketData, marketRates } from '@/lib/market';
import type { PortfolioHistory } from '@/hooks/use-portfolio-history';

/** `savedHistory` is the screen's read (`usePortfolioHistory`), started before this card mounts; the sample workspace builds its own. */
export function PortfolioOverview({ entries, excludedCurrencies = [], demoRecords, currency, market, demo, savedHistory, historyError: error, onHistoryRetry, onAddIncome, board }: { savedHistory: PortfolioHistory | null; historyError: boolean; onHistoryRetry: () => void; board: (cards: { netWorth: ReactNode; income: ReactNode }) => ReactNode; onAddIncome?: () => void; demoRecords?: Entry[]; excludedCurrencies?:string[]; snapshots: PortfolioSnapshot[]; snapshotError: string; onSnapshotRetry: () => void; entries: Entry[]; currency: string; market: MarketData | null; demo: boolean }) {
 const { t, locale } = useLanguage();
 const [range, setRange] = useState<number | null>(null);
 const [growth, setGrowth] = useState<PeriodGrowth | null>(null);
 const comparison = useComparisonProfile(demo);
 const today = depositToday();
 const history: PortfolioHistory | null = useMemo(() => demo ? demoHistory(demoRecords ?? [], today) : savedHistory, [demo, demoRecords, today, savedHistory]);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const {totalAssets:assetTotal,totalDebt:debt}=financialTotals(entries);
 const allRecords = history?.records ?? [];
 const rates = marketRates(market);
 const recorded = portfolioHistory(allRecords, history?.events ?? [], currency, rates, today, true);
 const portfolioValue = assetTotal - debt;
 const points = mergePortfolioPoints(recorded.points, [], {date:today,assets:assetTotal,debt,net:portfolioValue});
 const windowStart = trackingWindowStart(range, today, comparison.trackingStart);
 const visible = portfolioWindow(points, range, today, comparison.trackingStart);
 const partialHistory = visible.some(point=>point.partial);
 const change = partialHistory ? null : investmentValueChange(visible.map(point=>point.net));
 const loading = !demo && !history && !error;
 const percent = changePercent(portfolioValue, change);
 const Trend = change !== null && change < 0 ? TrendingDown : TrendingUp;
 // Net worth and income over time are cards of the dashboard board, which places them wherever the person dragged them.
 const netWorth = <section className="panel portfolio-trend overview-hero" aria-labelledby="overview-net-worth">
   <header className="overview-hero-head">
    <div className="overview-hero-value">
     {/* The figure itself opens the dashboard in its headline row; this card is how it has moved. */}
     <h2 id="overview-net-worth">{t('Net worth over time')}</h2>
     {!loading && !error && change !== null && <p><span className={change >= 0 ? 'overview-delta positive' : 'overview-delta negative'}><Trend size={15} aria-hidden="true"/>{change > 0 ? '+' : ''}{money(change)}{percent !== null && <> · {percent > 0 ? '+' : ''}{formatPercent(percent, locale)}</>}</span><span>{t('Change in selected period')}</span></p>}
     {/* The change in two parts: what the investments earned, and the rest, which came from the person's own money. */}
     {!loading && !error && change !== null && growth && <p className="overview-change-split"><span>{t('Investment returns')} <b className={signTone(growth.returns)}>{formatSignedMoney(growth.returns, currency, locale)}</b></span><span>{t('Your own money')} <b className={signTone(change - growth.returns)}>{formatSignedMoney(change - growth.returns, currency, locale)}</b></span><InfoHint>{t('Investment returns are what your investments earned beyond the money put into them. Your own money is the rest of the change: income you kept after spending and debts you paid off. In this period you put {amount} of your own money into investments.', { amount: money(Math.max(0, growth.invested)) })}</InfoHint></p>}
     <PartialTotal currencies={excludedCurrencies}/>
    </div>
    <Segmented label={t('History period')} options={[30, 90, 365, null].map(days => ({ value: days, label: days === null ? t('All history') : t('{days} days', { days: formatNumber(days, locale, 0) }) }))} value={range} onChange={setRange}/>
   </header>
   {loading ? <NetWorthBodySkeleton label={t('Loading history…')}/> : error ? <InlineError message={t('Could not load portfolio history.')} onRetry={onHistoryRetry}/> : <>
    <InvestmentComparison history={history??{records:[],events:[]}} today={today} currency={currency} market={market} demo={demo} windowStart={windowStart} points={visible} profile={comparison.profile} profileError={comparison.error} trackingStart={comparison.trackingStart} onTrackingStartChange={comparison.saveTrackingStart} onGrowth={setGrowth} summary={fx=><InvestmentPeriodSummary input={{records:allRecords,events:history?.events??[],cashflows:history?.cashflows,movements:history?.movements,market,currency,today,fx}} start={windowStart}/>}/>
    {recorded.missing > 0 && <p className="muted overview-hero-note">{t('Some holdings have no recorded history yet.')}</p>}
    {excludedCurrencies.length > 0 && <p className="muted overview-hero-note">{t('Some currencies could not be converted and are excluded from totals.')}</p>}
   </>}
  </section>;
 return board({ netWorth, income: !loading && !error && <IncomeHistoryChart records={history?.records??[]} events={history?.events??[]} incomeRecords={history?.incomeRecords??[]} currency={currency} rates={marketRates(market)} today={today} onAddIncome={onAddIncome}/> });
}
