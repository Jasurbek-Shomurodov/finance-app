"use client";
import { useCallback } from 'react';
import { arrivedRows, entranceBlocks, settledBlocks } from '@/lib/arrivals';

/** Long enough for the row's rise and its fading tint (motion.css `row-arrive`, `row-glow`). */
const arrivalMs = 1800;
/** How long after a press or a submit an inserted row still counts as its result (a save waits on the network). */
const causeMs = 4000;
/** What a person presses to change something. */
const pressable = 'button,a,[role=button],[role=menuitem],[role=option],input[type=submit]';

/** A page's entrance plays once after a link or Back, on the first thing it shows; a skeleton swapped for content on the same page arrives
 * settled (`data-settled`), so loading never replays the rise. And every motion has a cause: within a few seconds of a press or a submit, the rows that join a list already on screen
 * (a saved transaction, a new goal, account, schedule or holding) are marked `data-arrived` for the stylesheet to drop
 * them into place. Background refreshes, moves, new pages and whole new lists stay still. One watcher on the workspace
 * covers every screen; the mark is set before paint (mutation observers run before the browser draws), so a row is
 * never drawn in place first and then snapped back. Returns a ref for the element to watch. */
export function useArrivalMarks<T extends HTMLElement>() {
 return useCallback((root: T | null) => {
  if (!root) return;
  let causedUntil = 0;
  // Whether this page's entrance has played: a page already on screen when the watch starts has.
  let entered = !!root.querySelector('.content');
  const cause = (event: Event) => {
   if (event.type === 'submit' || (event.target instanceof Element && event.target.closest(pressable))) causedUntil = performance.now() + causeMs;
   // A link leads to another page, which plays its own entrance.
   if (event.target instanceof Element && event.target.closest('a[href]')) entered = false;
  };
  const back = () => { entered = false; };
  const observer = new MutationObserver(records => {
   const removed = new Set(records.flatMap(record => [...record.removedNodes]));
   const added = records.flatMap(record => [...record.addedNodes]).filter((node): node is Element => node instanceof Element && !removed.has(node));
   const arrived = performance.now() > causedUntil ? [] : arrivedRows(added);
   for (const row of arrived) {
    row.setAttribute('data-arrived', '');
    setTimeout(() => row.removeAttribute('data-arrived'), arrivalMs);
   }
   const blocks = added.flatMap(element => [element, ...element.querySelectorAll(entranceBlocks)]).filter(element => element.matches(entranceBlocks) && !arrived.includes(element));
   const settle = settledBlocks(blocks, entered);
   entered = settle.entered;
   for (const block of settle.settled) block.setAttribute('data-settled', '');
  });
  observer.observe(root, { childList: true, subtree: true });
  document.addEventListener('click', cause, true);
  document.addEventListener('submit', cause, true);
  window.addEventListener('popstate', back);
  return () => {
   window.removeEventListener('popstate', back);
   observer.disconnect();
   document.removeEventListener('click', cause, true);
   document.removeEventListener('submit', cause, true);
  };
 }, []);
}
