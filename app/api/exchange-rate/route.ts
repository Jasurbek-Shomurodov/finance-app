import { isoDate } from '@/lib/api-validation';
import { signInAgain, tooManyAttempts } from '@/lib/api-route';
import { limits, rateLimited } from '@/lib/rate-limit';
import { session } from '@/lib/supabase';
import { isCurrency } from '@/lib/currencies';
import { depositToday } from '@/lib/deposit-interest';
import { loadDatedExchangeRate } from '@/lib/dated-exchange-rate';
import { dayTables } from '@/lib/day-rate-tables';
import { after } from 'next/server';

/** At most this many days in one read of `days`. */
const maxDays=400;
/** Several days' official rates in `currencies` (`?days=…&currencies=…`): what a report adding past transactions converts with. */
async function daysAnswer(params:URLSearchParams){
 const days=(params.get('days')??'').split(',').filter(Boolean),currencies=(params.get('currencies')??'').split(',').filter(Boolean);
 if(!days.length||days.length>maxDays||!days.every(day=>isoDate.safeParse(day).success&&day<=depositToday())||!currencies.length||currencies.length>20||!currencies.every(isCurrency))return Response.json({error:'Choose valid dates ending today or earlier.'},{status:400});
 const shown=new Set(['USD',...currencies]);
 const tables=await dayTables(days,{today:depositToday(),later:work=>{try{after(work);}catch{void work();}}});
 const answer=Object.fromEntries([...tables].map(([day,table])=>[day,Object.fromEntries(Object.entries(table).filter(([currency])=>shown.has(currency)))]));
 return Response.json({days:answer},{headers:{'Cache-Control':'private, no-store'}});
}
export async function GET(req:Request){
 try{
  const auth=await session();if(!auth)return signInAgain();
  // Each uncached day is a request to the rate feeds, so readers share the signed-in market limit.
  if(await rateLimited(req,'market-user',limits.market,auth.user.id,{perIp:false}))return tooManyAttempts();
  const params=new URL(req.url).searchParams,from=params.get('from')??'',to=params.get('to')??'',date=params.get('date')??'';
  if(params.has('days'))return await daysAnswer(params);
  if(!isCurrency(from)||!isCurrency(to)||!isoDate.safeParse(date).success||date>depositToday())return Response.json({error:'Choose valid dates ending today or earlier.'},{status:400});
  return Response.json(await loadDatedExchangeRate(from,to,date),{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Historical exchange rates are unavailable.'},{status:503});}
}
