import { isCurrency } from '@/lib/currencies';
import { diversifiedPortfolioSchema, portfolioAssets, portfolioAssetKey } from '@/lib/diversified-portfolio';
import { benchmarkSelectionSchema, stockBenchmarks } from '@/lib/benchmark-selection';
import { signInAgain, tooManyAttempts } from '@/lib/api-route';
import { limits, rateLimited } from '@/lib/rate-limit';
import { session } from '@/lib/supabase';
import { depositToday } from '@/lib/deposit-interest';
import { benchmarkFx } from '@/lib/benchmark-fx';
import { keptHistory } from '@/lib/price-history-cache';
import { cryptoHistory, stockHistory } from '@/lib/price-feeds';
import { afterResponse } from '@/lib/after-response';
import { marketHistoryStart, shiftDay, validDay, type BenchmarkData, type PricePoint } from '@/lib/benchmark-data';

async function loadBenchmarks(req: Request) {
 try {
  const params = new URL(req.url).searchParams;
  const start = params.get('start') ?? '', end = params.get('end') ?? '', custom = params.get('symbol') ?? '';
  if (!validDay(start) || !validDay(end) || start > end || end > depositToday() || start < marketHistoryStart || (custom && !/^[A-Z][A-Z0-9.-]{0,14}$/.test(custom))) return Response.json({ error: 'Choose valid dates ending today or earlier.' }, { status: 400 });
  const data: BenchmarkData = { start, end, prices: {}, fx: [], errors: {} };
  const selected=(params.get('benchmarks')??'SPY,HYG,BTC,depositUZS,depositUSD,CUSTOM').split(',');
  if(!benchmarkSelectionSchema.safeParse(selected).success)return Response.json({error:'Check the comparison settings.'},{status:400});
  const portfolioCrypto=params.get('portfolioCrypto')??'',portfolioStock=params.get('portfolioStock')??'';
  if ((portfolioCrypto&&!/^[A-Z][A-Z0-9]{0,14}$/.test(portfolioCrypto))||(portfolioStock&&!/^[A-Z][A-Z0-9.-]{0,14}$/.test(portfolioStock)))return Response.json({error:'Check the comparison settings.'},{status:400});
  const portfolioParam=params.get('portfolio');
  let portfolioInput:unknown;
  try{portfolioInput=portfolioParam?JSON.parse(portfolioParam):null;}catch{return Response.json({error:'Check the comparison settings.'},{status:400});}
  const parsedPortfolio=portfolioParam?diversifiedPortfolioSchema.safeParse(portfolioInput):null;
  if(parsedPortfolio&&(!parsedPortfolio.success||parsedPortfolio.data.assets?.some(asset=>asset.currency&&!isCurrency(asset.currency))))return Response.json({error:'Check the comparison settings.'},{status:400});
  const portfolio=selected.includes('PORTFOLIO')&&parsedPortfolio?.success?parsedPortfolio.data:null;
  const portfolioRows=portfolio?portfolioAssets(portfolio).filter(asset=>asset.weight>0):[];
  const key = process.env.TWELVE_DATA_API_KEY;
  const histories = new Map<string,Promise<PricePoint[]>>();
  function history(kind:'crypto'|'stock',symbol:string) {
   const id=kind+':'+symbol;
   // Kept closes answer at once; the feeds are asked only for the days not kept yet (lib/price-history-cache.ts).
   if(!histories.has(id))histories.set(id,keptHistory(id,start,end,(from,to)=>kind==='crypto'?cryptoHistory(from,to,symbol):stockHistory(symbol,from,to,key!),{later:afterResponse}));
   return histories.get(id)!;
  }
  const symbols = [...portfolioRows.filter(asset=>asset.kind==='stock').map(asset=>({id:portfolioAssetKey(asset,portfolio!),symbol:asset.symbol})),...stockBenchmarks(selected),{id:'SPY',symbol:'SPY'},{id:'HYG',symbol:'HYG'},{id:'BIL',symbol:'BIL'},...(custom ? [{id:'CUSTOM',symbol:custom}] : []),...(selected.includes('PORTFOLIO')&&portfolioStock?[{id:'portfolioStock',symbol:portfolioStock}]:[])];
  const jobs: (() => Promise<void>)[] = symbols.filter(item=>(selected.includes(item.id)||item.id==='portfolioStock'||portfolioRows.some(asset=>portfolioAssetKey(asset,portfolio!)===item.id))).map(({id,symbol}) => async () => {
   if (!key) { data.errors[id] = 'Stock comparisons need a market-data connection.'; return; }
   try { data.prices[id] = await history('stock',symbol); }
   catch { data.errors[id] = 'Market history is unavailable for this period.'; }
  });
  for(const asset of portfolioRows.filter(asset=>asset.kind==='crypto'))jobs.push(async()=>{const id=portfolioAssetKey(asset,portfolio!);try{data.prices[id]=await history('crypto',asset.symbol);}catch{data.errors[id]='Market history is unavailable for this period.';}});
  if(selected.includes('BTC'))jobs.push(async () => { try { data.prices.BTC = await history('crypto','BTC'); } catch { data.errors.BTC = 'Market history is unavailable for this period.'; } });
  if(selected.includes('PORTFOLIO')&&portfolioCrypto)jobs.push(async()=>{try{data.prices.portfolioCrypto=await history('crypto',portfolioCrypto);}catch{data.errors.portfolioCrypto='Market history is unavailable for this period.';}});
  jobs.push(async () => {
   try { data.fx = await benchmarkFx(start, end, { today: depositToday() }); } catch { data.errors.fx = 'Historical exchange rates are unavailable.'; }
  });
  let index = 0;
  await Promise.all(Array.from({ length: 3 }, async () => { while (index < jobs.length) await jobs[index++](); }));
  for(const asset of portfolioRows){const error=data.errors[portfolioAssetKey(asset,portfolio!)];if(error)data.errors.PORTFOLIO=error;}
  if(data.errors.portfolioStock||data.errors.portfolioCrypto)data.errors.PORTFOLIO=data.errors.portfolioStock??data.errors.portfolioCrypto;
  return Response.json(data, { headers: { 'Cache-Control': Object.keys(data.errors).length ? 'private, no-store' : 'private, max-age=300' } });
 } catch { return Response.json({ error: 'Could not load comparisons.' }, { status: 503 }); }
}

