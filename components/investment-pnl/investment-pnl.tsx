"use client";
import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { PnlHoldingBars, PnlTrendChart } from '@/components/charts-lazy';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Count } from '@/components/presentation-foundation/count';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import type { PortfolioHistory } from '@/hooks/use-portfolio-history';
import { formatMoney, formatPercent, formatSignedMoney } from '@/lib/format';
import { pnlPeriodStart, pnlPeriods, portfolioPnl, type PnlPeriod } from '@/lib/investment-pnl';
import type { MarketData } from '@/lib/market';

const periodLabels: Record<PnlPeriod, string> = { year: 'This year', months: 'Last 12 months', all: 'All history' };

/** Investments' Profit & loss view: what the holdings earned in the chosen period (price change, income, costs),
 * the running total over time, and every holding's own line. `history` is the Tracker history the Overview reads;
 * null while it loads. */
export function InvestmentPnl({ history, error, onRetry, currency, market, today }: { history: PortfolioHistory | null; error: boolean; onRetry: () => void; currency: string; market: MarketData | null; today: string }) {
 const { t, locale } = useLanguage();
 const [period, setPeriod] = useState<PnlPeriod>('year');
 const pnl = useMemo(() => history && portfolioPnl({ records: history.records, events: history.events, movements: history.movements, market, currency, today }, pnlPeriodStart(period, today)), [history, market, currency, today, period]);
 if (error) return <section className="panel"><InlineError message={t('Could not load portfolio history.')} onRetry={onRetry}/></section>;
 if (!pnl) return <PanelSkeleton label={t('Loading history…')}/>;
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const signed = (amount: number) => formatSignedMoney(amount, currency, locale);
 const percent = (value: number | null) => value === null ? '—' : (value > 0 ? '+' : '') + formatPercent(value, locale);
 const { totals, rows } = pnl;
 const periods = <Segmented label={t('Period')} options={pnlPeriods.map(value => ({ value, label: t(periodLabels[value]) }))} value={period} onChange={setPeriod}/>;
 if (!rows.length) return <section className="panel pnl-summary"><PanelTitle title={t('Profit & loss')}>{periods}</PanelTitle>
  {pnl.missing.length ? <p className="muted">{t('Some investment balances or exchange rates are missing.')}</p> : <EmptyState icon={<TrendingUp size={26}/>} description={t('Add your first asset to start building your portfolio.')}/>}
 </section>;
 return <>
  <section className="panel pnl-summary">
   <PanelTitle title={t('Profit & loss')} hint={t('Price change is what your holdings gained or lost in value beyond the money you put in and took out. Income and expenses come from each holding’s Tracker. Amounts in other currencies use today’s exchange rate.')}>{periods}</PanelTitle>
   <StatTiles columns="auto" label={t('Profit & loss')}>
    <StatTile label={t('Gain/loss')} value={signed(totals.total)} tone={signTone(totals.total)}>{totals.returnPercent !== null && <p>{t('Return')} {percent(totals.returnPercent)}</p>}</StatTile>
    <StatTile label={t('Price change')} value={signed(totals.price)} tone={signTone(totals.price)}>{totals.realized !== 0 && <p>{t('Realized on sales')} {signed(totals.realized)}</p>}</StatTile>
    <StatTile label={t('Income received')} value={money(totals.income)} tone={totals.income > 0 ? 'positive' : undefined}/>
    <StatTile label={t('Expenses paid')} value={money(totals.costs)}/>
   </StatTiles>
   {pnl.missing.length > 0 && <p className="muted">{t('Some investment balances or exchange rates are missing.')}</p>}
  </section>
  <div className="pnl-charts">
   <section className="panel"><PanelTitle title={t('Profit & loss over time')}/>{pnl.points.length > 1 ? <PnlTrendChart points={pnl.points} currency={currency}/> : <p className="muted">{t('No recorded activity in this interval.')}</p>}</section>
   <section className="panel"><PanelTitle title={t('Profit & loss by holding')}/><PnlHoldingBars rows={rows} currency={currency}/></section>
  </div>
  <section className="panel">
   <PanelTitle title={t('Holdings')} count={<Count value={rows.length}/>}/>
   <div className="table-scroll"><table className="pnl-table holding-pnl-table">
    <thead><tr><th scope="col">{t('Asset')}</th><th scope="col">{t('Money invested')}</th><th scope="col">{t('Current value')}</th><th scope="col">{t('Price change')}</th><th scope="col">{t('Income received')}</th><th scope="col">{t('Expenses paid')}</th><th scope="col">{t('Gain/loss')}</th><th scope="col">{t('Return')}</th></tr></thead>
    <tbody>
     {rows.map(row => <tr key={row.id}>
      <th scope="row"><div className="record-name"><CategoryIcon kind={row.kind}/><div><strong>{row.name}</strong><small>{t(row.kind)}</small></div></div></th>
      <td>{money(row.invested)}</td><td>{money(row.value)}</td><td className={signTone(row.price)}>{signed(row.price)}</td><td>{money(row.income)}</td><td>{money(row.costs)}</td>
      <td className={signTone(row.total)}>{signed(row.total)}</td><td className={signTone(row.returnPercent)}>{percent(row.returnPercent)}</td>
     </tr>)}
     <tr data-kind="total"><th scope="row">{t('Total')}</th><td>{money(totals.invested)}</td><td>{money(totals.value)}</td><td className={signTone(totals.price)}>{signed(totals.price)}</td><td>{money(totals.income)}</td><td>{money(totals.costs)}</td><td className={signTone(totals.total)}>{signed(totals.total)}</td><td className={signTone(totals.returnPercent)}>{percent(totals.returnPercent)}</td></tr>
    </tbody>
   </table></div>
  </section>
 </>;
}
