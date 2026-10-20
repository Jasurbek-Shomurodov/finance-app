"use client";
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import type { LinkProps } from 'recharts/types/chart/Sankey';
import { useLanguage } from '@/components/language-provider';
import { chartColors, chartSankey, chartTooltip, sankeyNodeRadius } from '@/components/presentation-foundation/chart';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { drillFlows, type DrillContext, type DrillTarget } from '@/lib/cash-flow-drill';
import { formatCompactMoney, formatMoney } from '@/lib/format';
import { measureLabel, sankeyLabelMargins, sankeyMinWidth } from '@/lib/sankey-labels';

type Kind = 'income' | 'total' | 'expense' | 'savings' | 'account' | 'debt' | 'untraced';
type Flows = { nodes: ReadonlyArray<{ name: string; kind: Kind }>; links: Array<{ source: number; target: number; value: number }> };
const fills: Record<Kind, string> = { income: chartColors.income, savings: chartColors.income, total: 'var(--mark-bg)', account: 'var(--mark-bg)', expense: chartColors.expense, debt: 'var(--caution)', untraced: chartColors.other };

/** A Cash flow Sankey. With `onOpen`, a node it returns true for is a button (click, Enter or Space) that opens its own
 * Sankey, and a tap on a flow opens the node it leads to (or, from a node that cannot open, the one it comes from). */
export function FlowSankey({ flows, currency, onOpen, canOpen }: { flows: Flows; currency: string; onOpen?: (index: number) => void; canOpen?: (index: number) => boolean }) {
 const { t, locale } = useLanguage();
 const label = (name: string, value: number) => `${name} · ${formatCompactMoney(value, currency, locale)}`;
 // Each side gets exactly the room its longest label needs; on a narrow screen the chart scrolls rather than squeezing its columns.
 const room = sankeyLabelMargins(flows, label, measureLabel);
 const opens = (index: number) => !!onOpen && (canOpen?.(index) ?? true);
 const flowTarget = (index: number) => { const link = flows.links[index]; return !link ? null : opens(link.target) ? link.target : opens(link.source) ? link.source : null; };
 return <div className="cash-flow-sankey"><ResponsiveContainer width="100%" minWidth={sankeyMinWidth(flows, room)} height={Math.max(280, flows.nodes.length * 34)}>
  <Sankey data={{ nodes: [...flows.nodes], links: flows.links }} {...chartSankey} margin={{ top: 8, right: room.right, bottom: 8, left: room.left }} link={({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index }: LinkProps) => {
   const node = flowTarget(index);
   return <path className="sankey-link" d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`} strokeWidth={Math.max(1, linkWidth)} onClick={node === null ? undefined : () => onOpen!(node)} data-clickable={node === null ? undefined : true}/>;
  }} node={({ x, y, width, height, index, payload }: { x: number; y: number; width: number; height: number; index: number; payload: { name: string; value: number } }) => {
   const kind = flows.nodes[index]?.kind ?? 'expense', left = !flows.links.some(link => link.target === index);
   const open = opens(index) ? () => onOpen!(index) : undefined;
   return <g className="sankey-node" data-clickable={open ? true : undefined} role={open ? 'button' : undefined} tabIndex={open ? 0 : undefined} aria-label={open ? t('Open {name}', { name: payload.name }) : undefined}
    onClick={open} onKeyDown={open ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } } : undefined}>
    <rect x={x} y={y} width={width} height={Math.max(2, height)} rx={sankeyNodeRadius} fill={fills[kind]}/>
    <text x={left ? x - 8 : x + width + 8} y={y + height / 2} dy="0.35em" textAnchor={left ? 'end' : 'start'} className="sankey-label">{label(payload.name, payload.value)}</text>
   </g>;
  }}>
   <Tooltip {...chartTooltip} formatter={value => formatMoney(Number(value), currency, locale)}/>
  </Sankey>
 </ResponsiveContainer></div>;
}

/** The Sankey behind a tapped node, in a dialog over Cash flow: a category by payer or merchant, where the savings went,
 * or one account. An account or category in it opens its own Sankey in the same dialog; Back returns to the one before. */
export function CashFlowDrillDialog({ target, title, period, savings, context, onClose }: { target: DrillTarget; title: string; period: string; savings: number; context: DrillContext; onClose: () => void }) {
 const { t } = useLanguage();
 const [trail, setTrail] = useState([{ target, title }]);
 const current = trail.at(-1)!;
 const flows = drillFlows(current.target, current.title, savings, context);
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="record-dialog cash-flow-drill-dialog" aria-describedby={undefined}>
  {trail.length > 1 && <Button type="button" variant="ghost" size="sm" className="cash-flow-drill-back" onClick={() => setTrail(trail.slice(0, -1))}><ArrowLeft aria-hidden="true"/>{t('Back')}</Button>}
  <DialogTitle>{current.title} <span className="panel-figure">{period}</span></DialogTitle>
  {flows.missing > 0 && <p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>}
  {flows.links.length ? <FlowSankey key={trail.length} flows={flows} currency={context.currency} canOpen={index => !!flows.nodes[index]?.open} onOpen={index => { const node = flows.nodes[index]; if (node.open) setTrail([...trail, { target: node.open, title: node.name }]); }}/> : <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>}
 </DialogContent></Dialog>;
}
