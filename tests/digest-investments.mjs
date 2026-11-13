import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {ownerInterest,keptMarket,monthInvestmentPnl,reachedAlerts,priceAlertMessage,markReached,ownerHistory,ownerQuotes,ownerPriceAlerts,savePriceAlerts}=loadTS('lib/digest-investments.ts');
const {digestMessage,digestCard}=loadTS('lib/digest-message.ts');
const {cashForecast}=loadTS('lib/cash-forecast.ts');

const today='2026-11-14';
const record=(id,kind,amount,extra={})=>({id,name:id,kind,amount,currency:'USD',quantity:1,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:'',...extra});
const event=(id,record_id,event_type,amount,occurred_on,balance=null)=>({id,record_id,event_type,amount,occurred_on,created_at:occurred_on+'T10:00:00Z',balance,ownership_percentage:100,principal:0,interest:0,notes:''});
const btc=record('btc','Crypto',60000,{name:'BTC',quantity:2,cost:30000});

test('the month\'s investment result leaves out money added and counts income, at kept prices',()=>{
 const market=keptMarket({'Crypto:BTC':{usd:50000,source:'test',fetchedAt:today}},{EUR:.8});
 const records=[record('fund','Retirement account',2300)];
 const events=[event('buy','fund','contribution',1000,'2026-09-01',1000),event('oct','fund','valuation',0,'2026-10-31',1100),event('add','fund','contribution',1000,'2026-11-03',2100),event('pay','fund','income',25,'2026-11-10')];
 // November: 2,300 today − 1,100 at the end of October − 1,000 added + 25 paid.
 assert.equal(monthInvestmentPnl({records,events,market,currency:'USD',today}),225);
 assert.equal(Math.round(monthInvestmentPnl({records,events,market,currency:'EUR',today})),180);
 assert.equal(monthInvestmentPnl({records:[],events:[],market,currency:'USD',today}),null);
 assert.equal(monthInvestmentPnl({records,events,market,currency:'UZS',today}),null,'no rate: unknown, never a partial figure');
 // Interest added to the balance this month is that month's income, once.
 assert.equal(monthInvestmentPnl({records:[record('cd','Deposit',1050)],events:[event('open','cd','contribution',1000,'2026-09-01',1000),event('paid','cd','income',50,'2026-11-05'),event('seen','cd','valuation',0,'2026-11-06',1050)],movements:[{kind:'interest',target_id:'cd',occurred_on:'2026-11-05',target_value:50}],market,currency:'USD',today}),50);
 // A kept quote values the holding: 2 BTC at 50,000 against a 60,000 cost.
 assert.equal(monthInvestmentPnl({records:[btc],events:[event('seen','btc','baseline',0,'2026-03-01',120000)],market,currency:'USD',today}),-20000);
});

test('a reached price alert is announced once, as the holding\'s own price',()=>{
 const market=keptMarket({'Crypto:BTC':{usd:50000,source:'test',fetchedAt:today}},{});
 const alerts=[{id:'a',record_id:'btc',direction:'above',price:45000},{id:'b',record_id:'btc',direction:'below',price:40000},{id:'c',record_id:'btc',direction:'above',price:48000,reached_on:'2026-11-01'},{id:'d',record_id:'gone',direction:'above',price:1}];
 const reached=reachedAlerts(alerts,[btc],market);
 assert.deepEqual(reached.map(item=>[item.alert.id,item.name,item.price]),[['a','BTC',50000]]);
 const text=priceAlertMessage([{...reached[0],name:'<BTC>'}],'en',today);
 assert.match(text,/Price alerts<\/b> · 14 November 2026/);assert.match(text,/&lt;BTC&gt;: rose to \$45,000 · now \$50,000/);
 assert.match(priceAlertMessage([{alert:alerts[1],name:'BTC',currency:'USD',price:39999.5}],'en',today),/fell to \$40,000 · now \$39,999\.5/);
 assert.deepEqual(markReached(alerts,reached,today).map(alert=>alert.reached_on??null),[today,null,'2026-11-01',null]);
});

test('the digest names the investments\' result in its text and as a card figure, and stays silent at zero',()=>{
 const text=digestMessage([],'en',today,{currency:'USD',investments:{monthPnl:-1234.4}});
 assert.match(text,/💼 Investments: −\$1,234 this month/);
 assert.doesNotMatch(digestMessage([],'en',today,{currency:'USD',investments:{monthPnl:.2}}),/💼/);
 const figure=digestCard([],'en',today,{currency:'USD',investments:{monthPnl:500}}).card.figures.find(item=>item.label==='Investments');
 assert.deepEqual([figure.value,figure.tone,figure.detail],['+$500','good','Profit and loss this month']);
 assert.equal(digestCard([],'en',today,{currency:'USD'}).card.figures.length,0);
});

test('the owner reads use the server key for one owner, and a refused save is an error',async()=>{
 const asked=[];
 const db={read:async path=>{asked.push(path);return path.includes('market_quotes')?[{key:'Crypto:BTC',data:{usd:1}}]:path.includes('workspace_preferences')?[{data:{items:[{id:'a'}]}}]:[];},write:async(path,init)=>{asked.push(init.method+' '+path+' '+init.body);return {ok:path.includes('owner-1')};}};
 assert.deepEqual(await ownerHistory(db,'owner-1'),[]);
 assert.deepEqual(await ownerInterest(db,'owner-1'),[]);assert.ok(asked.at(-1).includes('asset_movements')&&asked.at(-1).includes('kind=eq.interest')&&asked.at(-1).includes('user_id=eq.owner-1'));
 assert.deepEqual(await ownerQuotes(db,[btc,record('home','Property',1)]),{'Crypto:BTC':{usd:1}});
 assert.deepEqual(await ownerQuotes(db,[record('home','Property',1)]),{});
 assert.deepEqual(await ownerPriceAlerts(db,'owner-1'),[{id:'a'}]);
 await savePriceAlerts(db,'owner-1',[]);
 await assert.rejects(savePriceAlerts(db,'owner-2',[]));
 assert.ok(asked[0].includes('investment_history')&&asked[0].includes('user_id=eq.owner-1'));
 assert.ok(asked.some(path=>path.includes('key=eq.price_alerts&user_id=eq.owner-1&select=data')));
 assert.ok(asked.some(path=>path.startsWith('PATCH ')&&path.endsWith('{"data":{"items":[]}}')));
 assert.deepEqual(await ownerPriceAlerts({read:async()=>[]},'owner-1'),[]);
});

test('expected payouts move total cash in the forecast, inside the horizon only',()=>{
 const payout=(date,amount=40)=>({key:'payout:bond:'+date,recordId:'bond',name:'Bond',kind:'Bond',date,amount,currency:'USD'});
 const forecast=cashForecast({records:[record('wallet','Cash',100)],occurrences:[],today,days:30,currency:'USD',payouts:[payout('2026-11-20'),payout('2026-12-14'),payout('2026-12-15'),payout('2026-11-13')]});
 assert.deepEqual(forecast.events.map(item=>[item.date,item.amount,item.source,item.accountId]),[['2026-11-20',40,'payout',null],['2026-12-14',40,'payout',null]]);
 assert.equal(forecast.totals[0].end,180);assert.equal(forecast.accounts[0].end,100);
});
