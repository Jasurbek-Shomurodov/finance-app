"use client";
import { useState, type Dispatch, type SetStateAction } from 'react';
import { fetchMarket } from '@/hooks/use-market';
import type { Entry } from '@/lib/finance';
import { instrumentFor } from '@/lib/market';
import { quoteKey, unitQuote } from '@/lib/unit-quote';

/** The record form's "fetch price": the current quote of the holding being edited, in its own currency. A failure
 * message belongs to the holding it was for and disappears once its name or currency changes. Picking another
 * instrument passes the changed record as `next`, so its price is fetched without a second press. */
export function usePriceFetch(editing: Entry | null, setEditing: Dispatch<SetStateAction<Entry | null>>) {
    const [fetchingPrice, setFetchingPrice] = useState(false);
    const priceKey = editing ? quoteKey(editing) : '';
    const [priceResult, setPriceResult] = useState({key:'',message:''});
    const priceMessage = priceResult.key === priceKey ? priceResult.message : '';
    async function fetchPrice(next?: Entry) {
        const target = next ?? editing;
        if (!target || !instrumentFor(target)) return;
        const key = quoteKey(target);
        setFetchingPrice(true); setPriceResult({key,message:''});
        try {
            const price = unitQuote(target, await fetchMarket([target]));
            setEditing(current => current && quoteKey(current) === key ? { ...current, amount: price } : current);
        } catch (error) { setPriceResult({key,message:(error as Error).message}); }
        finally { setFetchingPrice(false); }
    }
    const resetPrice = () => setPriceResult({key:'',message:''});
    return { fetchPrice, fetchingPrice, priceMessage, resetPrice };
}
