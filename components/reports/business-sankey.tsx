"use client";
import type { CSSProperties, KeyboardEvent } from 'react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import type { LinkProps } from 'recharts/types/chart/Sankey';
import { ReceiptText } from 'lucide-react';
import { attributeColor, type ReportNames } from '@/components/business-reports';
import { useLanguage } from '@/components/language-provider';
import { chartSankey, chartTooltip, sankeyNodeRadius } from '@/components/presentation-foundation/chart';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { HOUSEHOLD } from '@/lib/business';
import type { BusinessSankey, Drill, ProfitAndLoss, SankeyNode } from '@/lib/business-report';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { measureLabel, sankeyLabelMargins, sankeyMinWidth } from '@/lib/sankey-labels';

type Flow = { source?: { name?: string }; target?: { name?: string } };

/** Where the money went, coloured by who earned it: each business and the household in its own colour, what was kept
 * green and a loss red. A business's label carries its own net on a second line. Clicking a flow or a label narrows the
 * transactions below; the tooltip reads "Business → Supplies · $927" while the pointer is on a flow. */
export function BusinessSankeyChart({ data, pnl, names, currency, onDrill }: { data: BusinessSankey; pnl: ProfitAndLoss; names: ReportNames; currency: string; onDrill: (drill: Drill) => void }) {
 const { t, locale } = useLanguage();
 if (!data.links.length) return <EmptyState icon={<ReceiptText/>} description={t('Nothing recorded in this period.')}/>;
 const color = (owner: string | null) => attributeColor('business', owner ?? HOUSEHOLD, names);
 const fill = (node: SankeyNode | undefined) => node?.kind === 'savings' ? 'var(--positive)' : node?.kind === 'loss' ? 'var(--negative)' : color(node?.owner ?? null);
 const netOf = (node: SankeyNode | undefined) => node?.kind === 'business' ? pnl.businesses.find(business => business.id === node.owner)?.net : undefined;
 const label = (name: string, value: number) => `${name} · ${formatMoney(value, currency, locale)}`;
 const owners = [...new Set(data.nodes.map(node => node.owner))];
 const kept = data.nodes.find(node => node.kind === 'savings' && node.owner === null);
 // Each side gets exactly the room its longest label needs; the chart scrolls only when that and its columns do not fit.
 const room = sankeyLabelMargins(data, label, measureLabel);
 const press = (drill: Drill | null | undefined) => drill ? (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onDrill(drill); } } : undefined;
 return <>
  <ul className="sankey-legend">
   {owners.map(owner => <li key={owner ?? HOUSEHOLD} style={{ '--flow': color(owner) } as CSSProperties}>{names.business(owner)}</li>)}
   {kept && <li style={{ '--flow': 'var(--positive)' } as CSSProperties}>{kept.name}</li>}
  </ul>
  {/* Drawn straight away, so it is measured from the start (the dialog Sankey shows a skeleton until it is). */}
  <div className="cash-flow-sankey" data-measured><ResponsiveContainer width="100%" minWidth={sankeyMinWidth(data, room)} height={Math.max(300, data.nodes.length * 32)}>
   <Sankey data={data} {...chartSankey} margin={{ top: 8, right: room.right, bottom: 8, left: room.left }}
    link={({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index }: LinkProps) => {
     const link = data.links[index], drill = link && (data.nodes[link.target]?.drill ?? data.nodes[link.source]?.drill);
     return <path className="sankey-link" data-owner style={{ '--flow': color(data.nodes[link?.source]?.owner ?? null) } as CSSProperties} d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`} strokeWidth={Math.max(1, linkWidth)} onClick={drill ? () => onDrill(drill) : undefined} data-clickable={!!drill || undefined}/>;
    }}
    node={({ x, y, width, height, index, payload }: { x: number; y: number; width: number; height: number; index: number; payload: { name: string; value: number } }) => {
     const node = data.nodes[index], left = !data.links.some(link => link.target === index), drill = node?.drill, net = netOf(node);
     const textX = left ? x - 8 : x + width + 8, anchor = left ? 'end' : 'start';
     return <g className="sankey-node" onClick={drill ? () => onDrill(drill) : undefined} onKeyDown={press(drill)} data-clickable={!!drill || undefined} tabIndex={drill ? 0 : undefined} role={drill ? 'button' : undefined} aria-label={drill ? label(payload.name, payload.value) : undefined}>
      <rect x={x} y={y} width={width} height={Math.max(2, height)} rx={sankeyNodeRadius} fill={fill(node)}/>
      <text x={textX} y={y + height / 2} dy={net === undefined ? '0.35em' : '-0.25em'} textAnchor={anchor} className="sankey-label">{label(payload.name, payload.value)}</text>
      {net !== undefined && <text x={textX} y={y + height / 2} dy="1.05em" textAnchor={anchor} className="sankey-label sankey-net" data-tone={net < 0 ? 'negative' : undefined}>{t('Net {amount}', { amount: formatSignedMoney(net, currency, locale) })}</text>}
     </g>;
    }}>
    <Tooltip {...chartTooltip} separator=" · " formatter={(value, name, item) => {
     // The entry's payload is the flow itself or wraps it, by recharts version.
     const entry = (item?.payload ?? {}) as Flow & { payload?: Flow }, flow = entry.source ? entry : entry.payload ?? {};
     return [formatMoney(Number(value), currency, locale), flow.source?.name && flow.target?.name ? `${flow.source.name} → ${flow.target.name}` : String(name)];
    }}/>
   </Sankey>
  </ResponsiveContainer></div>
 </>;
}
