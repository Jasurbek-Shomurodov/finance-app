"use client";
import { useState } from 'react';
import { BellRing, Plus } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Count } from '@/components/presentation-foundation/count';
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RecordIcon } from '@/components/presentation-foundation/record-icon';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import type { PreferenceResource } from '@/hooks/use-workspace-preferences';
import { showError } from '@/lib/feedback';
import { unitPricedKinds, type Entry } from '@/lib/finance';
import { formatMoney } from '@/lib/format';
import { priceAlertReached, type PriceAlert } from '@/lib/investment-insights';
import { marketEntry, type MarketData } from '@/lib/market';
import { maxPriceAlerts } from '@/lib/workspace-preferences';

/** Prices to be told about. An alert is checked against the live price here and by the daily Telegram message. */
export function PriceAlerts({ records, market, preferences, demo }: { records: readonly Entry[]; market: MarketData | null; preferences: PreferenceResource; demo: boolean }) {
 const { t, locale } = useLanguage();
 const holdings = records.filter(record => unitPricedKinds.includes(record.kind) && Number(record.quantity) > 0);
 const saved = preferences.data.preferences.find(item => item.key === 'price_alerts')?.data.items;
 // The sample workspace saves nothing: its alerts live on the screen.
 const [sample, setSample] = useState<PriceAlert[]>([]);
 const alerts: readonly PriceAlert[] = demo ? sample : saved ?? [];
 const [recordId, setRecordId] = useState(''), [direction, setDirection] = useState<PriceAlert['direction']>('above'), [price, setPrice] = useState(0), [busy, setBusy] = useState(false);
 const chosen = holdings.find(record => record.id === recordId) ?? holdings[0];
 const priceOf = (record: Entry) => marketEntry(record, record.currency, market)?.amount ?? null;
 const quote = (amount: number, record: Entry) => formatMoney(amount, record.currency, locale, true);
 async function store(items: PriceAlert[]) {
  if (demo) { setSample(items); return; }
  setBusy(true);
  try { await preferences.save({ key: 'price_alerts', data: { items } }); }
  catch (error) { showError(t(error instanceof Error ? error.message : 'Could not save changes.')); }
  finally { setBusy(false); }
 }
 const add = () => { if (chosen && price > 0) void store([...alerts, { id: crypto.randomUUID(), record_id: chosen.id, direction, price, reached_on: null }]).then(() => setPrice(0)); };
 if (!holdings.length) return null;
 return <section className="panel">
  <PanelTitle title={t('Price alerts')} count={<Count value={alerts.length}/>} hint={t('Choose a holding and a price. The alert shows here when the price gets there, and the daily Telegram message tells you once, if Telegram is connected.')}/>
  {alerts.length ? <ul className="perf-list">{alerts.map(alert => {
   const record = records.find(item => item.id === alert.record_id);
   if (!record) return null;
   const now = priceOf(record), reached = priceAlertReached(alert, now);
   return <li key={alert.id}><RecordIcon record={record}/>
    <span>{record.name}<small>{t(alert.direction === 'above' ? 'Rises to {price}' : 'Falls to {price}', { price: quote(alert.price, record) })}{now !== null && <> · {t('now {price}', { price: quote(now, record) })}</>}</small></span>
    <span className={'status-badge ' + (reached ? 'is-paid' : '')}>{t(reached ? 'Reached' : 'Waiting')}</span>
    <DeleteButton label={t('Delete the alert for {name}', { name: record.name })} disabled={busy} onClick={() => void store(alerts.filter(item => item.id !== alert.id))}/>
   </li>;
  })}</ul> : <EmptyState icon={<BellRing size={24}/>} description={t('No alerts yet.')}/>}
  {alerts.length < maxPriceAlerts && <form className="alert-form" onSubmit={event => { event.preventDefault(); add(); }}>
   <label>{t('Holding')}<NativeSelect value={chosen?.id ?? ''} onChange={event => setRecordId(event.target.value)}>{holdings.map(record => <option key={record.id} value={record.id}>{record.name}</option>)}</NativeSelect></label>
   <label>{t('When the price')}<NativeSelect value={direction} onChange={event => setDirection(event.target.value as PriceAlert['direction'])}><option value="above">{t('rises to')}</option><option value="below">{t('falls to')}</option></NativeSelect></label>
   <label>{t('Price ({currency})', { currency: chosen?.currency ?? '' })}<FormattedNumberInput value={price} onValueChange={setPrice}/></label>
   <Button type="submit" variant="outline" disabled={busy || !(price > 0)}><Plus size={16} aria-hidden="true"/>{t('Add alert')}</Button>
  </form>}
 </section>;
}
