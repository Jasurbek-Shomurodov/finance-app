import type { ReactNode } from 'react';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';

export type StatTone = 'positive' | 'negative';

/** A row of key figures. Tiles share one size and reflow by the width of the content column. */
export function StatTiles({ children, label, columns = 4 }: { children: ReactNode; label?: string; columns?: 3 | 4 | 'auto' }) {
 return <div className="stat-tiles" data-columns={columns} role={label ? 'group' : undefined} aria-label={label}>{children}</div>;
}

/** One key figure: a short label, the formatted value, and an optional line of context. An explanation goes behind the ⓘ as `hint`.
 * A text value rolls its digits into place; pass `rolling={false}` for one that is not a figure, such as a date. */
/** With `href` the whole tile is a link to the page behind the figure (the dashboard's headline row); a linked tile keeps
 * its explanation off the tile, since an ⓘ inside a link would follow it. */
export function StatTile({ label, value, tone, hint, rolling = true, href, children }: { label: string; value: ReactNode; tone?: StatTone; hint?: ReactNode; rolling?: boolean; href?: string; children?: ReactNode }) {
 const figure = <strong className={tone}>{rolling && typeof value === 'string' ? <RollingText text={value}/> : value}</strong>;
 if (href) return <DrawerLink href={href} className="stat-tile stat-tile-link"><h3>{label}</h3>{figure}{children}</DrawerLink>;
 return <article className="stat-tile"><h3>{label}{hint ? <InfoHint>{hint}</InfoHint> : null}</h3>{figure}{children}</article>;
}
