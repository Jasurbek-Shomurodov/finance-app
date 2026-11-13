"use client";
import dynamic from 'next/dynamic';
import { chartHeight } from '@/components/presentation-foundation/chart';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';

/** The charting library loads with the charts, not with the page. */
export const PerformanceCharts = dynamic(() => import('@/components/performance/performance-charts').then(module => module.PerformanceCharts), { ssr: false, loading: () => <ChartSkeleton height={chartHeight.compact}/> });
