"use client";
import { useMemo } from 'react';
import { useLanguage } from '@/components/language-provider';
import { StatTile } from '@/components/presentation-foundation/stat-tile';
import { ageOfMoneyTrend } from '@/lib/age-of-money';
import type { Entry } from '@/lib/finance';
import { formatNumber } from '@/lib/format';

/** Age of Money: how many days money sits in cash accounts before it is spent, and its change over 30 days. `records` is the
 * income and spending history up to today, never the months a page shows; `accounts` holds the cash accounts it moves through. */
export function AgeOfMoneyTile({ records, accounts, currency, today, rates }: { records: Entry[]; accounts: readonly Entry[]; currency: string; today: string; rates?: number | Record<string, number> }) {
 const { t, locale } = useLanguage();
 const age = useMemo(() => ageOfMoneyTrend(records, currency, today, rates, new Set(accounts.filter(record => record.kind === 'Cash').map(record => record.id))), [records, accounts, currency, today, rates]);
 const days = (count: number) => count === 1 ? t('1 day') : t('{count} days', { count: formatNumber(count, locale, 0) });
 const change = age.change === null ? null : age.change === 0 ? t('No change vs 30 days ago') : t('{change} vs 30 days ago', { change: (age.change > 0 ? '+' : '\u2212') + days(Math.abs(age.change)) });
 return <StatTile label={t('Age of Money')} value={age.days === null ? '—' : days(Math.round(age.days))} hint={<>
  {t('How long money waits before you spend it: the average age of the money behind your last 10 expenses. Income is matched to spending in the order it arrived, across your cash accounts. A higher number means more of a buffer.')}
  {age.skipped > 0 && <> {t('Records without an exchange rate to {currency} are left out: {count}.', { currency, count: formatNumber(age.skipped, locale, 0) })}</>}
 </>}>{change && <p>{change}</p>}</StatTile>;
}
