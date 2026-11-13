"use client";
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import { formatMoney, formatPercent, formatSignedMoney } from '@/lib/format';
import type { PnlTotals } from '@/lib/investment-pnl';
import type { InvestmentReturns } from '@/lib/investment-returns';

/** A signed percentage: "+12.4%", "−3%". */
export function signedPercent(value: number | null, locale: string) {
 if (value === null || !Number.isFinite(value)) return '—';
 return (value > 0 ? '+' : '') + formatPercent(value, locale, 1);
}

/** The headline: total profit or loss, the five lines it is made of, and the three ways to read the return. */
export function PerformanceSummary({ totals, returns, missing, dated, currency }: { totals: PnlTotals; returns: InvestmentReturns; missing: number; /** Past days convert at their own rate, so the currency line means something. */ dated: boolean; currency: string }) {
 const { t, locale } = useLanguage();
 const signed = (amount: number) => formatSignedMoney(amount, currency, locale);
 const Trend = totals.total < 0 ? TrendingDown : TrendingUp;
 const lines: { label: string; amount: number; hint: string }[] = [
  { label: 'Unrealized', amount: totals.unrealized, hint: 'What you would gain or lose if you sold everything at today\'s prices.' },
  { label: 'Realized', amount: totals.realized, hint: 'Gains and losses locked in by sales, against the average cost of what was sold.' },
  { label: 'Income', amount: totals.income, hint: 'Dividends, coupons, interest and rent, including transactions linked to a property or business.' },
  { label: 'Costs', amount: -totals.costs, hint: 'Repairs, fees and other expenses, including transactions linked to a property or business.' },
  ...(dated ? [{ label: 'Currency effect', amount: totals.currencyEffect, hint: 'What exchange rates added or took away since each payment was made. The other lines are at today\'s rate.' }] : []),
 ];
 return <section className="panel performance-hero" aria-labelledby="performance-total">
  <header className="performance-hero-head">
   <div>
    <h2 id="performance-total">{t('Profit and loss')}<InfoHint>{t('Everything your investments earned since you started tracking them: the change in their value, sales, income and costs.')}</InfoHint></h2>
    <strong className={'performance-hero-figure ' + (signTone(totals.total) ?? '')}><RollingText text={signed(totals.total)}/></strong>
    <p><span className={'overview-delta ' + (signTone(totals.total) ?? '')}><Trend size={15} aria-hidden="true"/>{signedPercent(totals.returnPercent, locale)}</span><span>{t('on {amount} invested', { amount: formatMoney(totals.invested, currency, locale) })}</span></p>
   </div>
   <dl className="performance-hero-value"><div><dt>{t('Value today')}</dt><dd>{formatMoney(totals.value, currency, locale)}</dd></div></dl>
  </header>
  <ul className="performance-lines" aria-label={t('Profit and loss')}>
   {lines.map(line => <li key={line.label}><span>{t(line.label)}<InfoHint>{t(line.hint)}</InfoHint></span><strong className={signTone(line.amount)}>{signed(line.amount)}</strong></li>)}
  </ul>
  {missing > 0 && <p className="muted performance-note">{t('Exchange rate unavailable.')} {t('Some holdings or payments are left out of these figures.')}</p>}
  <StatTiles label={t('Returns')} columns="auto">
   <StatTile label={t('Simple return')} value={signedPercent(totals.returnPercent, locale)} tone={signTone(totals.returnPercent)} hint={t('Profit and loss as a share of all the money you put in.')}/>
   <StatTile label={t('Time-weighted return')} value={signedPercent(returns.timeWeighted, locale)} tone={signTone(returns.timeWeighted)} hint={t('How the holdings themselves performed, whatever you added or withdrew, and when. Use it to compare with a benchmark.')}/>
   <StatTile label={t('Money-weighted return')} value={returns.moneyWeighted === null ? '—' : t('{percent} a year', { percent: signedPercent(returns.moneyWeighted, locale) })} tone={signTone(returns.moneyWeighted)} hint={t('The yearly rate your own money earned, given when each amount went in or came out (XIRR). Shown after 30 days of history.')}/>
   <StatTile label={t('Largest drawdown')} value={returns.maxDrawdown === null ? '—' : formatPercent(returns.maxDrawdown, locale, 1)} tone={signTone(returns.maxDrawdown, true)} hint={t('The deepest fall from a peak so far.')}/>
  </StatTiles>
 </section>;
}
