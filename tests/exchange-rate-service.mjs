import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const fresh=()=>loadTS('lib/exchange-rate-service.ts',{'./service-role':{serviceDatabase:()=>null}});
const TODAY='2026-11-02',NOW=Date.parse('2026-11-02T05:00:00Z');
const cbuRows=day=>[{Ccy:'USD',Rate:'12000',Nominal:'1',Date:day.split('-').reverse().join('.')},{Ccy:'EUR',Rate:'14000',Nominal:'1',Date:day.split('-').reverse().join('.')}];
const globalBody={result:'success',base_code:'USD',rates:{EUR:.9,INR:88,BAD:-1,lower:2},time_last_update_unix:Date.parse('2026-11-02T00:00:00Z')/1000};
/** A stand-in for the service database, and every write it was asked for. */
function database(days={},ratesAt=null){
 const writes=[];
 const read=async path=>{
  if(path.includes('market_quotes'))return ratesAt?[{fetched_at:ratesAt}]:[];
  const listed=path.match(/day=in\.\((.*?)\)/)?.[1].split(','),from=path.match(/day=gte\.([\d-]+)/)?.[1],to=path.match(/day=lte\.([\d-]+)/)?.[1];
  return Object.entries(days).filter(([day])=>listed?listed.includes(day):day>=from&&day<=to).sort().map(([day,rates])=>({day,rates}));
 };
 return {days,writes,db:{read,write:async(path,init)=>{const rows=JSON.parse(init.body);writes.push({path,rows});if(path.includes('exchange_rate_days'))for(const row of rows)days[row.day]=row.rates;return new Response(null,{status:201});}}};
}
async function withFeeds(feed,run){
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{calls.push(String(url));return feed(String(url),init);};
 try{await run(calls);}finally{globalThis.fetch=original;}
}
const rates=url=>url.includes('er-api')?Response.json(globalBody):Response.json(cbuRows(url.split('/').filter(Boolean).at(-1)));

test('the archive\'s rows become units per dollar, ignoring rows published after the day',()=>{
 const {cbuDayTable}=fresh();
 const rows=[{Ccy:'USD',Rate:'11963.16',Nominal:'1',Date:'14.10.2026'},{Ccy:'EUR',Rate:'13000',Nominal:'1',Date:'14.10.2026'},{Ccy:'JPY',Rate:'800',Nominal:'10',Date:'14.10.2026'},{Ccy:'GBP',Rate:'15000',Nominal:'1',Date:'16.10.2026'}];
 const table=cbuDayTable(rows,'2026-10-15');
 assert.equal(table.USD,1);assert.equal(table.UZS,11963.16);assert.equal(table.EUR,11963.16/13000);assert.equal(table.JPY,11963.16/80);assert.equal(table.GBP,undefined);
 assert.throws(()=>cbuDayTable([{Ccy:'EUR',Rate:'1',Nominal:'1',Date:'14.10.2026'}],'2026-10-15'),/unavailable/,'no dollar, no table');
 assert.throws(()=>cbuDayTable({},'2026-10-15'),/unavailable/);
});

test('a run downloads each missing day once, sets the dollar rate and the global table, and a second run downloads nothing',async()=>{
 const {refreshExchangeRates}=fresh();
 const {db,writes,days}=database({'2026-10-31':{USD:1,UZS:12023.46}});
 await withFeeds(rates,async calls=>{
  const result=await refreshExchangeRates(['2026-10-31','2026-11-01',TODAY],{db,today:TODAY,now:NOW});
  assert.deepEqual(result,{asked:3,kept:2,missing:[],dollar:12000,global:'kept'});
  assert.equal(calls.filter(url=>url.includes('2026-10-31')).length,0,'a kept day is never downloaded');
  assert.equal(calls.length,3,'two days and one global table');
  assert.deepEqual(Object.keys(days).sort(),['2026-10-31','2026-11-01',TODAY]);
  const quotes=writes.at(-1).rows;
  assert.deepEqual(quotes.map(row=>row.key),['fx','rates']);
  assert.deepEqual(quotes[0].data,{rate:12000,date:TODAY,source:'CBU'});
  assert.deepEqual(quotes[1].data.rates,{EUR:.9,INR:88,USD:1},'every rate is per dollar, cut to positive currency codes');
  const again=database(days,new Date(NOW-60_000).toISOString());
  calls.length=0;
  assert.equal((await refreshExchangeRates(['2026-10-31','2026-11-01',TODAY],{db:again.db,today:TODAY,now:NOW})).global,'fresh');
  assert.equal(calls.length,0,'nothing is requested twice');
 });
});

