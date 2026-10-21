"use client";
import { useLanguage } from '@/components/language-provider';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import type { useMonthBudget } from '@/components/dashboard-cards';
import { depositToday } from '@/lib/deposit-interest';
import { formatMoney, formatNumber } from '@/lib/format';
import { marketRates, type MarketData } from '@/lib/market';
import { dueSoon } from '@/lib/overview';
import type { PlanningData } from '@/lib/planning';

/** The dashboard's first line: net worth, this month's spending and budget, and what falls due within a week, each a
 * link to the page behind it. The budget figures are the Budget card's own (useMonthBudget), worked out once. */
export function DashboardHeadline({ netWorth, budget, data, currency, market }: { netWorth: number | null; budget: ReturnType<typeof useMonthBudget>; /** Null until the planning read is in. */data: PlanningData | null; currency: string; market: MarketData | null }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const due = data ? dueSoon(data, depositToday(), 7, currency, marketRates(market)) : null;
 const left = budget.plan === null || !(budget.plan > 0) ? null : budget.plan - budget.spent;
 return <StatTiles columns={4} label={t('Overview')}>
  <StatTile label={t('Net worth')} value={netWorth === null ? '—' : money(netWorth)} href="/assets"/>
  <StatTile label={t('Spent this month')} value={budget.loading ? '—' : money(budget.spent)} href="/transactions"/>
  {/* The figure alone, so it fits the tile; whether it is left or over is in the label. */}
  <StatTile label={t(left !== null && left < 0 ? 'Over budget' : 'Budget left')} value={budget.loading || left === null ? '—' : money(Math.abs(left))} tone={budget.loading || left === null ? undefined : signTone(left)} href="/budget"/>
  <StatTile label={t('Due in 7 days')} value={due?.total == null ? '—' : money(due.total)} href="/upcoming" aside={due && t('{count} due soon', { count: formatNumber(due.count, locale, 0) })}/>
 </StatTiles>;
}
