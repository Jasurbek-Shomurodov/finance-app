"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Entry } from '@/lib/finance';
import { instrumentFor, marketSymbols, type MarketData } from '@/lib/market';
import { refreshRead } from '@/lib/refresh-read';

/** A failed request leaves its symbols on their saved prices, each with the same note. */
const markUnavailable = (market: MarketData, keys: string[]) => { for (const key of keys) market.errors[key] = 'Price unavailable. Saved price is shown.'; };
export async function fetchMarket(entries: Array<Pick<Entry, 'kind' | 'name' | 'metal'>>, signal?: AbortSignal): Promise<MarketData> {
  const { crypto, stocks, metals } = marketSymbols(entries);
  const combined: MarketData = { fx:null, quotes:{}, errors:{}, stocksConfigured:false };
  let completed=0;
  // Keep each request within the endpoint limits and avoid parallel quota spikes.
  const batches=Math.max(1,Math.ceil(crypto.length/16),Math.ceil(stocks.length/20));
  for(let index=0;index<batches;index++){
    if(signal?.aborted)throw signal.reason??new Error('Aborted');
    const coinBatch=crypto.slice(index*16,(index+1)*16),stockBatch=stocks.slice(index*20,(index+1)*20);
    // The four metals fit in the first request.
    const params=new URLSearchParams({crypto:coinBatch.join(','),stocks:stockBatch.join(','),...(index===0&&metals.length?{metals:metals.join(',')}:{})});
    try{
      const response=await refreshRead('/api/market?'+params,{signal});
      if(!response.ok)throw new Error('Market prices unavailable. Saved prices are shown.');
      const result=await response.json() as MarketData;
      completed++;
      combined.fx=result.fx??combined.fx;
      if(result.rates){combined.rates={...combined.rates,...result.rates};combined.ratesDate=result.ratesDate??combined.ratesDate;}
      Object.assign(combined.quotes,result.quotes);
      Object.assign(combined.errors,result.errors);
      combined.stocksConfigured ||= result.stocksConfigured;
    }catch(error){
      if(signal?.aborted)throw error;
      markUnavailable(combined,[...coinBatch.map(symbol=>`Crypto:${symbol}`),...stockBatch.map(symbol=>`Stock:${symbol}`),...(index===0?metals.map(symbol=>`Metal:${symbol}`):[])]);
    }
  }
  if(!completed)throw new Error('Market prices unavailable. Saved prices are shown.');
  if(combined.fx){combined.rates={...combined.rates,USD:1,UZS:combined.fx.rate};delete combined.errors.fx;}
  if(combined.rates)delete combined.errors.rates;
  return combined;
}
export function useMarket(entries: Entry[], enabled: boolean) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshId, setRefreshId] = useState(0);
  // Whether an answer has been shown since the market was switched on; until then the rates go first.
  const answered = useRef(false);
  // Each instrument once, in a fixed order: the same holdings read from another list ask for nothing new.
  const signature = useMemo(() => JSON.stringify([...new Set(entries.filter(e => instrumentFor(e)).map(e => JSON.stringify({ kind: e.kind, name: e.name, metal: e.metal })))].sort()), [entries]);
  // The holdings the last full read priced. Until it covers the current ones the market reads as loading, even in the
  // render before the effect below starts, so a snapshot (usePortfolioSnapshots) is never posted on saved prices and
  // then cancelled and posted again once the quotes start.
  const [priced, setPriced] = useState<string | null>(null);
  if (!enabled && market !== null) setMarket(null);
  if (!enabled && priced !== null) setPriced(null);
  const refresh = useCallback(() => setRefreshId(id => id + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let running = false;
    const load = async () => {
      if (running) return;
      running = true; setLoading(true); setError('');
      const entries = (JSON.parse(signature) as string[]).map(entry => JSON.parse(entry));
      // The first paint needs the exchange rates, not every holding's quote: with holdings to price, the rates are
      // read alone first (one quick request) and shown; the quotes follow and fill in. Until they do, each holding
      // stands at its saved price. A failed rates-only read is no loss: the full read below brings them too.
      if (entries.length && !answered.current) {
        try { const rates = await fetchMarket([], controller.signal); if (!controller.signal.aborted) { answered.current = true; setMarket(current => current ?? rates); } }
        catch { if (controller.signal.aborted) return; }
      }
      try { const data = await fetchMarket(entries, controller.signal); if (!controller.signal.aborted) { answered.current = true; setMarket(data); } }
      // A failed refresh keeps the last good answer: rates already on screen do not vanish until the next one.
      catch { if (!controller.signal.aborted) setError('Market prices unavailable. Saved prices are shown.'); }
      finally { running = false; if (!controller.signal.aborted) { setLoading(false); setPriced(signature); } }
    };
    void load();
    const interval = setInterval(() => { if (!document.hidden) void load(); }, 300000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [signature, enabled, refreshId]);
  useEffect(() => { if (!enabled) answered.current = false; }, [enabled]);
  return { market: enabled ? market : null, loading: enabled && (loading || priced !== signature), error: enabled ? error : '', refresh };
}
