"use client";
import { useLanguage } from '@/components/language-provider';
import { Count } from '@/components/presentation-foundation/count';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RecordIcon } from '@/components/presentation-foundation/record-icon';
import { signTone } from '@/components/presentation-foundation/tone';
import { formatMoney, formatPercent } from '@/lib/format';
import type { PropertyYield } from '@/lib/investment-insights';

/** What each property earns against its value: the rent alone, and the rent after running costs. */
export function PropertyYields({ yields, currency }: { yields: readonly PropertyYield[]; currency: string }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const percent = (value: number | null) => value === null ? '—' : formatPercent(value, locale, 1);
 return <section className="panel">
  <PanelTitle title={t('Rental yield')} count={<Count value={yields.length}/>} hint={t('From the last 12 months of recorded rent and costs, against the property\'s value today. Gross yield is the rent alone. Cap rate is the rent after running costs such as repairs, fees and taxes, before any mortgage.')}/>
  <ul className="yield-cards">{yields.map(item => <li key={item.id}>
   <header><RecordIcon record={{ kind: 'Property', name: item.name }}/><span>{item.name}<small>{money(item.value)}</small></span></header>
   <dl>
    <div><dt>{t('Gross yield')}</dt><dd>{percent(item.grossYield)}</dd></div>
    <div><dt>{t('Cap rate')}</dt><dd className={signTone(item.capRate, true)}>{percent(item.capRate)}</dd></div>
    <div><dt>{t('Rent, 12 months')}</dt><dd>{money(item.rent)}</dd></div>
    <div><dt>{t('Costs, 12 months')}</dt><dd>{money(item.costs)}</dd></div>
   </dl>
  </li>)}</ul>
 </section>;
}
