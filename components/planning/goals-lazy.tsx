"use client";
import dynamic from 'next/dynamic';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { chartHeight } from '@/components/presentation-foundation/chart';

/** The Goal planner's views draw with the chart library, and the add-goal flow opens on request, so the Overview tab
 * loads without them. next/dynamic needs its options written out as an object literal. */
export const GoalForecast = dynamic(() => import('./goal-forecast').then(module => module.GoalForecast), { ssr: false, loading: () => <ChartSkeleton/> });
export const InvestmentGoalPlan = dynamic(() => import('./investment-goal-plan').then(module => module.InvestmentGoalPlan), { ssr: false, loading: () => <ChartSkeleton/> });
export const GoalSetupFlow = dynamic(() => import('./goal-setup-flow').then(module => module.GoalSetupFlow), { ssr: false });
export const GoalProjectionChart = dynamic(() => import('./goal-projection-chart').then(module => module.GoalProjectionChart), { ssr: false, loading: () => <ChartSkeleton height={chartHeight.slim}/> });
