"use client";
import { useMemo, useState } from 'react';
import { LineChart } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { PerformanceSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { PerformanceBreakdown } from '@/components/performance/performance-breakdown';
import { PerformanceCharts } from '@/components/performance/performance-charts-lazy';
import { PerformanceSummary } from '@/components/performance/performance-summary';
import { PropertyYields } from '@/components/performance/property-yields';
import { RealizedGains } from '@/components/performance/realized-gains';
import type { PortfolioHistory } from '@/hooks/use-portfolio-history';
import { depositToday } from '@/lib/deposit-interest';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { propertyYields } from '@/lib/investment-insights';
import { historyPnl, pnlPeriodStart, pnlPeriods, type DatedRate, type PnlPeriod } from '@/lib/investment-pnl';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { investmentReturns, monthlyResults, runningTotal } from '@/lib/investment-returns';
import { PnlHoldingBars, PnlTrendChart } from '@/components/charts-lazy';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { convertAmount, marketRates, type MarketData } from '@/lib/market';

const periodLabels: Record<PnlPeriod, string> = { year: 'This year', months: 'Last 12 months', all: 'All history' };

type Props = {
 history: PortfolioHistory | null; error: boolean; onRetry: () => void;
 /** Each past day's rate, once loaded; amounts convert at today's rate until then. */ rate?: DatedRate;
 currency: string; market: MarketData | null; accounts: readonly HoldingAccount[];
};

/** Investments › Profit & loss: what the holdings earned and how, read from the same history as the Overview chart.
 * What they are expected to pay next, and the price alerts, are the Payouts & alerts tab (`PayoutsAlertsView`). */
export function PerformanceView({ history, error, onRetry, rate, currency, market, accounts }: Props) {
 const { t } = useLanguage();
 const today = depositToday();
 const [period, setPeriod] = useState<PnlPeriod>('all');
 // Everything recorded, for what does not follow the period: the sales of each year, a property's last twelve months.
 const whole = useMemo(() => history ? historyPnl(history, { market, currency, today, rate }) : null, [history, market, currency, today, rate]);
 const pnl = useMemo(() => !history || period === 'all' ? whole : historyPnl(history, { market, currency, today, rate, start: pnlPeriodStart(period, today) }), [history, whole, period, market, currency, today, rate]);
 const returns = useMemo(() => {
  if (!pnl) return null;
  const rates = marketRates(market);
  return investmentReturns(pnl, today, (from, date) => from === currency ? 1 : rate?.(from, currency, date) ?? convertAmount(1, from, currency, rates));
 }, [pnl, market, currency, today, rate]);
 if (error) return <section className="panel"><InlineError message={t('Could not load portfolio history.')} onRetry={onRetry}/></section>;
 if (!history || !pnl || !whole || !returns) return <PerformanceSkeleton label={t('Loading history…')}/>;
 if (!pnl.holdings.length) return <section className="panel"><EmptyState icon={<LineChart size={26}/>} title={t('No performance yet')} description={t('Add an investment to see what it earns.')}/></section>;
 const yields = propertyYields(whole.holdings, whole.flows, today);
 return <div className="performance">
  <PerformanceSummary totals={pnl.totals} returns={returns} missing={pnl.missing} dated={!!rate} currency={currency}><Segmented label={t('Period')} options={pnlPeriods.map(value => ({ value, label: t(periodLabels[value]) }))} value={period} onChange={setPeriod}/></PerformanceSummary>
  <div className="performance-columns">
   <section className="panel"><PanelTitle title={t('Profit & loss over time')}/><PnlTrendChart points={runningTotal(returns.days)} currency={currency}/></section>
   <section className="panel"><PanelTitle title={t('Profit & loss by holding')}/><PnlHoldingBars rows={pnl.holdings} currency={currency}/></section>
  </div>
  <PerformanceCharts months={monthlyResults(returns.days, today)} days={returns.days} currency={currency}/>
  <PerformanceBreakdown holdings={pnl.holdings} records={history.records} accounts={accounts} currency={currency}/>
  <RealizedGains sales={whole.sales} currency={currency}/>
  {yields.length > 0 && <PropertyYields yields={yields} currency={currency}/>}
 </div>;
}
