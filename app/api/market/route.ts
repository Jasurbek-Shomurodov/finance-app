import { cachedMarket } from '@/lib/market-cache';
import { afterResponse } from '@/lib/after-response';
import { tooManyAttempts } from '@/lib/api-route';
import { limits, rateLimited } from '@/lib/rate-limit';
import { session } from '@/lib/supabase';
import { coins, isMetalCode } from '@/lib/market';

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const crypto = [...new Set((params.get('crypto') || '').split(',').filter(Boolean))];
  const stocks = [...new Set((params.get('stocks') || '').split(',').filter(Boolean))];
  const metals = [...new Set((params.get('metals') || '').split(',').filter(Boolean))];
  if (crypto.length > 16 || stocks.length > 20 || crypto.some(s => !coins.some(c => c[0] === s)) || stocks.some(s => !/^[A-Z][A-Z0-9.-]{0,14}$/.test(s)) || !metals.every(isMetalCode)) {
    return Response.json({ error: 'Invalid market symbols.' }, { status: 400 });
  }
  // Stock and metal quotes are for signed-in people only; anonymous reads (the sample workspace) are counted per address,
  // and signed-in ones per person, since each stock or metal is one request to the paid quote feed.
  const auth=await session().catch(()=>null),signedIn=!!auth;
  if(auth?await rateLimited(req,'market-user',limits.market,auth.user.id,{perIp:false}):await rateLimited(req,'market',limits.publicMarket))return tooManyAttempts();
  const stockAccess=signedIn&&stocks.length+metals.length>0&&!!process.env.TWELVE_DATA_API_KEY;
  // Metals also have a free source (gold-api.com), so a signed-in reader gets them without the market-data key.
  // Kept prices answer at once; only a feed nobody holds yet is fetched before replying (lib/market-cache.ts).
  const data=await cachedMarket({fx:true,rates:true,crypto,stocks,metals,stockAccess,metalAccess:signedIn&&metals.length>0},{later:afterResponse});
  return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
}
