"use client";
import type { ComponentProps, ReactNode } from 'react';
import { FlowSankey } from '@/components/cash-flow-sankey';
import { useLanguage } from '@/components/language-provider';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/** A Sankey in a dialog: a title with its figure, the flows, and whatever explains them below (`children`). */
export function FlowDialog({ title, figure, flows, currency, onClose, children }: { title: string; figure?: string; flows: ComponentProps<typeof FlowSankey>['flows']; currency: string; onClose: () => void; children?: ReactNode }) {
 const { t } = useLanguage();
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="record-dialog cash-flow-drill-dialog" aria-describedby={undefined}>
  <DialogTitle>{title}{figure && <> <span className="panel-figure">{figure}</span></>}</DialogTitle>
  {flows.links.length ? <FlowSankey flows={flows} currency={currency}/> : <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>}
  {children}
 </DialogContent></Dialog>;
}
