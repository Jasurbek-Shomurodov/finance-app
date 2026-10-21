"use client";
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { signTone } from '@/components/presentation-foundation/tone';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import type { HypotheticalNetWorth } from '@/lib/hypothetical-net-worth';
import type { CSSProperties } from 'react';

type Series = { key: string; label: string; color: string };

/** With expenses funding the benchmarks: today's net worth beside what it would be had that money gone into each benchmark. */
export function HypotheticalNetWorthCards({ netWorth, rows, series, currency }: { netWorth: number; rows: HypotheticalNetWorth[]; series: Series[]; currency: string }) {
 const { t, locale } = useLanguage();
 if (!rows.length) return null;
 const best = Math.max(...rows.map(row => row.netWorth));
 return <section className="what-if" aria-labelledby="what-if-title">
  <h4 id="what-if-title">{t('Net worth if spending had been invested')}<InfoHint>{t('Your net worth today with your investments and every recorded expense put into each benchmark instead. Spending adds nothing to your net worth, so the difference is what it cost.')}</InfoHint></h4>
  <div className="what-if-grid">
   <article className="what-if-card what-if-actual"><span><i style={{ background: 'var(--primary)' }}/>{t('Net worth')}</span><strong>{formatMoney(netWorth, currency, locale)}</strong></article>
   {rows.map(row => {
    const item = series.find(entry => entry.key === row.key);
    if (!item) return null;
    return <article key={row.key} className="what-if-card" data-best={row.netWorth === best && row.difference > 0 || undefined} style={{ '--what-if-color': item.color } as CSSProperties}>
     <span><i/>{item.label}</span>
     <strong>{formatMoney(row.netWorth, currency, locale)}</strong>
     <em className={signTone(row.difference)}>{t('{amount} vs today', { amount: formatSignedMoney(row.difference, currency, locale) })}</em>
    </article>;
   })}
  </div>
 </section>;
}
