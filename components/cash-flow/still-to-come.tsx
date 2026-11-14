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
 * is projected to end with (not the Estimated monthly surplus, which is a whole-month estimate). An amount no rate converts reads —, and so does the total that would add it. */
export function StillToCome({ outlook, month, currency }: { outlook: MonthOutlook; month: string; currency: string }) {
 const { t, locale } = useLanguage();
 const line = (icon: ReactNode, label: string, amount: number | null, incoming = false) => <div><dt>{icon}{label}</dt>
  <dd className={incoming && amount ? 'positive' : undefined}>{amount === null ? '—' : incoming ? formatSignedMoney(amount, currency, locale) : formatMoney(amount, currency, locale)}</dd></div>;
 return <section className="panel cashflow-still-to-come">
  <PanelTitle title={<>{t('Still to come')} <span className="panel-figure">{formatMonthYear(month, locale)}</span></>} hint={t('Income its sources still expect, less the scheduled bills not paid yet and the rest of the month’s expected spending. Loan and mortgage principal payments are transfers and are not counted.')}>
   <DrawerLink href="/recurring">{t('Recurring')}</DrawerLink>
  </PanelTitle>
  <dl>
   {line(<ArrowDownLeft size={16} aria-hidden="true"/>, t('Income expected'), outlook.income, true)}
   {line(<ArrowUpRight size={16} aria-hidden="true"/>, t('Bills due'), outlook.bills)}
   {line(<ChartPie size={16} aria-hidden="true"/>, t('Other expected spending'), outlook.other)}
   <div className="cashflow-still-total"><dt>{t('Projected net cash flow')}</dt><dd className={outlook.surplus === null ? undefined : signTone(outlook.surplus)}>{outlook.surplus === null ? '—' : formatSignedMoney(outlook.surplus, currency, locale)}</dd></div>
  </dl>
 </section>;
}
