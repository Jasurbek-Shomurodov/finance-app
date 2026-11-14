"use client";
import { ArrowRight } from 'lucide-react';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { liabilityTone, signTone } from '@/components/presentation-foundation/tone';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatMonthYear, formatNumber } from '@/lib/format';
import { financialTotals, type Entry } from '@/lib/finance';

/** When the payoff plan clears every debt, and when minimum payments alone would (`payoffDay`); null is never.
 * `ready` is false while the plan is loading or there is no debt to plan. */
export type DebtFree = { ready: boolean; day: string | null; minimumsDay: string | null; onOpen: () => void };

export function DebtSummary({entries,currency,debtFree}:{entries:Entry[];currency:string;debtFree?:DebtFree}) {
 const {t,locale}=useLanguage();
 const lent=entries.filter(entry=>entry.kind==='Money lent');
 const {receivable,totalDebt:payable,netLending}=financialTotals(entries);
 const lentCount=lent.reduce((sum,entry)=>sum+(entry.record_count??1),0);
 return <StatTiles columns={debtFree?4:3}>
  <StatTile label={t('Money you owe')} value={formatMoney(payable,currency,locale)} tone={liabilityTone(payable)}></StatTile>
  <StatTile label={t('Money owed to you')} value={formatMoney(receivable,currency,locale)}><p>{t(lentCount===1?'1 lending record':'{count} lending records',{count:formatNumber(lentCount,locale,0)})}</p></StatTile>
  {/* A net borrowing position is not a success state, so only a shortfall is coloured. */}
  <StatTile label={t('Net lending position')} value={formatMoney(netLending,currency,locale)} tone={signTone(netLending,true)}></StatTile>
  {debtFree&&<StatTile label={t('Estimated debt-free date')} rolling={false} value={!debtFree.ready?'—':debtFree.day?formatMonthYear(debtFree.day,locale):t('Not repaid within 50 years')} aside={<button type="button" className="panel-link" onClick={debtFree.onOpen}>{t('Plan')}<ArrowRight size={14} aria-hidden="true"/></button>}>
   {debtFree.ready&&debtFree.minimumsDay&&debtFree.minimumsDay!==debtFree.day&&<p>{t('{date} with minimums only',{date:formatMonthYear(debtFree.minimumsDay,locale)})}</p>}
  </StatTile>}
 </StatTiles>;
}
