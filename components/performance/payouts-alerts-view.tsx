"use client";
import { useLanguage } from '@/components/language-provider';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { PayoutsAlertsSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { BitcoinPanel } from '@/components/performance/bitcoin-panel';
import { PayoutCalendar } from '@/components/performance/payout-calendar';
import { PriceAlerts } from '@/components/performance/price-alerts';
import type { PortfolioHistory } from '@/hooks/use-portfolio-history';
import type { PreferenceResource } from '@/hooks/use-workspace-preferences';
import { addMonths } from '@/lib/calendar-days';
import { depositToday } from '@/lib/deposit-interest';
import { expectedPayouts, isBitcoin } from '@/lib/investment-insights';
import type { MarketData } from '@/lib/market';

type Props = { history: PortfolioHistory | null; error: boolean; onRetry: () => void; currency: string; market: MarketData | null; preferences: PreferenceResource; demo: boolean };

/** Investments › Payouts & alerts: what the holdings are about to do rather than what they earned. The dividends,
 * coupons and interest expected over the next twelve months beside the price alerts, then each Bitcoin holding's
 * buy prices with its plan for buying more. Read from the same history as Profit & loss. */
export function PayoutsAlertsView({ history, error, onRetry, currency, market, preferences, demo }: Props) {
 const { t } = useLanguage();
 const today = depositToday();
 if (error) return <section className="panel"><InlineError message={t('Could not load portfolio history.')} onRetry={onRetry}/></section>;
 if (!history) return <PayoutsAlertsSkeleton label={t('Loading history…')}/>;
 const payouts = expectedPayouts(history.records, history.events, today, addMonths(today, 12));
 return <div className="performance">
  <div className="performance-columns">
   <PayoutCalendar payouts={payouts} currency={currency} market={market}/>
   <PriceAlerts records={history.records} market={market} preferences={preferences} demo={demo}/>
  </div>
  {history.records.filter(isBitcoin).map(record => <BitcoinPanel key={record.id} record={record} movements={history.movements ?? []} market={market}/>)}
 </div>;
}
