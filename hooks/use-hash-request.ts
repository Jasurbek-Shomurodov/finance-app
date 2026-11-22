"use client";
import { useEffect } from 'react';

/** Answers a link that arrives with an anchor (`/transactions#rules`, `/income-expenses#flow`): calls `open` once when
 * the address carries `hash`, then clears it, so going back or reloading does not open it again. The router sets the
 * address after the page first renders, so it is read after every render until it is found. */
export function useHashRequest(hash: string, open: () => void, enabled = true) {
 useEffect(() => {
  const check = () => {
   if (!enabled || window.location.hash !== hash) return;
   window.history.replaceState(null, '', window.location.pathname + window.location.search);
   open();
  };
  check();
  window.addEventListener('hashchange', check);
  return () => window.removeEventListener('hashchange', check);
 });
}
