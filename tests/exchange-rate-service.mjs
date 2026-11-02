import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const fresh=()=>loadTS('lib/exchange-rate-service.ts',{'./service-role':{serviceDatabase:()=>null}});
const TODAY='2026-11-02',NOW=Date.parse('2026-11-02T06:00:00Z');
const dayFile=day=>({date:day,usd:{usd:1,uzs:12033.43,eur:.89,inr:95,btc:.00001,xau:.0003,gbp:0}});
const dayOf=url=>url.match(/@(\d{4}-\d{2}-\d{2})\/|\/\/(\d{4}-\d{2}-\d{2})\./).slice(1).find(Boolean);
const globalBody={result:'success',base_code:'USD',rates:{EUR:.9,INR:88,BAD:-1,lower:2},time_last_update_unix:Date.parse('2026-11-02T00:00:00Z')/1000};
/** A stand-in for the service database, and every write it was asked for. */
function database(days={},ratesAt=null){
 const writes=[];
 const read=async path=>{
  if(path.includes('market_quotes'))return ratesAt?[{fetched_at:ratesAt}]:[];
  const list=Object.entries(days).sort().map(([day,row])=>({day,...row}));
  if(path.includes('fetched_at=lt'))return list.filter(row=>row.old).reverse().slice(0,Number(path.match(/limit=(\d+)/)[1]));
  if(path.includes('order=day.desc'))return list.reverse().slice(0,1);
  const from=path.match(/day=gte\.([\d-]+)/)?.[1],to=path.match(/day=lte\.([\d-]+)/)?.[1];
  return list.filter(row=>row.day>=from&&row.day<=to);
 };
 return {days,writes,db:{read,write:async(path,init)=>{const rows=JSON.parse(init.body);writes.push({path,rows});if(path.includes('exchange_rate_days'))for(const row of rows)days[row.day]={rates:row.rates,source:row.source,saved:row.fetched_at};return new Response(null,{status:201});}}};
}
async function withFeeds(feed,run){
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{calls.push(String(url));return feed(String(url),init);};
 try{await run(calls);}finally{globalThis.fetch=original;}
}
const feed=url=>url.includes('er-api')?Response.json(globalBody):Response.json(dayFile(dayOf(url)));

test('a dated file becomes units of each catalogue currency per dollar, and a wrong day or no sum is refused',()=>{
 const {usdDayTable}=fresh();
 assert.deepEqual(usdDayTable(dayFile(TODAY),TODAY),{USD:1,UZS:12033.43,EUR:.89,INR:95});
 assert.throws(()=>usdDayTable(dayFile('2026-11-01'),TODAY),/unavailable/);
 assert.throws(()=>usdDayTable({date:TODAY,usd:{eur:.9}},TODAY),/unavailable/);
 assert.throws(()=>usdDayTable(null,TODAY),/unavailable/);
});

test('a run downloads each missing day once and names its source, sets the dollar rate and the table, and a second run downloads nothing',async()=>{
 const {refreshExchangeRates}=fresh();
 const {db,writes,days}=database({'2026-10-31':{rates:{USD:1,UZS:12023.46},source:'CBU'}});
 await withFeeds(feed,async calls=>{
  const result=await refreshExchangeRates(['2026-10-31','2026-11-01',TODAY],{db,today:TODAY,now:NOW});
  assert.deepEqual(result,{asked:3,kept:2,missing:[],completed:0,dollar:12033.43,global:'kept'});
  assert.equal(calls.filter(url=>url.includes('2026-10-31')).length,0,'a kept day is never downloaded');
  assert.equal(calls.length,3,'two days and one global table');
  assert.ok(calls.every(url=>!url.includes('cbu.uz')));
  assert.equal(days[TODAY].source,'Currency API');assert.equal(days['2026-10-31'].source,'CBU','a saved day keeps its source');
  const quotes=writes.at(-1).rows;
  assert.deepEqual(quotes.map(row=>row.key),['fx','rates']);
  assert.deepEqual(quotes[0].data,{rate:12033.43,date:TODAY,source:'Currency API'});
  assert.deepEqual(quotes[1].data.rates,{EUR:.9,INR:88,USD:1});
  const again=database(days,new Date(NOW-60_000).toISOString());
  calls.length=0;
  assert.equal((await refreshExchangeRates(['2026-10-31','2026-11-01',TODAY],{db:again.db,today:TODAY,now:NOW})).global,'fresh');
  assert.equal(calls.length,0,'nothing is requested twice');
 });
});

test('the second host answers when the first does not, and a day neither has stays missing',async()=>{
 const {refreshExchangeRates}=fresh();
 const {db,days}=database({},new Date(NOW).toISOString());
 await withFeeds(url=>{if(url.includes('jsdelivr'))throw Error('down');if(url.includes(TODAY))return new Response('',{status:404});return feed(url);},async()=>{
  const result=await refreshExchangeRates(['2026-11-01',TODAY],{db,today:TODAY,now:NOW});
  assert.deepEqual(result,{asked:2,kept:1,missing:[TODAY],completed:0,dollar:12033.43,global:'fresh'});
  assert.deepEqual(Object.keys(days),['2026-11-01']);
 });
});

