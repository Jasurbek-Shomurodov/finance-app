"use client";
import type { ReportNames } from '@/components/business-reports';
import type { Attribute, Drill, Interval, LedgerLine, ReportRange } from '@/lib/business-report';
import { formatDate } from '@/lib/format';

export const intervalLabels: Record<Interval, string> = { month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };
export const attributeLabels: Record<Attribute, string> = { category: 'Category', group: 'Group', merchant: 'Merchant', business: 'Business' };

/** `lines` are the page's period; Trends draw `trendLines` over `trendRange`, by the page's interval. */
export type TabProps = { lines: LedgerLine[]; trendLines: LedgerLine[]; trendRange: ReportRange; interval: Interval; names: ReportNames; groupOf: (key: string) => string; currency: string; onDrill: (drill: Drill) => void };

export const rangeText = (range: ReportRange, locale: string) => `${formatDate(range.from, locale)} – ${formatDate(range.to, locale)}`;

