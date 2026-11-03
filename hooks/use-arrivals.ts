"use client";
import { useCallback } from 'react';
import { arrivedRows } from '@/lib/arrivals';

/** Long enough for the row's rise and its fading tint (motion.css `row-arrive`, `row-glow`). */
const arrivalMs = 1800;
/** How long after a press or a submit an inserted row still counts as its result (a save waits on the network). */
const causeMs = 4000;
/** What a person presses to change something. */
const pressable = 'button,a,[role=button],[role=menuitem],[role=option],input[type=submit]';

/** Every motion has a cause: within a few seconds of a press or a submit, the rows that join a list already on screen
 * (a saved transaction, a new goal, account, schedule or holding) are marked `data-arrived` for the stylesheet to drop
 * them into place. Background refreshes, moves, new pages and whole new lists stay still. One watcher on the workspace
 * covers every screen; the mark is set before paint (mutation observers run before the browser draws), so a row is
 * never drawn in place first and then snapped back. Returns a ref for the element to watch. */
export function useArrivalMarks<T extends HTMLElement>() {
 return useCallback((root: T | null) => {
  if (!root) return;
  let causedUntil = 0;
  const cause = (event: Event) => {
   if (event.type === 'submit' || (event.target instanceof Element && event.target.closest(pressable))) causedUntil = performance.now() + causeMs;
  };
  const observer = new MutationObserver(records => {
   if (performance.now() > causedUntil) return;
   const removed = new Set(records.flatMap(record => [...record.removedNodes]));
   const added = records.flatMap(record => [...record.addedNodes]).filter((node): node is Element => node instanceof Element && !removed.has(node));
   for (const row of arrivedRows(added)) {
    row.setAttribute('data-arrived', '');
    setTimeout(() => row.removeAttribute('data-arrived'), arrivalMs);
   }
  });
  observer.observe(root, { childList: true, subtree: true });
  document.addEventListener('click', cause, true);
  document.addEventListener('submit', cause, true);
  return () => {
   observer.disconnect();
   document.removeEventListener('click', cause, true);
   document.removeEventListener('submit', cause, true);
  };
 }, []);
}
