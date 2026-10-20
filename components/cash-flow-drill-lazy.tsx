"use client";
import dynamic from 'next/dynamic';

/** The Cash flow drill-down dialog, loaded when a transaction row opens it. It draws Sankeys with the chart library, so
 * the workspace shell stays without the charts until then. */
export const CashFlowDrillDialog = dynamic(() => import('@/components/cash-flow-sankey').then(module => module.CashFlowDrillDialog), { ssr: false });
