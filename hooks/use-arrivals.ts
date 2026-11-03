"use client";
import { useLayoutEffect, useRef, useState } from 'react';
import { freshIds } from '@/lib/arrivals';

const none: ReadonlySet<string> = new Set();
/** Long enough for the row's rise and its fading tint (motion.css `row-arrive`, `row-glow`). */
const arrivalMs = 1800;

/** The rows that just joined a list (a transaction someone saved), so the list can mark them `data-arrived` and the
 * stylesheet can drop them into place. Decided before paint, so a new row is never drawn once in place first and then
 * snapped back to animate. Ids must not contain a line break. */
export function useArrivals(ids: readonly string[]): ReadonlySet<string> {
 const seen = useRef<Set<string> | null>(null);
 const [arrived, setArrived] = useState(none);
 const key = ids.join('\n');
 useLayoutEffect(() => {
  const list = key ? key.split('\n') : [];
  const fresh = freshIds(seen.current, list);
  seen.current = new Set(list);
  setArrived(fresh.length ? new Set(fresh) : none);
  if (!fresh.length) return;
  const timer = setTimeout(() => setArrived(none), arrivalMs);
  return () => clearTimeout(timer);
 }, [key]);
 return arrived;
}
