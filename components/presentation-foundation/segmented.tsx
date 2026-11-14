import type { ReactNode } from 'react';

export type SegmentedOption<T> = { value: T; label: ReactNode };

type Props<T> = { label: string; options: readonly SegmentedOption<T>[]; value: T; onChange: (value: T) => void; className?: string; as?: 'div' | 'nav' };

/** The option each switch showed pressed last, so the marker can travel from it. */
const pressedBefore = new WeakMap<HTMLElement, HTMLElement>();

/** Slides the pressed marker (the option's `::before`) from the option pressed before to the one pressed now. It moves
 * by transform only, timed by the motion tokens, and stands still under reduced motion. */
function slideMarker(group: HTMLElement | null) {
 if (!group) return;
 const next = group.querySelector<HTMLElement>(':scope > button[aria-pressed="true"]');
 const last = pressedBefore.get(group);
 if (next) pressedBefore.set(group, next); else pressedBefore.delete(group);
 if (!next || !last || last === next || !last.isConnected || typeof next.animate !== 'function') return;
 if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 const from = last.getBoundingClientRect(), to = next.getBoundingClientRect();
 if (!to.width || !to.height) return;
 const tokens = getComputedStyle(group);
 const move = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
 next.animate([{ transform: move }, { transform: 'none' }], { duration: (parseFloat(tokens.getPropertyValue('--motion-settle')) || .28) * 1000, easing: tokens.getPropertyValue('--ease-out').trim() || 'ease-out', pseudoElement: '::before' });
}

/** A switch between views of the same data. The pressed option is announced through aria-pressed. */
export function Segmented<T extends string | number | null>({ label, options, value, onChange, className, as: Tag = 'div' }: Props<T>) {
 // An inline ref runs after every render, which is when the pressed option may have changed.
 return <Tag ref={(group: HTMLElement | null) => slideMarker(group)} className={className ? `segmented ${className}` : 'segmented'} role={Tag === 'nav' ? undefined : 'group'} aria-label={label}>
  {options.map(option => <button type="button" key={String(option.value)} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>)}
 </Tag>;
}
