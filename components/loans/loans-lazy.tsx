"use client";
import dynamic from 'next/dynamic';
import { chartHeight } from '@/components/presentation-foundation/chart';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';

// The chart library is loaded when a chart is drawn, with a placeholder of its height until then (see components/charts-lazy.tsx).
export const OwedDonut = dynamic(() => import('@/components/loans/payoff-charts').then(module => module.OwedDonut), { ssr: false, loading: () => <ChartSkeleton height={132}/> });
export const PayoffChart = dynamic(() => import('@/components/loans/payoff-charts').then(module => module.PayoffChart), { ssr: false, loading: () => <ChartSkeleton height={chartHeight.regular}/> });
export const PayoffChartCompact = dynamic(() => import('@/components/loans/payoff-charts').then(module => module.PayoffChart), { ssr: false, loading: () => <ChartSkeleton height={110}/> });
