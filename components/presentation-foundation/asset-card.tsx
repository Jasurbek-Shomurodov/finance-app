"use client";
import type { CSSProperties, ReactNode } from 'react';
import { AssetIcon } from '@/components/presentation-foundation/asset-icon';
import { CategoryBadge } from '@/components/presentation-foundation/category-badge';
import { useLanguage } from '@/components/language-provider';
import type { StatTone } from '@/components/presentation-foundation/stat-tile';
import { categoryColor } from '@/lib/category-colors';
import { formatPercent } from '@/lib/format';
import { openProps } from '@/lib/row-open';
import type { Entry } from '@/lib/finance';

type Props = {
 record: Pick<Entry, 'kind' | 'name'>; label: string; menu?: ReactNode;
 worth: string; note?: ReactNode; fact?: { label: string; value: string; tone?: StatTone };
 share: number | null; detailsLabel: ReactNode; details: ReactNode; children?: ReactNode;
 onOpen?: () => void; openLabel?: string;
};


/** One holding or account: what it is, what it is worth, its weight in the portfolio, and its details, always shown.
 * With `onOpen` a tap on the card (but its own controls) runs it; without, the card is not clickable. */
export function AssetCard({ record, label, menu, worth, note, fact, share, detailsLabel, details, children, onOpen, openLabel }: Props) {
 const { t, locale } = useLanguage();
 return <article className="asset-card" style={{ '--asset-color': categoryColor(record.kind) } as CSSProperties} {...openProps(onOpen, openLabel ?? t('View details for {name}', { name: record.name }))}>
  <header className="asset-card-header"><span className="asset-card-icon"><AssetIcon record={record}/></span><div><h3>{record.name}</h3><CategoryBadge kind={record.kind} label={label}/></div>{menu}</header>
  <div className="asset-card-worth"><span className="sr-only">{t('Current value')}</span><strong>{worth}</strong>{note}</div>
  {fact && <dl className="asset-card-facts"><div><dt>{fact.label}</dt><dd className={fact.tone}>{fact.value}</dd></div></dl>}
  <div className="asset-card-share" role="img" aria-label={`${t('Share of holdings')}: ${share === null ? '—' : formatPercent(share, locale, 1)}`}><i style={{ width: `${Math.max(0, Math.min(100, share ?? 0))}%` }}/></div>
  <section className="asset-card-details"><div className="asset-card-details-head">{detailsLabel}</div>{details}</section>
  {children && <footer className="asset-card-actions">{children}</footer>}
 </article>;
}
