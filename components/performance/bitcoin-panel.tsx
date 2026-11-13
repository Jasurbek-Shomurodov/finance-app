"use client";
import { useState, type CSSProperties } from 'react';
import { useLanguage } from '@/components/language-provider';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { signTone } from '@/components/presentation-foundation/tone';
import { signedPercent } from '@/components/performance/performance-summary';
import { holdingQuantity } from '@/lib/asset-movements';
import type { Entry } from '@/lib/finance';
import { formatConvertedQuote, formatDate, formatMoney, formatNumber } from '@/lib/format';
import type { BenchmarkMovement } from '@/lib/investment-benchmarks';
import { costLadder, dcaPlan, type CostLadder } from '@/lib/investment-insights';
import { marketEntry, type MarketData } from '@/lib/market';

const change = (price: number, against: number) => against > 0 ? (price / against - 1) * 100 : null;

/** Where each purchase sits between the lowest and highest price paid, with the average and today's price marked. */
function Ladder({ ladder, price, record }: { ladder: CostLadder; price: number; record: Entry }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, record.currency, locale, true);
 const low = Math.min(ladder.low, price, ladder.average) * .96, high = Math.max(ladder.high, price, ladder.average) * 1.04;
 const at = (value: number) => ({ '--at': `${(value - low) / (high - low) * 100}%` }) as CSSProperties;
 const largest = Math.max(...ladder.lots.map(lot => lot.units));
 return <>
  <div className="ladder-track" role="img" aria-label={t('Average buy price {average}, price today {price}', { average: money(ladder.average), price: money(price) })}>
   {ladder.lots.map(lot => <i key={lot.id} className="ladder-lot" style={{ ...at(lot.price), '--size': `${10 + 14 * lot.units / largest}px` } as CSSProperties}/>)}
   <span className="ladder-mark" data-mark="average" style={at(ladder.average)}><b>{t('Average')}</b>{money(ladder.average)}</span>
   <span className="ladder-mark" data-mark="price" style={at(price)}><b>{t('Today')}</b>{money(price)}</span>
  </div>
  <ul className="perf-list">{ladder.lots.map(lot => {
   const gain = change(price, lot.price);
   return <li key={lot.id}><span>{lot.id === 'earlier' ? t('Earlier purchases') : formatDate(lot.date, locale)}<small>{holdingQuantity(t, record, lot.units, locale)} · {t('at {price}', { price: formatConvertedQuote(lot.price, record.currency, locale) })}</small></span><strong className={signTone(gain)}>{signedPercent(gain, locale)}</strong></li>;
  })}</ul>
 </>;
}

/** Buying the same amount on a schedule: what the holding and its average price look like after the last buy. */
function DcaPlanner({ record, ladder, price }: { record: Entry; ladder: CostLadder; price: number }) {
 const { t, locale } = useLanguage();
 const [amount, setAmount] = useState(100), [buys, setBuys] = useState(12), [drift, setDrift] = useState(0);
 const result = dcaPlan({ units: ladder.units, average: ladder.average }, { amount, buys, price, change: drift });
 const money = (value: number) => formatMoney(value, record.currency, locale), 
 // A worked-out price reads to the currency's minor unit, never with a calculation tail.
 quote = (value: number) => formatConvertedQuote(value, record.currency, locale);
 return <div className="dca-planner">
  <h3>{t('DCA planner')}</h3>
  <div className="dca-fields">
   <label>{t('Amount each time ({currency})', { currency: record.currency })}<FormattedNumberInput value={amount} onValueChange={setAmount}/></label>
   <label>{t('Number of buys')}<FormattedNumberInput value={buys} onValueChange={value => setBuys(Math.trunc(value))} max={600} displayFractionDigits={0}/></label>
   <label>{t('Price change between buys, %')}<FormattedNumberInput value={drift} onValueChange={setDrift} max={1000} required={false}/></label>
  </div>
  {result ? <dl className="dca-result">
   <div><dt>{t('New average buy price')}</dt><dd>{quote(result.average)}<small className={signTone(-(change(result.average, ladder.average) ?? 0))}>{signedPercent(change(result.average, ladder.average), locale)}</small></dd></div>
   <div><dt>{t('You would hold')}</dt><dd>{holdingQuantity(t, record, result.units, locale)}</dd></div>
   <div><dt>{t('Total invested')}</dt><dd>{money(result.invested)}</dd></div>
   <div><dt>{t('Value at the last price')}</dt><dd>{money(result.value)}<small>{t('at {price}', { price: quote(result.lastPrice) })}</small></dd></div>
  </dl> : <p className="muted">{t('Enter an amount and a number of buys.')}</p>}
 </div>;
}

/** A Bitcoin holding at a glance: the prices it was bought at against today's, and a plan for buying more. */
export function BitcoinPanel({ record, movements, market }: { record: Entry; movements: readonly BenchmarkMovement[]; market: MarketData | null }) {
 const { t, locale } = useLanguage();
 const ladder = costLadder(record, movements);
 const price = marketEntry(record, record.currency, market)?.amount ?? Number(record.amount);
 if (!ladder || !(price > 0)) return null;
 const gain = change(price, ladder.average);
 return <section className="panel bitcoin-panel">
  <PanelTitle title={<>{t('Bitcoin')} <span className={'panel-figure ' + (signTone(gain) ?? '')}>{signedPercent(gain, locale)}</span></>} hint={t('Each dot is a purchase, placed at the price paid; a larger dot is a larger purchase. Purchases made through Buy are listed one by one; units you already held are one step at their average. After a sale the ladder shows the average only.')}>
   <span className="muted">{formatNumber(ladder.units, locale, 8)} BTC</span>
  </PanelTitle>
  <div className="bitcoin-body"><div><Ladder ladder={ladder} price={price} record={record}/></div><DcaPlanner record={record} ladder={ladder} price={price}/></div>
 </section>;
}
