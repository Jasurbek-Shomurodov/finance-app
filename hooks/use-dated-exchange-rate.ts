"use client";
import { useSessionResource } from '@/hooks/use-owner-resource';
import type { DatedExchangeRate } from '@/lib/dated-exchange-rate';
const noQuote:DatedExchangeRate|null=null;
/** A reply for another pair or day, or without a positive rate, is no quote. */
const usableQuote=(answer:DatedExchangeRate,from:string|undefined,to:string|undefined,date:string)=>Number.isFinite(answer.rate)&&answer.rate>0&&answer.from===from&&answer.to===to&&answer.date===date;
/** The official rate of one day between two currencies; fields asking for the same day share one read. */
export function useDatedExchangeRate(from:string|undefined,to:string|undefined,date:string){
 const key=from&&to&&from!==to&&date?`${from}:${to}:${date}`:'';
 const remote=useSessionResource('/api/exchange-rate?'+new URLSearchParams({from:from??'',to:to??'',date}),!!key,0,noQuote);
 const answer=remote.data,usable=!!answer&&usableQuote(answer,from,to,date);
 const quote=usable?answer:undefined;
 const error=remote.error||(answer&&!usable?'Historical exchange rates are unavailable.':undefined);
 return {rate:!key&&from&&to&&from===to?1:quote?.rate??null,quote,error:key?error:undefined,loading:remote.loading,retry:remote.retry};
}
