"use client";
import { useMemo } from 'react';
import { LineChart } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { BitcoinPanel } from '@/components/performance/bitcoin-panel';
import { PayoutCalendar } from '@/components/performance/payout-calendar';
import { PerformanceBreakdown } from '@/components/performance/performance-breakdown';
import { PerformanceCharts } from '@/components/performance/performance-charts-lazy';
import { PerformanceSummary } from '@/components/performance/performance-summary';
import { PriceAlerts } from '@/components/performance/price-alerts';
import { PropertyYields } from '@/components/performance/property-yields';
import { RealizedGains } from '@/components/performance/realized-gains';
import type { PortfolioHistory } from '@/hooks/use-portfolio-history';
import { useRateHistory } from '@/hooks/use-rate-history';
import type { PreferenceResource } from '@/hooks/use-workspace-preferences';
import { addMonths } from '@/lib/calendar-days';
import { depositToday } from '@/lib/deposit-interest';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { expectedPayouts, isBitcoin, propertyYields } from '@/lib/investment-insights';
import { investmentPnl } from '@/lib/investment-pnl';
import { investmentReturns, monthlyResults, runningTotal } from '@/lib/investment-returns';
import { PnlHoldingBars, PnlTrendChart } from '@/components/charts-lazy';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { convertAmount, marketRates, type MarketData } from '@/lib/market';

type Props = {
 history: PortfolioHistory | null; error: boolean; onRetry: () => void;
 currency: string; market: MarketData | null; accounts: readonly HoldingAccount[]; preferences: PreferenceResource; demo: boolean;
};

/** Investments › Profit & loss: what the holdings earned and how, read from the same history as the Overview chart. */
export function PerformanceView({ history, error, onRetry, currency, market, accounts, preferences, demo }: Props) {
 const { t } = useLanguage();
 const today = depositToday();
 const first = history?.events.reduce<string | null>((earliest, event) => !earliest || event.occurred_on < earliest ? event.occurred_on : earliest, null) ?? null;
 const rate = useRateHistory(first, today, demo);
 const pnl = useMemo(() => history ? investmentPnl({ records: history.records, events: history.events, cashflows: history.cashflows, market, currency, today, rate }) : null, [history, market, currency, today, rate]);
 const returns = useMemo(() => {
  if (!pnl) return null;
  const rates = marketRates(market);
  return investmentReturns(pnl, today, (from, date) => from === currency ? 1 : rate?.(from, currency, date) ?? convertAmount(1, from, currency, rates));
 }, [pnl, market, currency, today, rate]);
 const payouts = useMemo(() => history ? expectedPayouts(history.records, history.events, today, addMonths(today, 12)) : [], [history, today]);
 if (error) return <section className="panel"><InlineError message={t('Could not load portfolio history.')} onRetry={onRetry}/></section>;
 if (!history || !pnl || !returns) return <PanelSkeleton label={t('Loading history…')}/>;
 if (!pnl.holdings.length) return <section className="panel"><EmptyState icon={<LineChart size={26}/>} title={t('No performance yet')} description={t('Add an investment to see what it earns.')}/></section>;
 const yields = propertyYields(pnl.holdings, pnl.flows, today);
 const bitcoin = history.records.filter(isBitcoin);
 return <div className="performance">
  <PerformanceSummary totals={pnl.totals} returns={returns} missing={pnl.missing} dated={!!rate} currency={currency}/>
  <div className="performance-columns">
   <section className="panel"><PanelTitle title={t('Profit & loss over time')}/><PnlTrendChart points={runningTotal(returns.days)} currency={currency}/></section>
   <section className="panel"><PanelTitle title={t('Profit & loss by holding')}/><PnlHoldingBars rows={pnl.holdings} currency={currency}/></section>
  </div>
  <PerformanceCharts months={monthlyResults(returns.days, today)} days={returns.days} currency={currency}/>
  <PerformanceBreakdown holdings={pnl.holdings} records={history.records} accounts={accounts} currency={currency}/>
  <div className="performance-columns">
   <RealizedGains sales={pnl.sales} currency={currency}/>
   <PayoutCalendar payouts={payouts} currency={currency} market={market}/>
  </div>
  {yields.length > 0 && <PropertyYields yields={yields} currency={currency}/>}
  {bitcoin.map(record => <BitcoinPanel key={record.id} record={record} movements={history.movements ?? []} market={market}/>)}
  <PriceAlerts records={history.records} market={market} preferences={preferences} demo={demo}/>
 </div>;
}
