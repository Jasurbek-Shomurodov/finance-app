"use client";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { BusinessFilter, type BusinessOption } from '@/components/presentation-foundation/business-filter';
import { intervalLabel } from '@/components/presentation-foundation/chart';
import { OwnerFilter, type OwnerOption } from '@/components/presentation-foundation/owner-filter';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { TodayButton } from '@/components/presentation-foundation/today-button';
import { Button } from '@/components/ui/button';
import { intervalOf, intervals, type Interval, type ReportRange } from '@/lib/business-report';
import { intervalLabels } from './report-labels';

const stepLabels: Record<Interval, [string, string]> = { month: ['Previous month', 'Next month'], quarter: ['Previous quarter', 'Next quarter'], year: ['Previous year', 'Next year'] };

/** The Reports bar's filters: businesses, owners (in a shared household) and the period, a month, quarter or year
 * between the arrows that move it. */
export function ReportFilters({ businesses, business, onBusiness, owners, owner, onOwner, interval, onInterval, period, today, onStep, onToday }: { businesses: readonly BusinessOption[]; business: string[]; onBusiness: (value: string[]) => void; owners: readonly OwnerOption[]; owner: string[]; onOwner: (value: string[]) => void; interval: Interval; onInterval: (interval: Interval) => void; period: ReportRange; today: string; onStep: (steps: number) => void; onToday: () => void }) {
 const { t, locale } = useLanguage();
 const current = period.to >= today;
 return <>
  {businesses.length > 0 && <BusinessFilter businesses={businesses} value={business} onChange={onBusiness}/>}
  {owners.length > 0 && <OwnerFilter owners={owners} value={owner} onChange={onOwner}/>}
  <Segmented label={t('Interval')} options={intervals.map(value => ({ value, label: t(intervalLabels[value]) }))} value={interval} onChange={onInterval}/>
  <div className="budget-month-nav">
   <Button variant="outline" size="icon" aria-label={t(stepLabels[interval][0])} onClick={() => onStep(-1)}><ChevronLeft size={16}/></Button>
   <strong className="budget-period" aria-live="polite">{intervalLabel(interval, locale, t, true)(intervalOf(period.from, interval))}</strong>
   <Button variant="outline" size="icon" aria-label={t(stepLabels[interval][1])} disabled={current} onClick={() => onStep(1)}><ChevronRight size={16}/></Button>
   <TodayButton current={current} onClick={onToday}/>
  </div>
 </>;
}
