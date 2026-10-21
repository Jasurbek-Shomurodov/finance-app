"use client";
import type { ReportNames } from '@/components/business-reports';
import { periodEnding, type Attribute, type Drill, type Interval, type LedgerLine, type ReportRange } from '@/lib/business-report';
import { formatDate } from '@/lib/format';

export const intervalLabels: Record<Interval, string> = { month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };
export const attributeLabels: Record<Attribute, string> = { category: 'Category', group: 'Group', merchant: 'Merchant', business: 'Business' };

export type TabProps = { lines: LedgerLine[]; range: ReportRange; end: string; names: ReportNames; groupOf: (key: string) => string; currency: string; onDrill: (drill: Drill) => void };

export const rangeText = (range: ReportRange, locale: string) => `${formatDate(range.from, locale)} – ${formatDate(range.to, locale)}`;

/** A breakdown covers one month, quarter or year: the one the report's period ends in. */
export function breakdownPeriod(lines: readonly LedgerLine[], range: ReportRange, end: string, interval: Interval) {
 const period = periodEnding(range, end, interval);
 return { period, lines: lines.filter(line => line.date >= period.from && line.date <= period.to) };
}
