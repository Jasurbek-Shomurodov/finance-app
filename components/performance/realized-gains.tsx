"use client";
import { useState } from 'react';
import { Download, Receipt } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { signTone } from '@/components/presentation-foundation/tone';
import { Button } from '@/components/ui/button';
import { exportCSV } from '@/lib/csv';
import { formatDate, formatSignedMoney, formatYear } from '@/lib/format';
import { realizedExportColumns, realizedExportRows, realizedYears, type RealizedSale } from '@/lib/investment-pnl';

/** Gains and losses locked in by sales, year by year, with the year's rows as a file for a tax return. */
export function RealizedGains({ sales, currency }: { sales: readonly RealizedSale[]; currency: string }) {
 const { t, locale } = useLanguage();
 const { entered, enteredSigned } = useDisplayMoney();
 const years = realizedYears(sales);
 const [chosen, setChosen] = useState<string | null>(null);
 const year = chosen && years.includes(chosen) ? chosen : years[0];
 const shown = sales.filter(sale => sale.date.startsWith(year ?? '-')).reverse();
 const total = shown.reduce((sum, sale) => sum + sale.shownGain, 0);
 function download() {
  const url = URL.createObjectURL(new Blob(['﻿' + exportCSV(realizedExportRows(sales, year), realizedExportColumns)], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
  link.href = url; link.download = `realized-gains-${year}.csv`; document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
 }
 return <section className="panel">
  <PanelTitle title={<>{t('Realized gains')} {!!shown.length && <span className={'panel-figure ' + (signTone(total) ?? '')}>{formatSignedMoney(total, currency, locale)}</span>}</>} hint={t('Each sale against the average cost of what was sold, by calendar year. The file lists every sale in the holding\'s own currency. Check your own tax rules before filing.')}>
   {!!shown.length && <Button variant="outline" size="sm" onClick={download}><Download size={15} aria-hidden="true"/>{t('Download CSV')}</Button>}
  </PanelTitle>
  {years.length > 1 && <Segmented label={t('Year')} value={year} onChange={setChosen} options={years.slice(0, 5).map(value => ({ value, label: formatYear(Number(value), locale) }))}/>}
  {shown.length ? <ul className="perf-list">{shown.map(sale => <li key={sale.id}>
   <span>{sale.name}<small>{formatDate(sale.date, locale)} · {t('Sold for {amount}', { amount: entered(sale.proceeds, sale.currency) })}</small></span>
   <strong className={signTone(sale.gain)}>{enteredSigned(sale.gain, sale.currency)}</strong>
  </li>)}</ul> : <EmptyState icon={<Receipt size={24}/>} description={t('Nothing sold yet. A sale recorded in a holding\'s Tracker shows its gain here.')}/>}
 </section>;
}