test('a server the archive does not answer rests it, names the missing days and still keeps the global table',async()=>{
 const {refreshExchangeRates,archiveRestMs}=fresh();
 const {db,writes}=database({},new Date(NOW-13*3600_000).toISOString());
 await withFeeds(url=>{if(url.includes('cbu.uz'))throw Object.assign(Error('timed out'),{name:'TimeoutError'});return Response.json(globalBody);},async calls=>{
  const result=await refreshExchangeRates(['2026-11-01',TODAY],{db,today:TODAY,now:NOW});
  assert.deepEqual(result,{asked:2,kept:0,missing:['2026-11-01',TODAY],dollar:null,global:'kept'});
  assert.ok(calls.filter(url=>url.includes('cbu.uz')).length<=2);
  assert.deepEqual(writes.at(-1).rows.map(row=>row.key),['rates']);
  assert.equal(archiveRestMs,600000);
  calls.length=0;
  await refreshExchangeRates(['2026-10-30'],{db,today:TODAY,now:NOW});
  assert.equal(calls.filter(url=>url.includes('cbu.uz')).length,0,'rested: no second wait');
 });
});

test('a refused day stays missing, and a table the feed refuses is reported, never kept',async()=>{
 const {refreshExchangeRates,loadGlobalRates}=fresh();
 const {db,writes}=database();
 await withFeeds(url=>url.includes('cbu.uz')?new Response('',{status:404}):Response.json({...globalBody,base_code:'EUR'}),async()=>{
  const result=await refreshExchangeRates([TODAY],{db,today:TODAY,now:NOW});
  assert.deepEqual(result,{asked:1,kept:0,missing:[TODAY],dollar:null,global:'failed'});
  assert.equal(writes.length,0);
  await assert.rejects(loadGlobalRates());
 });
});

test('a day the database refuses is named as missing',async()=>{
 const {refreshExchangeRates}=fresh();
 const {db}=database({},new Date(NOW).toISOString());
 db.write=async()=>new Response(null,{status:500});
 await withFeeds(rates,async()=>{
  assert.deepEqual((await refreshExchangeRates(['2026-11-01'],{db,today:TODAY,now:NOW})).missing,['2026-11-01']);
 });
});

test('the daily route is the cron\'s alone, asks this week, and reports a failed table',async()=>{
 const asked=[];let answer={global:'kept'};
 const route=()=>loadTS('app/api/cron/exchange-rates/route.ts',{'@/lib/cron-auth':{cronAuthorized:req=>req.headers.has('authorization')},'@/lib/cron-runs':{recordCronRun:(db,job,run)=>run(),runFailure:error=>error.message},'@/lib/monitoring':{reportError:async()=>{}},'@/lib/service-role':{serviceDatabase:()=>({})},'@/lib/deposit-interest':{depositToday:()=>TODAY},'@/lib/exchange-rate-service':{refreshExchangeRates:async(days,deps)=>{asked.push(days);assert.equal(deps.today,TODAY);return answer;}}});
 const {GET}=route(),signed=new Request('https://local/api/cron/exchange-rates',{headers:{authorization:'Bearer x'}});
 assert.equal((await GET(new Request('https://local/api/cron/exchange-rates'))).status,401);
 assert.equal((await GET(signed)).status,200);
 assert.deepEqual([asked[0].length,asked[0][0],asked[0].at(-1)],[7,'2026-10-27',TODAY]);
 answer={global:'failed'};
 assert.equal((await GET(signed)).status,503);
 const none=loadTS('app/api/cron/exchange-rates/route.ts',{'@/lib/cron-auth':{cronAuthorized:()=>true},'@/lib/service-role':{serviceDatabase:()=>null}});
 assert.equal((await none.GET(signed)).status,503);
});
