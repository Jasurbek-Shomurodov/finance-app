import { isoDate } from '@/lib/api-validation';
import { signInAgain } from '@/lib/api-route';
import type { Entry } from '@/lib/finance';
import { propertyPaymentsFilter } from '@/lib/property-totals';
import { readOwnerRows } from '@/lib/server-records';
import { session } from '@/lib/supabase';
import { preferredCurrencies, withViewerDayRates } from '@/lib/viewer-day-rates';

/** What a Property's year figures add: payments dated `from` on and the schedules they may name, each with its day's rates. */
export async function GET(req:Request){
 try{
  const auth=await session();if(!auth)return signInAgain();
  const from=new URL(req.url).searchParams.get('from');
  if(!isoDate.safeParse(from).success)return Response.json({error:'Invalid review month.'},{status:400});
  // The currencies the rates are dated in are read beside the payments, not after them.
  const [records,currencies]=await Promise.all([readOwnerRows<Entry>('finance_records',auth.token,propertyPaymentsFilter(from!)),preferredCurrencies(auth)]);
  return Response.json(await withViewerDayRates({records},auth,Promise.resolve(currencies)),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load planning data. Check that the latest migrations are installed.'},{status:503});}
}
