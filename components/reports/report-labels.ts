"use client";
import type { ReportNames } from '@/components/business-reports';
import type { Attribute, Drill, Interval, LedgerLine, ReportRange } from '@/lib/business-report';
import { formatDate } from '@/lib/format';

export const intervalLabels: Record<Interval, string> = { month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };
export const attributeLabels: Record<Attribute, string> = { category: 'Category', group: 'Group', merchant: 'Merchant', business: 'Business' };

/** `lines` are the page's period; Trends draw `trendLines` over `trendRange`, by the page's interval. */
export type TabProps = { lines: LedgerLine[]; trendLines: LedgerLine[]; trendRange: ReportRange; interval: Interval; names: ReportNames; groupOf: (key: string) => string; currency: string; onDrill: (drill: Drill) => void; /** Transactions no rate converts in the period; its totals then read —. */ missing?: number; /** The same over `trendRange`: Trends then say their bars leave them out. */ trendMissing?: number };

export const rangeText = (range: ReportRange, locale: string) => `${formatDate(range.from, locale)} – ${formatDate(range.to, locale)}`;

