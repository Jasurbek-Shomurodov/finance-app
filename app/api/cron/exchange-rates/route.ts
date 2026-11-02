import { shiftDay } from '@/lib/calendar-days';
import { cronAuthorized } from '@/lib/cron-auth';
import { recordCronRun, runFailure } from '@/lib/cron-runs';
import { depositToday } from '@/lib/deposit-interest';
import { refreshExchangeRates } from '@/lib/exchange-rate-service';
import { reportError } from '@/lib/monitoring';
import { serviceDatabase } from '@/lib/service-role';
export const maxDuration=60;
const route='/api/cron/exchange-rates';
/** The server's daily run, half an hour after the Mac's: the global table is its own to keep, and it asks the official archive only for days the Mac left missing this week. */
export async function GET(req:Request){
 if(!cronAuthorized(req))return new Response(null,{status:401});
 const db=serviceDatabase();
 if(!db)return Response.json({error:'Background capture is not configured.'},{status:503});
 const today=depositToday(),days=Array.from({length:7},(_,back)=>shiftDay(today,back-6));
 return recordCronRun(db,'exchange-rates',async()=>{
  try{
   const result=await refreshExchangeRates(days,{db,today});
   if(result.global==='failed')throw Error('The global exchange rate table was not answered.');
   return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(error){await reportError('cron:exchange-rates',error,{route,status:503},{alert:true});return Response.json({cause:runFailure(error),error:'Exchange rates were not refreshed. The saved rates stay in use.'},{status:503});}
 });
}
