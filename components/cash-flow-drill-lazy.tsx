"use client";
import dynamic from 'next/dynamic';
import { useLanguage } from '@/components/language-provider';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';

/** The Cash flow drill-down dialog, loaded when a transaction row opens it. It draws Sankeys with the chart library, so
 * the workspace shell stays without the charts until then. */
export const CashFlowDrillDialog = dynamic(() => import('@/components/cash-flow-sankey').then(module => module.CashFlowDrillDialog), { ssr: false, loading: DrillDialogLoading });

/** How the monthly surplus is worked out, as a Sankey; loaded when someone taps a surplus. */
export const SurplusBreakdownDialog = dynamic(() => import('@/components/surplus-breakdown').then(module => module.SurplusBreakdownDialog), { ssr: false, loading: DrillDialogLoading });

/** Any Sankey in a dialog (`components/flow-dialog`), loaded when it opens. */
export const FlowDialog = dynamic(() => import('@/components/flow-dialog').then(module => module.FlowDialog), { ssr: false, loading: DrillDialogLoading });

/** While the chart code arrives, the dialog is already open with its chart shimmering in place. */
function DrillDialogLoading() {
 const { t } = useLanguage();
 return <Dialog open><DialogContent className="record-dialog cash-flow-drill-dialog" aria-describedby={undefined}><DialogTitle className="sr-only">{t('Loading chart…')}</DialogTitle><ChartSkeleton height={280} label={t('Loading chart…')}/></DialogContent></Dialog>;
}
