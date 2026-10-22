"use client";
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { AssetIcon } from '@/components/presentation-foundation/asset-icon';
import { CategoryBadge } from '@/components/presentation-foundation/category-badge';
import { useLanguage } from '@/components/language-provider';
import type { StatTone } from '@/components/presentation-foundation/stat-tile';
import { toggleAssetDetailsRow } from '@/lib/asset-details';
import { categoryColor } from '@/lib/category-colors';
import { formatPercent } from '@/lib/format';
import { openProps } from '@/lib/row-open';
import type { Entry } from '@/lib/finance';

type Props = {
 record: Pick<Entry, 'kind' | 'name'>; label: string; menu?: ReactNode;
 worth: string; note?: ReactNode; fact?: { label: string; value: string; tone?: StatTone };
 share: number | null; detailsLabel: string; details: ReactNode; children?: ReactNode;
};


/** One holding or account: what it is, what it is worth, and its weight in the portfolio. */
export function AssetCard({ record, label, menu, worth, note, fact, share, detailsLabel, details, children }: Props) {
 const { t, locale } = useLanguage();
 // A tap anywhere on the card (but its own controls) opens or closes its details, as its summary does.
 const toggle = (event: MouseEvent | KeyboardEvent) => {
  const summary = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(':scope > .asset-card-details > summary');
  if (!summary) return;
  // Outside a grid the row toggle leaves it to the browser, which a tap on the card does not reach: open it here.
  let handled = false;
  toggleAssetDetailsRow({ currentTarget: summary, preventDefault() { handled = true; } });
  if (!handled) { const details = summary.parentElement as HTMLDetailsElement; details.open = !details.open; }
 };
 return <article className="asset-card" style={{ '--asset-color': categoryColor(record.kind) } as CSSProperties} {...openProps(toggle, t('View details for {name}', { name: record.name }))}>
  <header className="asset-card-header"><span className="asset-card-icon"><AssetIcon record={record}/></span><div><h3>{record.name}</h3><CategoryBadge kind={record.kind} label={label}/></div>{menu}</header>
  <div className="asset-card-worth"><span className="sr-only">{t('Current value')}</span><strong>{worth}</strong>{note}</div>
  {fact && <dl className="asset-card-facts"><div><dt>{fact.label}</dt><dd className={fact.tone}>{fact.value}</dd></div></dl>}
  <div className="asset-card-share" role="img" aria-label={`${t('Share of holdings')}: ${share === null ? '—' : formatPercent(share, locale, 1)}`}><i style={{ width: `${Math.max(0, Math.min(100, share ?? 0))}%` }}/></div>
  <details className="asset-card-details"><summary onClick={toggleAssetDetailsRow}>{detailsLabel}<ChevronDown size={15} aria-hidden="true"/></summary>{details}</details>
  {children && <footer className="asset-card-actions">{children}</footer>}
 </article>;
}
