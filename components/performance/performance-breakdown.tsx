"use client";
import { useState, type ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Count } from '@/components/presentation-foundation/count';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RecordIcon } from '@/components/presentation-foundation/record-icon';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { signTone } from '@/components/presentation-foundation/tone';
import { signedPercent } from '@/components/performance/performance-summary';
import type { Entry } from '@/lib/finance';
import { formatMoney, formatNumber, formatSignedMoney } from '@/lib/format';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { groupPnl, type HoldingPnl, type PnlTotals } from '@/lib/investment-pnl';

type View = 'holding' | 'class' | 'account';
type Row = PnlTotals & { key: string; name: string; icon: ReactNode; meta?: string };

/** Profit and loss line by line: every holding, or the holdings added up by asset class or by account. */
export function PerformanceBreakdown({ holdings, records, accounts, currency }: { holdings: readonly HoldingPnl[]; records: readonly Entry[]; accounts: readonly HoldingAccount[]; currency: string }) {
 const { t, locale } = useLanguage();
 const [view, setView] = useState<View>('holding');
 const money = (amount: number) => formatMoney(amount, currency, locale), signed = (amount: number) => formatSignedMoney(amount, currency, locale);
 const count = (items: number) => t(items === 1 ? '1 holding' : '{count} holdings', { count: formatNumber(items, locale, 0) });
 const byId = new Map(records.map(record => [record.id, record]));
 const accountName = (id: string) => accounts.find(account => account.id === id)?.name ?? t('No account');
 const rows: Row[] = view === 'holding'
  ? holdings.map(holding => ({ ...holding, key: holding.id, icon: <RecordIcon record={byId.get(holding.id) ?? { kind: holding.kind as Entry['kind'], name: holding.name }}/>, meta: t(holding.kind) }))
  : view === 'class'
   ? groupPnl(holdings, holding => holding.kind).map(group => ({ ...group, name: t(group.key), icon: <CategoryIcon kind={group.key}/>, meta: count(group.count) }))
   : groupPnl(holdings, holding => holding.accountId ?? '').map(group => ({ ...group, name: accountName(group.key), icon: <CategoryIcon kind="Cash"/>, meta: count(group.count) }));
 const figure = (amount: number) => <td className={signTone(amount)}>{signed(amount)}</td>;
 return <section className="panel">
  <PanelTitle title={t('Where it came from')} count={<Count value={rows.length}/>}>
   <Segmented label={t('Group profit and loss by')} value={view} onChange={setView} options={[{ value: 'holding', label: t('Holdings') }, { value: 'class', label: t('Asset class') }, { value: 'account', label: t('Account') }] as const}/>
  </PanelTitle>
  <div className="table-scroll"><table className="perf-table">
   <thead><tr><th scope="col">{t('Name')}</th><th scope="col">{t('Value')}</th><th scope="col">{t('Invested')}</th><th scope="col">{t('Unrealized')}</th><th scope="col">{t('Realized')}</th><th scope="col">{t('Income less costs')}</th><th scope="col">{t('Profit and loss')}</th><th scope="col">{t('Return')}</th></tr></thead>
   <tbody>{rows.map(row => <tr key={row.key}>
    <th scope="row"><span className="perf-name">{row.icon}<span>{row.name}{row.meta && <small>{row.meta}</small>}</span></span></th>
    <td>{money(row.value)}</td><td>{money(row.invested)}</td>
    {figure(row.unrealized)}{figure(row.realized)}{figure(row.income - row.costs)}
    <td className={signTone(row.total)}><strong>{signed(row.total)}</strong></td>
    <td className={signTone(row.returnPercent)}>{signedPercent(row.returnPercent, locale)}</td>
   </tr>)}</tbody>
  </table></div>
 </section>;
}
