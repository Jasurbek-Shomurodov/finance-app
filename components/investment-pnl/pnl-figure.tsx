"use client";
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { signTone } from '@/components/presentation-foundation/tone';
import { formatSignedMoney, formatSignedPercent } from '@/lib/format';
import type { InvestmentPnl, PnlTotals } from '@/lib/investment-pnl';

/** A result as one line: "+$1,200 · +12.4%", the percentage left out when nothing was put in. */
export function pnlText(totals: Pick<PnlTotals, 'total' | 'returnPercent'>, currency: string, locale: string) {
 const money = formatSignedMoney(totals.total, currency, locale);
 return totals.returnPercent === null ? money : `${money} · ${formatSignedPercent(totals.returnPercent, locale)}`;
}

/** The fact line of a holding or account card: what it earned since tracking began, in the display currency. */
export function pnlFact(totals: PnlTotals, currency: string, locale: string, t: (key: string) => string) {
 return { label: t('Profit & loss'), value: pnlText(totals, currency, locale), tone: signTone(totals.total) };
}

/** The portfolio's profit or loss beside its value: a tap opens the Profit & loss tab. "—" while the history loads,
 * with a note when it could not be read or some holdings have no rate. */
export function PortfolioPnl({ pnl, error, currency, onOpen }: { pnl: Pick<InvestmentPnl, 'holdings' | 'totals' | 'missing'> | null; error: boolean; currency: string; onOpen: () => void }) {
 const { t, locale } = useLanguage();
 const totals = pnl?.holdings.length ? pnl.totals : null;
 const Trend = totals && totals.total < 0 ? TrendingDown : TrendingUp;
 return <div className="portfolio-summary-pnl">
  <span>{t('Profit & loss')}</span>
  <strong className={signTone(totals?.total)}>{totals ? <RollingText text={formatSignedMoney(totals.total, currency, locale)}/> : '—'}</strong>
  {totals && totals.returnPercent !== null && <small className={'overview-delta ' + (signTone(totals.total) ?? '')}><Trend size={14} aria-hidden="true"/>{formatSignedPercent(totals.returnPercent, locale)}</small>}
  {error && <small>{t('Could not load portfolio history.')}</small>}
  {!error && !!pnl?.missing && <small>{t('Exchange rate unavailable.')}</small>}
  <button type="button" className="panel-link" aria-label={`${t('Profit & loss')}: ${t('View all')}`} onClick={onOpen}>{t('View all')}</button>
 </div>;
}
