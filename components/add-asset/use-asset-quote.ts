"use client";
import { useRef, useState } from 'react';
import type { Entry } from '@/lib/finance';
import { instrumentFor } from '@/lib/market';
import { quoteKey } from '@/lib/unit-quote';

/** Where the current price of the holding being added stands: nothing asked, on its way, arrived, or why it did not. */
export type QuoteState = { status: 'idle' | 'loading' | 'ready' | 'failed'; /** The failure, as an English key. */ message: string };

/** The price of the holding being added, fetched as soon as it is picked. `read` asks the market for one unit in the
 * holding's own currency; `apply` receives the answer with the key of what it was asked for, so an answer that arrives
 * after the person picked something else is dropped. Nothing is fetched from an effect: `fetch` runs from the pick. */
export function useAssetQuote(read: (target: Entry) => Promise<number>, apply: (key: string, price: number) => void) {
 const [result, setResult] = useState<QuoteState & { key: string }>({ key: '', status: 'idle', message: '' });
 const latest = useRef('');
 async function fetch(target: Entry) {
  if (!instrumentFor(target)) return;
  const key = quoteKey(target);
  latest.current = key;
  setResult({ key, status: 'loading', message: '' });
  try {
   const price = await read(target);
   if (latest.current !== key) return;
   apply(key, price);
   setResult({ key, status: 'ready', message: '' });
  } catch (error) { if (latest.current === key) setResult({ key, status: 'failed', message: (error as Error).message }); }
 }
 /** The state of the quote for `entry` as it is now; another instrument, currency or metal has none yet. */
 const stateFor = (entry: Entry): QuoteState => result.key === quoteKey(entry) ? result : { status: 'idle', message: '' };
 return { fetch, stateFor };
}