test('a table the feed refuses is reported, never kept, and an old saved day sets no dollar rate',async()=>{
 const {refreshExchangeRates,loadGlobalRates}=fresh();
 const {db,writes}=database({'2026-01-01':{rates:{USD:1,UZS:12000},source:'CBU'}});
 await withFeeds(url=>url.includes('er-api')?Response.json({...globalBody,base_code:'EUR'}):new Response('',{status:404}),async()=>{
  assert.deepEqual(await refreshExchangeRates([TODAY],{db,today:TODAY,now:NOW}),{asked:1,kept:0,missing:[TODAY],completed:0,dollar:null,global:'failed'});
  assert.equal(writes.length,0);
  await assert.rejects(loadGlobalRates());
 });
});

test('a day the database refuses is named as missing',async()=>{
 const {refreshExchangeRates}=fresh();
 const {db}=database({},new Date(NOW).toISOString());
 db.write=async()=>new Response(null,{status:500});
 await withFeeds(feed,async()=>{
  assert.deepEqual((await refreshExchangeRates(['2026-11-01'],{db,today:TODAY,now:NOW})).missing,['2026-11-01']);
 });
});

test('older days gain the currencies they lack once: every saved rate and source stays, and a run is bounded',async()=>{
 const {completeOlderDays,refreshExchangeRates}=fresh();
 const saved={};
 for(let n=1;n<=70;n++)saved[`2025-01-${String(n%28+1).padStart(2,'0')}`.replace('2025-01',`2025-${String(Math.ceil(n/28)).padStart(2,'0')}`)]={rates:{USD:1,UZS:12000,EUR:.8},source:'CBU',old:true};
 const {db,days,writes}=database(saved);
 await withFeeds(feed,async calls=>{
  assert.equal(await completeOlderDays(db,'2026-11-03T00:00:00Z'),60);
  assert.equal(calls.length,60,'at most sixty downloads a run');
  const [day]=writes[0].rows.map(row=>row.day);
  assert.deepEqual(days[day].rates,{USD:1,UZS:12000,EUR:.8,INR:95},'a saved rate is never replaced');
  assert.equal(days[day].source,'CBU');assert.equal(writes[0].rows[0].fetched_at,'2026-11-03T00:00:00Z','so the day is not asked again');
 });
 // A day the provider has no file for is marked too; one it could not be asked about stays for the next run.
 const gap=database({'2025-03-01':{rates:{USD:1,UZS:1},source:'CBU',old:true},'2025-03-02':{rates:{USD:1,UZS:2},source:'CBU',old:true}});
 await withFeeds(url=>{if(url.includes('2025-03-01'))return new Response('',{status:404});throw Error('down');},async()=>{
  assert.equal(await completeOlderDays(gap.db),1);
  assert.deepEqual(gap.writes[0].rows.map(row=>[row.day,row.rates.UZS]),[['2025-03-01',1]]);
 });
 const refused=database({'2025-03-01':{rates:{USD:1,UZS:1},source:'CBU',old:true}});
 refused.db.write=async()=>new Response(null,{status:500});
 await withFeeds(feed,async()=>assert.equal(await completeOlderDays(refused.db),0));
 // A failure here never fails the day's download.
 const {db:broken}=database({},new Date(NOW).toISOString());
 const read=broken.read;broken.read=path=>path.includes('fetched_at=lt')?Promise.reject(Error('down')):read(path);
 await withFeeds(feed,async()=>assert.equal((await refreshExchangeRates([TODAY],{db:broken,today:TODAY,now:NOW})).completed,0));
});

test('a new currency moves catalogueChangedAt, so saved days are completed for it',()=>{
 const {fiatCurrencies}=loadTS('lib/currencies.ts');
 assert.equal(fiatCurrencies.length,156,'the catalogue changed: move catalogueChangedAt in lib/exchange-rate-service.ts to now, then update this count');
});

test('the daily route is the cron\'s alone, asks this week, and reports a failed table',async()=>{
 const asked=[];let answer={global:'kept',dollar:12000};
 const route=()=>loadTS('app/api/cron/exchange-rates/route.ts',{'@/lib/cron-auth':{cronAuthorized:req=>req.headers.has('authorization')},'@/lib/cron-runs':{recordCronRun:(db,job,run)=>run(),runFailure:error=>error.message},'@/lib/monitoring':{reportError:async()=>{}},'@/lib/service-role':{serviceDatabase:()=>({})},'@/lib/deposit-interest':{depositToday:()=>TODAY},'@/lib/exchange-rate-service':{refreshExchangeRates:async(days,deps)=>{asked.push(days);assert.equal(deps.today,TODAY);return answer;}}});
 const {GET}=route(),signed=new Request('https://local/api/cron/exchange-rates',{headers:{authorization:'Bearer x'}});
 assert.equal((await GET(new Request('https://local/api/cron/exchange-rates'))).status,401);
 assert.equal((await GET(signed)).status,200);
 assert.deepEqual([asked[0].length,asked[0][0],asked[0].at(-1)],[7,'2026-10-27',TODAY]);
 answer={global:'failed',dollar:12000};
 assert.equal((await GET(signed)).status,503);
 answer={global:'fresh',dollar:null};
 assert.equal((await GET(signed)).status,503);
 const none=loadTS('app/api/cron/exchange-rates/route.ts',{'@/lib/cron-auth':{cronAuthorized:()=>true},'@/lib/service-role':{serviceDatabase:()=>null}});
 assert.equal((await none.GET(signed)).status,503);
});
