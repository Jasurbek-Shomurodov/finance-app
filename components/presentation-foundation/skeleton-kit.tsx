import type { CSSProperties, ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// The parts every screen's shimmer is built from. Each part carries the class of the loaded block it stands for, so the
// stylesheet lays the shimmer out exactly as it lays out the page (docs/agents/interface.md, Shimmer follows the screen).

/** A screen region still loading: announced once, its blocks spaced like the page's own `.content`. */
export function Loading({ label, children }: { label: string; children: ReactNode }) {
  return <div role="status" aria-busy="true" className="screen-skeleton-region"><span className="sr-only">{label}</span><div aria-hidden="true" className="screen-skeleton">{children}</div></div>;
}

export const times = (count: number) => Array.from({ length: count }, (_, index) => index);

/** A bar of a given width in pixels: `Bar` keeps the many skeleton lines short. */
export function Bar({ className = 'h-4', width, style }: { className?: string; width?: number; style?: CSSProperties }) {
  return <Skeleton className={className + ' max-w-full'} style={width ? { width, ...style } : style}/>;
}

/** A panel's heading row: the title, and an aside (a switch, a button or a link) when the loaded panel has one. */
export function Heading({ width = 160, aside, link = false }: { width?: number; aside?: number; link?: boolean }) {
  return <div className="panel-title-skeleton"><Bar className="h-7" width={width}/>{link ? <Bar width={56}/> : aside ? <Skeleton className="h-11 rounded-xl" style={{ width: aside }}/> : null}</div>;
}

/** The filter row above a list: an optional search box that takes the room, then a control per width. */
export function Toolbar({ search = false, controls, className = 'transactions-tools' }: { search?: boolean; controls: number[]; className?: string }) {
  return <div className={className}>{search && <Skeleton className="h-11 min-w-48 flex-1 rounded-xl"/>}{controls.map((width, index) => <Skeleton key={index} className="h-11 rounded-xl" style={{ width }}/>)}</div>;
}

/** A row's name cell: the category tile, the name and the line under it. */
export function Merchant({ width = 128, icon = 'size-9' }: { width?: number; icon?: string }) {
  return <span className="transaction-merchant"><Skeleton className={icon + ' shrink-0 rounded-[10px]'}/><span><Bar width={width}/><Skeleton className="mt-1.5 h-3 w-20"/></span></span>;
}

/** Label and figure pairs, as in the Summary and Left to budget lists. */
export function Figures({ rows, className = 'budget-left-summary' }: { rows: number; className?: string }) {
  return <div className={className}>{times(rows).map(row => <div key={row}><Skeleton className="h-4 w-24"/><Skeleton className="h-4 w-16"/></div>)}</div>;
}

/** Figure tiles: a label and a value, and with `note` the line under it, in the loaded `StatTiles` grid. */
export function Tiles({ count, columns = count, note = false }: { count: number; columns?: number | 'auto'; note?: boolean }) {
  return <div className="stat-tiles" data-columns={columns}>{times(count).map(tile => <article className="stat-tile" key={tile}><Skeleton className="h-4 w-24"/><Skeleton className="h-8 w-32 max-w-full"/>{note && <Skeleton className="h-3 w-40 max-w-full"/>}</article>)}</div>;
}

/** A row of switches, as `Segmented` controls sit in a panel heading or above a list. */
export function Switches({ widths }: { widths: number[] }) {
  return <div className="cash-flow-switches">{widths.map((width, index) => <Skeleton key={index} className="h-10 rounded-xl" style={{ width }}/>)}</div>;
}

/** A thin progress line. */
export const Track = () => <Skeleton className="h-1.5 w-full rounded-full"/>;
