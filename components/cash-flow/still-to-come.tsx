"use client";
import type { ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChartPie } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { signTone } from '@/components/presentation-foundation/tone';
import type { MonthOutlook } from '@/lib/cash-flow-outlook';
import { formatMoney, formatMonthYear, formatSignedMoney } from '@/lib/format';

/** The closing card of Cash flow: what the running month is still expected to bring, added up to the net cash flow the month
 * is projected to end with (not the Estimated monthly surplus, which is a whole-month estimate). An amount no rate converts reads —, and so does the total that would add it.
 * Each line opens the list it adds up: the income sources (`onIncome`, Cash flow's own Income tab), Recurring's bills, the Budget. */
export function StillToCome({ outlook, month, currency, onIncome }: { outlook: MonthOutlook; month: string; currency: string; onIncome?: () => void }) {
 const { t, locale } = useLanguage();
 const line = (name: ReactNode, amount: number | null, incoming = false) => <div><dt>{name}</dt>
  <dd className={incoming && amount ? 'positive' : undefined}>{amount === null ? '—' : incoming ? formatSignedMoney(amount, currency, locale) : formatMoney(amount, currency, locale)}</dd></div>;
 const income = <><ArrowDownLeft size={16} aria-hidden="true"/>{t('Income expected')}</>;
 return <section className="panel cashflow-still-to-come">
  <PanelTitle title={<>{t('Still to come')} <span className="panel-figure">{formatMonthYear(month, locale)}</span></>} hint={t('Income its sources still expect, less the scheduled bills not paid yet and the rest of the month’s expected spending. Loan and mortgage principal payments are transfers and are not counted.')}>
   <DrawerLink href="/upcoming">{t('View all')}</DrawerLink>
  </PanelTitle>
  <dl>
   {line(onIncome ? <button type="button" className="cashflow-still-link" onClick={onIncome}>{income}</button> : income, outlook.income, true)}
   {line(<DrawerLink className="cashflow-still-link" href="/upcoming"><ArrowUpRight size={16} aria-hidden="true"/>{t('Bills due')}</DrawerLink>, outlook.bills)}
   {line(<DrawerLink className="cashflow-still-link" href="/budget"><ChartPie size={16} aria-hidden="true"/>{t('Other expected spending')}</DrawerLink>, outlook.other)}
   <div className="cashflow-still-total"><dt>{t('Projected net cash flow')}</dt><dd className={outlook.surplus === null ? undefined : signTone(outlook.surplus)}>{outlook.surplus === null ? '—' : formatSignedMoney(outlook.surplus, currency, locale)}</dd></div>
  </dl>
 </section>;
}
