"use client";
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import type { LinkProps } from 'recharts/types/chart/Sankey';
import { useLanguage } from '@/components/language-provider';
import { chartColors, chartSankey, chartTooltip, sankeyNodeRadius } from '@/components/presentation-foundation/chart';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { OperationDetails, OperationRow, operationTitle } from '@/components/cash-flow-operation';
import { accountOperations, operationFlows, type Operation } from '@/lib/cash-flow-operations';
import { principalFlows, principalPayments } from '@/lib/cash-flow-principal';
import { drillFlows, drillTransactions, type DrillContext, type DrillTarget } from '@/lib/cash-flow-drill';
import { income, type Entry } from '@/lib/finance';
import { formatCompactMoney, formatDate, formatMoney } from '@/lib/format';
import { measureLabel, sankeyLabelMargins, sankeyMinWidth } from '@/lib/sankey-labels';

type Kind = 'income' | 'total' | 'expense' | 'savings' | 'account' | 'holding' | 'debt' | 'untraced';
type Flows = { nodes: ReadonlyArray<{ name: string; kind: Kind }>; links: Array<{ source: number; target: number; value: number }> };
const fills: Record<Kind, string> = { income: chartColors.income, savings: chartColors.income, total: 'var(--mark-bg)', account: 'var(--mark-bg)', holding: chartColors.holding, expense: chartColors.expense, debt: 'var(--caution)', untraced: chartColors.other };

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

/** The transactions under a drill-down Sankey (for Savings, all the period's income and spending), each as it was entered; a tap opens its details. */
function DrillTransactions({ target, context, onOpenRecord, onOpenOperation }: { target: DrillTarget; context: DrillContext; onOpenRecord: (record: Entry) => void; onOpenOperation: (row: Operation) => void }) {
 const { t, locale } = useLanguage();
 const name = context.label ?? t;
 // A debt's principal lists the payments that paid it down: mortgage payments and loan repayments.
 const records = target.side === 'principal' ? principalPayments(target.key, context).flatMap(payment => payment.record ? [payment.record] : []) : drillTransactions(target, context);
 // An account also lists its transfers, repayments, buys and sales, in date order among its transactions.
 const operations = target.side === 'account' ? accountOperations(target.key, context) : target.side === 'principal' ? accountOperations(target.key, context).filter(row => row.kind === 'repayment' && row.target_id === target.key) : [];
 const rows = [...records.map(record => ({ date: record.date, record, operation: null })), ...operations.map(operation => ({ date: operation.date, record: null, operation }))].sort((a, b) => b.date.localeCompare(a.date));
 if (!rows.length) return null;
 return <section className="drill-transactions" aria-label={t('Transactions')}>
  <h3>{t('Transactions')}</h3>
  <ul>{rows.map(({ record, operation }) => {
   if (operation) return <OperationRow key={operation.id} row={operation} account={target.side === 'account' || target.side === 'principal' ? target.key : ''} context={context} onOpen={onOpenOperation}/>;
   if (!record) return null;
   const incoming = income.includes(record.kind), title = record.name.trim() || t(record.kind);
   return <li key={record.id}><button type="button" onClick={() => onOpenRecord(record)} aria-label={t('View details for {name}', { name: title })}>
    <span><strong>{target.side === 'merchant' ? formatDate(record.date, locale) : title}</strong><small>{target.side === 'account' || target.side === 'savings' ? `${formatDate(record.date, locale)} · ${name(record.custom_category_id ?? record.kind)}` : target.side === 'merchant' ? name(record.custom_category_id ?? record.kind) : formatDate(record.date, locale)}</small></span>
    <span className={incoming ? 'positive' : undefined}>{`${incoming ? '+' : '−'}${formatMoney(Number(record.amount), record.currency, locale)}`}</span>
   </button></li>;
  })}</ul>
 </section>;
}

/** The Sankey behind a tapped node, in a dialog over Cash flow: a category by payer or merchant, where the savings went,
 * one account, or one payer, merchant or account; each with its transactions. An account, category or merchant in it opens its own
 * Sankey in the same dialog; Back returns to the one before. A transaction opens its details over it (`onOpenRecord`). */
export function CashFlowDrillDialog({ target, title, period, savings, context, onClose, onOpenRecord }: { target: DrillTarget; title: string; period: string; savings: number; context: DrillContext; onClose: () => void; onOpenRecord?: (record: Entry) => void }) {
 const { t } = useLanguage();
 const [trail, setTrail] = useState([{ target, title }]);
 const current = trail.at(-1)!;
 const flows = current.target.side === 'operation' ? operationFlows(current.target.key, context) : current.target.side === 'principal' ? principalFlows(current.target.key, context) : drillFlows(current.target, current.title, savings, context);
 // A transaction opens its shared details over the dialog; anything else opens in the dialog, with Back to return.
 const record = (id: string) => (context.data.records as Entry[]).find(item => item.id === id);
 const canOpen = (index: number) => { const open = flows.nodes[index]?.open; return !!open && (open.side !== 'record' || (!!onOpenRecord && !!record(open.key))); };
 const openNode = (index: number) => { const node = flows.nodes[index], open = node?.open; if (!open) return; if (open.side === 'record') { const found = record(open.key); if (found) onOpenRecord?.(found); } else setTrail([...trail, { target: open, title: node.name }]); };
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="record-dialog cash-flow-drill-dialog" aria-describedby={undefined}>
  {trail.length > 1 && <Button type="button" variant="ghost" size="sm" className="cash-flow-drill-back" onClick={() => setTrail(trail.slice(0, -1))}><ArrowLeft aria-hidden="true"/>{t('Back')}</Button>}
  <DialogTitle>{current.title} <span className="panel-figure">{period}</span></DialogTitle>
  {flows.missing > 0 && <p className="partial-total" role="status">{t('Some transactions could not be converted. Current or previous month totals are incomplete.')}</p>}
  {flows.links.length ? <FlowSankey key={trail.length} flows={flows} currency={context.currency} canOpen={canOpen} onOpen={openNode}/> : <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>}
  {current.target.side === 'operation' && <OperationDetails id={current.target.key} context={context}/>}
  {onOpenRecord && <DrillTransactions target={current.target} context={context} onOpenRecord={onOpenRecord} onOpenOperation={row => setTrail([...trail, { target: { side: 'operation', key: row.id }, title: operationTitle(row, t) }])}/>}
 </DialogContent></Dialog>;
}