// Anonymous demo access is limited to one fixed public-data request. Coalesce
// concurrent visitors and cache it without exposing arbitrary paid-feed queries.
// Cache the serialized result, never a Response: the Workers runtime binds a
// response body to the request that created it, so reusing or cloning it from a
// later request throws and surfaces as an empty 500.
type DemoResult = { status: number; body: string; cacheControl: string };
const demoFailure = (): DemoResult => ({ status: 503, body: JSON.stringify({ error: 'Could not load comparisons.' }), cacheControl: 'private, no-store' });
let demoCache: { day: string; expires: number; result: Promise<DemoResult> } | null = null;
export async function GET(req: Request) {
 if (new URL(req.url).searchParams.get('demo') === '1') {
  try {
   const day = depositToday();
   if (!demoCache || demoCache.day !== day || demoCache.expires <= Date.now()) {
    const params = new URLSearchParams({ start: shiftDay(day, -365), end: day, benchmarks: 'BTC,SPY,BIL,depositUSD,depositUZS' });
    // A load abandoned with its request may never settle; let a later visitor replace it.
    const entry = { day, expires: Date.now() + 60000, result: Promise.resolve(demoFailure()) };
    entry.result = loadBenchmarks(new Request('https://local/api/benchmarks?' + params)).then(async response => {
     const body = await response.text();
     const result = JSON.parse(body) as BenchmarkData;
     const complete = response.ok && !Object.keys(result.errors ?? {}).length;
     entry.expires = Date.now() + (complete ? 3600000 : 30000);
     return { status: response.status, body, cacheControl: response.headers.get('Cache-Control') ?? 'private, no-store' };
    }).catch(() => {
     entry.expires = Date.now() + 30000;
     return demoFailure();
    });
    demoCache = entry;
   }
   const result = await demoCache.result;
   return new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': result.cacheControl } });
  } catch { return Response.json({ error: 'Could not load comparisons.' }, { status: 503 }); }
 }
 try {
  const auth = await session(); if (!auth) return signInAgain();
  // Each load reads paid market feeds; the sample workspace above shares one cached load instead.
  if (await rateLimited(req, 'benchmarks', limits.benchmarks, auth.user.id, { perIp: false })) return tooManyAttempts();
  return await loadBenchmarks(req);
 } catch { return Response.json({ error: 'Could not load comparisons.' }, { status: 503 }); }
}
