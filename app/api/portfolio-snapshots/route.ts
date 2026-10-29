import { cachedMarket } from '@/lib/market-cache';
import { afterResponse } from '@/lib/after-response';
import { marketSymbols } from '@/lib/market';
import { crossSite,postgrestFailure,signInAgain,tooManyAttempts } from '@/lib/api-route';
import { limits,rateLimited } from '@/lib/rate-limit';
import { pagePath,readAllPages } from '@/lib/owner-rows';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { snapshotTotals } from '@/lib/portfolio-snapshots';
import type { Entry } from '@/lib/finance';
import { trackedKinds } from '@/lib/investment-history';
export async function GET(){
 try{
  const auth=await session();if(!auth)return signInAgain();
  const snapshots=await readAllPages(range=>supa(pagePath('/rest/v1/portfolio_snapshots?select=occurred_on,assets,debt,rates,updated_at&order=occurred_on.asc',range),{},auth.token));
  return Response.json({snapshots},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Daily portfolio history is awaiting setup.'},{status:503});}
}
const notSaved='Could not save today’s portfolio. Live values are still shown.';
export async function POST(req:Request){
 if(!sameOrigin(req))return crossSite();
 try{
  const auth=await session();if(!auth)return signInAgain();
  // Saving reads live quotes from the paid market feed, so it shares the person's market limit.
  if(await rateLimited(req,'market-user',limits.market,auth.user.id,{perIp:false}))return tooManyAttempts();
  const params=new URLSearchParams({select:'*',kind:`in.(${trackedKinds.join(',')})`,order:'id.asc'});
  const records=await readAllPages<Entry>(range=>supa(pagePath('/rest/v1/finance_records?'+params,range),{},auth.token));
  const symbols=marketSymbols(records);
  // The same kept prices the dashboard shows, so the saved day matches what the person sees.
  const market=await cachedMarket({fx:true,rates:true,...symbols,stockAccess:true,metalAccess:true},{later:afterResponse});
  const totals=snapshotTotals(records,market);
  if(!totals)return Response.json({error:'Complete prices and exchange rates are needed to save today’s portfolio.'},{status:409});
  const response=await supa('/rest/v1/rpc/capture_portfolio_snapshot',{method:'POST',body:JSON.stringify({p_assets:totals.assets,p_debt:totals.debt,p_rates:totals.rates})},auth.token);
  // The database's refusal keeps its status and words (a view-only member answers 403); only a missing function is a setup problem.
  if(!response.ok)return postgrestFailure(response,notSaved,{codes:{PGRST202:[notSaved,503]}});
  return Response.json({snapshot:await response.json()},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:notSaved},{status:503});}
}
