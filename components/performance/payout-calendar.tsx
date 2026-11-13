"use client";
import { CalendarClock } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { formatDate, formatMoney, formatMonthYear } from '@/lib/format';
import type { ExpectedPayout } from '@/lib/investment-insights';
import { marketRates, type MarketData } from '@/lib/market';
import { amountIn } from '@/lib/money';

/** Dividends, coupons and interest expected over the next twelve months: a line a month with its total, which opens its payouts. The cash forecast counts them too. */
export function PayoutCalendar({ payouts, currency, market }: { payouts: readonly ExpectedPayout[]; currency: string; market: MarketData | null }) {
 const { t, locale } = useLanguage();
 const { entered } = useDisplayMoney();
 const rates = marketRates(market);
 const months = new Map<string, ExpectedPayout[]>();
 for (const payout of payouts) months.set(payout.date.slice(0, 7), [...(months.get(payout.date.slice(0, 7)) ?? []), payout]);
 // A month's total adds payouts in several currencies, so it is in the display currency; one no rate converts leaves it unknown.
 const total = (items: readonly ExpectedPayout[]) => {
  const amounts = items.map(item => amountIn({ amount: item.amount, currency: item.currency }, currency, rates));
  return amounts.some(amount => amount === null) ? '—' : formatMoney(amounts.reduce<number>((sum, amount) => sum + amount!, 0), currency, locale);
 };
 return <section className="panel">
  <PanelTitle title={<>{t('Expected payouts')} {!!payouts.length && <span className="panel-figure">{total(payouts)}</span>}</>} hint={t('Dividends, coupons and interest your holdings are likely to pay in the next 12 months, from what each one paid before: the latest amount, at the same rhythm. They are estimates, and they are counted in the cash forecast.')}>
   <DrawerLink href="/income-expenses">{t('Cash forecast')}</DrawerLink>
  </PanelTitle>
  {payouts.length ? <div className="payout-months">{[...months].map(([month, items], index) => <details key={month} open={index === 0}>
   <summary><span>{formatMonthYear(month, locale)}</span><span>{total(items)}</span></summary>
   <ul className="perf-list">{items.map(item => <li key={item.key}><CategoryIcon kind={item.kind}/><span>{item.name}<small>{formatDate(item.date, locale)}</small></span><strong className="positive">+{entered(item.amount, item.currency)}</strong></li>)}</ul>
  </details>)}</div> : <EmptyState icon={<CalendarClock size={24}/>} description={t('No payouts expected yet. Record a dividend or coupon twice in a holding\'s Tracker and its next ones appear here.')}/>}
 </section>;
}
