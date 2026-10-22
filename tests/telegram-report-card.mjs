import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
import {deliveryTable,recordsFor} from './helpers/telegram-cron.mjs';
const {reportCardSvg,wrapText,estimateWidth,cardLanguage,drawable}=loadTS('lib/report-card.ts');
const {digestCard}=loadTS('lib/digest-message.ts');
const {recapCard,recapMessage}=loadTS('lib/recap-message.ts');
const {monthlyCard,monthlyMessage}=loadTS('lib/monthly-message.ts');
const today='2026-10-19';
const record=(name,kind,amount,currency='UZS')=>({id:name,name,kind,amount,currency,date:today,frequency:'Monthly',quantity:0,cost:0,rate:0,notes:''});
const items=[
 {amount:50000000,key:'a',record:record('Debt for Tracker car','Loan',50000000),date:'2026-10-05',overdue:true,type:'repayment'},
 {amount:1000000,key:'b',record:record('Sheep feed','Living expense',1000000),date:'2026-10-21',overdue:false,type:'scheduled'},
 {amount:5000000,key:'c',record:record('Solar Panel','Rent income',5000000),date:'2026-10-25',overdue:false,type:'scheduled'},
];
const history=[{date:'2026-09-19',net:309460},{date:'2026-10-05',net:311000},{date:'2026-10-19',net:314690}];
const extras={name:'HOGGISH',currency:'USD',netWorth:{amount:314690,history},cashflow:{income:4200,spending:3270,previousSpending:3810,categories:[
 {key:'Living expense',label:'Living expense',amount:1240},{key:'Rent expense',label:'Rent expense',amount:800},{key:'c-feed',label:'Sheep feed',amount:520},
 {key:'Charity',label:'Charity',amount:300},{key:'c-car',label:'Car',amount:210},{key:'Other expense',label:'Other expense',amount:120},{key:'c-x',label:'Phone',amount:80}]}};

test('the digest card shows the last 30 days as tiles, net worth\'s line, expenses by category and the next payments',()=>{
 const {categoryColor}=loadTS('lib/category-colors.ts');
 const {card,caption}=digestCard(items,'en',today,extras);
 assert.equal(caption,'☀️ <b>Good morning, HOGGISH</b>');
 assert.equal(card.title,'Good morning, HOGGISH');
 assert.equal(card.subtitle,undefined);assert.equal(card.note,undefined);assert.equal(card.tilesTitle,'Last 30 days');assert.equal(card.sectionsTitle,'Upcoming payments');
 assert.deepEqual(card.tiles,[
  {label:'Income',value:'$4,200'},
  // Spending is stated plainly either way, never coloured as good or bad news.
  {label:'Expenses',value:'$3,270',detail:'$540 less than the 30 days before'},
  {label:'Saved',value:'$930',detail:'22% of income',tone:'good'},
  {label:'Net worth',value:'$314,690',detail:'+$5,230 in 30 days',tone:'good'},
 ]);
 assert.deepEqual(card.charts[0],{kind:'line',title:'Net worth, last 30 days',values:[309460,311000,314690],from:{label:'19 September 2026',value:'$309,460'},to:{label:'Today',value:'$314,690'}});
 const bars=card.charts[1];
 assert.equal(bars.title,'Expenses by category');
 // The five largest keep their own colour; the rest fold into one Other bar.
 assert.deepEqual(bars.bars.map(bar=>[bar.label,bar.value,bar.share]),[['Living expense','$1,240','38%'],['Rent expense','$800','24%'],['Sheep feed','$520','16%'],['Charity','$300','9%'],['Car','$210','6%'],['Other','$200','6%']]);
 assert.equal(bars.bars[0].color,categoryColor('Living expense'));assert.equal(bars.bars[2].color,categoryColor('c-feed'));
 assert.equal(digestCard(items,'en',today,{...extras,netWorth:{amount:1,history:[{date:'2026-10-01',net:5},{date:'2026-10-18',net:1}]}}).card.charts[0].tone,'bad');
 assert.deepEqual(card.sections,[
  {title:'Overdue',tone:'bad',rows:[{label:'Debt for Tracker car',value:'UZS 50,000,000',detail:'repayment · 5 October 2026'}]},
  {title:'21 October 2026',rows:[{label:'Sheep feed',value:'UZS 1,000,000'}]},
  {title:'25 October 2026',rows:[{label:'Solar Panel',value:'+UZS 5,000,000',detail:'income',tone:'good'}]},
 ]);
 assert.equal(card.footer,undefined);
});

test('a digest card with nothing due says so, a name is escaped only in the HTML caption, and a long list says what it left out',()=>{
 const empty=digestCard([],'en',today,{name:'<b>X</b>'});
 assert.deepEqual(empty.card.lines,['Nothing is due soon.']);assert.deepEqual(empty.card.tiles,[]);assert.deepEqual(empty.card.charts,[]);assert.equal(empty.card.tilesTitle,undefined);
 assert.equal(empty.card.title,'Good morning, <b>X</b>');assert.equal(empty.caption,'☀️ <b>Good morning, &lt;b&gt;X&lt;/b&gt;</b>');
 const many=Array.from({length:40},(_,index)=>({...items[1],key:'k'+index,record:record('Bill '+index,'Living expense',1000)}));
 const long=digestCard(many,'en',today).card;
 assert.equal(long.sections.flatMap(section=>section.rows).length,6);assert.equal(long.footer,'34 more');
 assert.equal(digestCard([],'ru',today,{name:'Анна'}).card.title,'Доброе утро, Анна');
});

test('the recap card shows the week as tiles with the share button, and a quiet week keeps its text',()=>{
 const input={name:'Aziz',currency:'USD',from:'2026-09-28',to:'2026-10-04',income:1000,spending:420,top:{label:'Living expense',amount:200},goalsMoved:2,shareOrigin:'https://hoggish.app'};
 const picture=recapCard(input,'en');
 assert.equal(picture.caption,'📊 <b>Your week, Aziz</b>');
 assert.equal(picture.card.subtitle,'28 September 2026 – 4 October 2026');
 assert.deepEqual(picture.card.tiles,[{label:'Saved',value:'$580',tone:'good'},{label:'Income',value:'$1,000'},{label:'Spending',value:'$420'},{label:'Top spending',value:'$200',detail:'Living expense'}]);
 assert.deepEqual(picture.card.lines,['Goals moved forward: 2']);
 assert.deepEqual(picture.keyboard,recapMessage(input,'en').keyboard);
 assert.deepEqual(recapCard({...input,income:100,spending:400},'en').card.tiles[0],{label:'Saved',value:'−$300',tone:'bad'});
 assert.deepEqual(recapCard({...input,missing:1},'en').card.tiles,[{label:'Saved',value:'—',detail:'Exchange rate unavailable.'}]);
 assert.equal(recapCard({...input,income:0,spending:0,goalsMoved:0,top:null},'en'),null);
});

const month={name:'Aziz',currency:'USD',month:'2026-09-01',income:3000,spending:1800,previous:{spending:2000},categories:[{label:'Living expense',amount:900},{label:'Pets',amount:450}],netWorth:{amount:314690,change:5200}};
test('the monthly report states the month\'s saving, spending against the month before, the top categories and net worth',()=>{
 assert.equal(monthlyMessage(month,'en'),[
  '📅 <b>Your month, Aziz</b>','September 2026','',
  '💰 You saved $1,200 this month.',
  '🧾 Spending: $1,800 · $200 less than the month before',
  '🏷 Top spending: Living expense · $900',
  '🏷 Top spending: Pets · $450',
  '📈 Net worth: $314,690 · +$5,200 this month',
 ].join('\n'));
 const {card,caption}=monthlyCard(month,'en');
 assert.equal(caption,'📅 <b>Your month, Aziz</b> · September 2026');
 assert.equal(card.subtitle,'September 2026');
 assert.deepEqual(card.tiles,[
  {label:'Saved',value:'$1,200',tone:'good'},{label:'Income',value:'$3,000'},
  {label:'Spending',value:'$1,800',detail:'$200 less than the month before'},
  {label:'Net worth',value:'$314,690',detail:'+$5,200 this month',tone:'good'},
 ]);
 assert.deepEqual(card.sections,[{title:'Top spending',rows:[{label:'Living expense',value:'$900',detail:'50%'},{label:'Pets',value:'$450',detail:'25%'}]}]);
 assert.match(monthlyMessage({...month,income:1000,previous:{spending:1000}},'en'),/You spent \$800 more than you earned this month\.\n🧾 Spending: \$1,800 · \$800 more than the month before/);
 assert.ok(monthlyMessage({...month,name:'',netWorth:undefined},'ru').startsWith('📅 <b>Ваш месяц</b>\n'));
});

test('a quiet, incomplete or first month never shows a guessed total or comparison',()=>{
 const quiet=monthlyCard({...month,income:0,spending:0,categories:[],netWorth:undefined},'en').card;
 assert.deepEqual(quiet.lines,["A quiet month. Add this month's records to see your report."]);assert.deepEqual(quiet.tiles,[]);
 const missing=monthlyCard({...month,missing:2},'en').card;
 assert.deepEqual(missing.tiles[0],{label:'Saved',value:'—',detail:'Exchange rate unavailable.'});assert.equal(missing.sections,undefined);
 assert.match(monthlyMessage({...month,missing:2},'en'),/💰 Saved: Exchange rate unavailable\.\n📈 Net worth/);
 // The month before was incomplete or empty: the spending stands alone.
 for(const previous of [{spending:2000,missing:1},{spending:0},undefined])assert.deepEqual(monthlyCard({...month,previous},'en').card.tiles[2],{label:'Spending',value:'$1,800'});
 assert.deepEqual(monthlyCard({...month,netWorth:{amount:100,change:null}},'en').card.tiles[3],{label:'Net worth',value:'$100'});
 assert.deepEqual(monthlyCard({...month,netWorth:{amount:100,change:-40}},'en').card.tiles[3],{label:'Net worth',value:'$100',detail:'−$40 this month',tone:'bad'});
});

test('the card wraps long text, escapes names and draws what the bundled font has',()=>{
 assert.deepEqual(wrapText('one two three',estimateWidth('one two',10)+1,10,estimateWidth),['one two','three']);
 assert.deepEqual(wrapText('a b c d e f',estimateWidth('a b',10)+1,10,estimateWidth,{limit:2}),['a b','c…']);
 assert.deepEqual(wrapText('abcdefgh',estimateWidth('abc',10)+1,10,estimateWidth),['abc','def','gh']);
 assert.equal(drawable('−$422'),'–$422');
 const svg=reportCardSvg({title:'Good morning, <Ann & Bob>',tiles:[{label:'Net worth',value:'−$5'}],sections:[{title:'Today',rows:[{label:'Rent "flat"',value:'$1'}]},{title:'Empty',rows:[]}],lines:['Nothing is due soon.'],footer:'3 more'});
 assert.match(svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1080" height="\d+"/);
 assert.match(svg,/Good morning, &lt;Ann &amp; Bob&gt;/);assert.match(svg,/Rent &quot;flat&quot;/);assert.match(svg,/–\$5/);assert.doesNotMatch(svg,/−/);
 assert.match(svg,/NET WORTH/);assert.match(svg,/3 more/);assert.doesNotMatch(svg,/EMPTY/,'a section without rows is left out');
 // A tile alone on its row takes the whole width.
 assert.match(svg,/<rect x="88" y="\d+" width="904"/);
 const height=card=>Number(/height="(\d+)"/.exec(reportCardSvg(card))[1]);
 assert.ok(height({title:'T',sections:[{title:'S',rows:[{label:'a',value:'1'},{label:'b',value:'2'}]}]})>height({title:'T',sections:[{title:'S',rows:[{label:'a',value:'1'}]}]}));
});

test('the picture is drawn for languages the bundled font covers; the others keep the text',()=>{
 for(const code of ['en','ru','uz','uk','de','vi','tr','pl'])assert.ok(cardLanguage(code),code);
 for(const code of ['ar','ur','fa','he','hi','bn','th','zh','ja','ko'])assert.ok(!cardLanguage(code),code);
});

test('the card renders as a PNG in the bundled font',async()=>{
 const {renderReportCard}=loadTS('lib/report-card-render.ts');
 const png=await renderReportCard(digestCard(items,'en',today,extras).card);
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 // The width is in the PNG header, big-endian at byte 16.
 assert.equal(new DataView(png.buffer,png.byteOffset).getUint32(16),1080);
 const {next}=JSON.parse(fs.readFileSync('package.json','utf8')).dependencies,sharp=JSON.parse(fs.readFileSync('package.json','utf8')).dependencies.sharp;
 assert.ok(next&&sharp,'sharp is a dependency of its own, not only one Next may skip');
 assert.match(fs.readFileSync('next.config.ts','utf8'),/outputFileTracingIncludes:\{'\/api\/cron\/telegram-\*':\['\.\/public\/fonts\/NotoSans-Regular\.ttf'\]\}/);
});

test('a photo is uploaded as multipart with its caption and keyboard, and its outcome read like a message\'s',async()=>{
 const {deliverTelegramPhoto}=loadTS('lib/telegram.ts');
 const config={token:'T',webhookSecret:'S',botUsername:'b'};
 let call;
 const outcome=await deliverTelegramPhoto({chat_id:7,photo:new Uint8Array([1,2,3]),filename:'card.png',caption:'<b>Hi</b>',keyboard:{inline:[[{text:'Share',url:'https://x'}]]}},config,async(url,init)=>{call={url,init};return Response.json({ok:true});});
 assert.equal(outcome,'sent');
 assert.equal(call.url,'https://api.telegram.org/botT/sendPhoto');
 const form=call.init.body;
 assert.equal(form.get('chat_id'),'7');assert.equal(form.get('caption'),'<b>Hi</b>');assert.equal(form.get('parse_mode'),'HTML');
 assert.deepEqual(JSON.parse(form.get('reply_markup')),{inline_keyboard:[[{text:'Share',url:'https://x'}]]});
 const photo=form.get('photo');assert.equal(photo.name,'card.png');assert.equal(photo.type,'image/png');assert.deepEqual([...new Uint8Array(await photo.arrayBuffer())],[1,2,3]);
 let plain;
 await deliverTelegramPhoto({chat_id:7,photo:new Uint8Array([1]),filename:'p.png'},config,async(url,init)=>{plain=init.body;return Response.json({ok:true});});
 assert.equal(plain.get('caption'),null);assert.equal(plain.get('reply_markup'),null);
 assert.equal(await deliverTelegramPhoto({chat_id:7,photo:new Uint8Array([1]),filename:'p.png'},config,async()=>Response.json({description:'Forbidden: bot was blocked by the user'},{status:403})),'blocked');
 assert.equal(await deliverTelegramPhoto({chat_id:7,photo:new Uint8Array([1]),filename:'p.png'},config,async()=>{throw Error('offline');}),'failed');
});

test('a report goes as its picture, as text where the language has none, and as text only when the render fails',async()=>{
 const sent=[],reported=[];
 const telegram={...loadTS('lib/telegram.ts'),deliverTelegramPhoto:async photo=>{sent.push(['photo',photo]);return 'sent';},deliverTelegramMessage:async message=>{sent.push(['text',message]);return 'sent';}};
 const {deliverReport}=loadTS('lib/telegram-report.ts',{'./telegram':telegram,'./monitoring':{reportError:async(...args)=>{reported.push(args);}}});
 const picture={card:{title:'T'},caption:'<b>T</b>',filename:'t.png',keyboard:{inline:[]}};
 const png=new Uint8Array([9]);
 assert.equal(await deliverReport({chat_id:1,language:'en',text:'text',picture},null,async()=>png),'sent');
 assert.deepEqual(sent.pop(),['photo',{chat_id:1,photo:png,filename:'t.png',caption:'<b>T</b>',keyboard:{inline:[]}}]);
 await deliverReport({chat_id:1,language:'ja',text:'text',keyboard:{inline:[]},picture},null,async()=>{throw Error('must not render');});
 assert.deepEqual(sent.pop(),['text',{chat_id:1,text:'text',keyboard:{inline:[]}}]);
 await deliverReport({chat_id:1,language:'en',text:'quiet',picture:null},null,async()=>{throw Error('must not render');});
 assert.deepEqual(sent.pop(),['text',{chat_id:1,text:'quiet',keyboard:undefined}]);
 await deliverReport({chat_id:1,language:'en',text:'text',picture},null,async()=>{throw Error('no sharp');});
 assert.deepEqual(sent.pop(),['text',{chat_id:1,text:'text',keyboard:undefined}]);
 assert.equal(reported.length,1);assert.equal(reported[0][1].message,'no sharp');
 // A failed upload is not followed by the text: Telegram may have shown the picture already.
 const failing=loadTS('lib/telegram-report.ts',{'./telegram':{...telegram,deliverTelegramPhoto:async()=>'failed'},'./monitoring':{reportError:async()=>{}}});
 assert.equal(await failing.deliverReport({chat_id:1,language:'en',text:'text',picture},null,async()=>png),'failed');
 assert.equal(sent.length,0);
});

function monthlyRoute({subscriptions,records={},categories={},prefs={},snapshots={},sendResult=true,deliveries=deliveryTable(),today='2026-10-01'}){
 const sent=[],reads=[];
 const db={
  async read(path){
   reads.push(path);
   const who=/user_id=eq\.([\w-]+)/.exec(path)?.[1];
   if(path.startsWith('/rest/v1/telegram_subscriptions'))return subscriptions;
   if(path.startsWith('/rest/v1/finance_records'))return recordsFor(records[who]??[],path);
   if(path.startsWith('/rest/v1/custom_categories'))return categories[who]??[];
   if(path.startsWith('/rest/v1/transaction_splits')||path.startsWith('/rest/v1/investment_account_links'))return [];
   if(path.startsWith('/rest/v1/user_preferences'))return who in prefs?[prefs[who]]:[];
   if(path.startsWith('/rest/v1/portfolio_snapshots')){const day=/occurred_on=lte\.([\d-]+)/.exec(path)[1];return (snapshots[who]??[]).filter(row=>row.occurred_on<=day).sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)).slice(0,1);}
   throw Error('unexpected '+path);
  },
  write:deliveries.write,
 };
 const route=loadTS('app/api/cron/telegram-monthly/route.ts',{
  '@/lib/day-rate-tables':{withDayRates:async records=>records,keepDayRates:async()=>{}},
  '@/lib/service-role':{serviceDatabase:()=>db},
  '@/lib/telegram':{telegramConfig:()=>({token:'T',webhookSecret:'S',botUsername:'b'}),escapeHtml:text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')},
  '@/lib/telegram-report':{deliverReport:async report=>{sent.push(report);return sendResult;}},
  '@/lib/deposit-interest':{depositToday:()=>today},
 });
 return {sent,reads,deliveries,GET:()=>route.GET(new Request('https://local',{headers:{authorization:'Bearer test-secret'}}))};
}
const once=(id,kind,amount,date,extra={})=>({id,name:id,kind,amount,currency:'USD',date,frequency:'Once',quantity:0,cost:0,rate:0,notes:'',...extra});
const snapshot=(occurred_on,assets)=>({occurred_on,assets,debt:0,rates:{USD:1},updated_at:occurred_on+'T18:00:00Z'});

test('the monthly cron reports the month that ended, in the owner\'s language and names, once per month',async()=>{
 process.env.CRON_SECRET='test-secret';
 const deliveries=deliveryTable();
 const setup={deliveries,subscriptions:[{user_id:'anna',chat_id:1}],prefs:{anna:{language:'en',display_name:'Anna',currencies:['USD']}},
  records:{anna:[once('pay','Salary',3000,'2026-09-05'),once('food','Living expense',900,'2026-09-10'),once('vet','Other expense',450,'2026-09-12',{custom_category_id:'c-pets'}),once('aug','Living expense',2000,'2026-08-20'),once('oct','Living expense',99,'2026-10-01')]},
  categories:{anna:[{id:'c-pets',name:'Pets'}]},
  snapshots:{anna:[snapshot('2026-08-31',10000),snapshot('2026-09-30',12500),snapshot('2026-10-01',99999)]}};
 const cron=monthlyRoute(setup);
 const response=await cron.GET();
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{sent:1,failed:0,blocked:0});
 const [report]=cron.sent;
 assert.equal(report.chat_id,1);assert.equal(report.language,'en');assert.equal(report.picture.filename,'hoggish-2026-09.png');
 assert.equal(report.picture.caption,'📅 <b>Your month, Anna</b> · September 2026');
 assert.deepEqual(report.picture.card.tiles,[
  {label:'Saved',value:'$1,650',tone:'good'},{label:'Income',value:'$3,000'},
  {label:'Spending',value:'$1,350',detail:'$650 less than the month before'},
  {label:'Net worth',value:'$12,500',detail:'+$2,500 this month',tone:'good'},
 ]);
 assert.deepEqual(report.picture.card.sections[0].rows.map(row=>[row.label,row.value]),[['Living expense','$900'],['Pets','$450']]);
 assert.match(report.text,/You saved \$1,650 this month\./);
 // Cash flow is read from the month before on, and only up to it.
 assert.ok(cron.reads.some(path=>path.includes('finance_records')&&path.includes('date=gte.2026-08-01')));
 assert.deepEqual(deliveries.rows,[{user_id:'anna',kind:'monthly',period:'2026-09-01',delivered:true}]);
 // A retry on the 2nd reports the same month and sends nothing twice.
 const retry=monthlyRoute({...setup,today:'2026-10-02'});
 assert.deepEqual(await (await retry.GET()).json(),{sent:0,failed:0,blocked:0});assert.equal(retry.sent.length,0);
});

test('the monthly cron leaves out a net worth from outside the month, refuses a wrong secret and is scheduled for the 1st',async()=>{
 process.env.CRON_SECRET='test-secret';
 const stale=monthlyRoute({subscriptions:[{user_id:'anna',chat_id:1}],prefs:{anna:{language:'ru',display_name:'',currencies:['USD']}},snapshots:{anna:[snapshot('2026-06-30',5000),snapshot('2026-09-15',8000)]}});
 await stale.GET();
 const [report]=stale.sent;
 // The month's snapshot shows, but its change only against a snapshot from the month before.
 assert.deepEqual(report.picture.card.tiles,[{label:'Чистый капитал',value:report.picture.card.tiles[0].value}]);
 assert.match(report.text,/Тихий месяц/);
 const old=monthlyRoute({subscriptions:[{user_id:'anna',chat_id:1}],prefs:{anna:{language:'en',display_name:'',currencies:['USD']}},snapshots:{anna:[snapshot('2026-07-31',5000)]}});
 await old.GET();assert.deepEqual(old.sent[0].picture.card.tiles,[]);
 const failing=monthlyRoute({subscriptions:[{user_id:'anna',chat_id:1}],prefs:{anna:{language:'en',display_name:'',currencies:['USD']}},sendResult:false});
 assert.equal((await failing.GET()).status,503);assert.deepEqual(failing.deliveries.rows,[],'a failed send gives its claim back for the retry');
 const route=loadTS('app/api/cron/telegram-monthly/route.ts',{'@/lib/service-role':{serviceDatabase:()=>{throw Error('must not be called');}}});
 assert.equal((await route.GET(new Request('https://local',{headers:{authorization:'Bearer wrong'}}))).status,401);
 const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.deepEqual(vercel.crons.find(cron=>cron.path==='/api/cron/telegram-monthly'),{path:'/api/cron/telegram-monthly',schedule:'0 5 1 * *'});
 assert.match(fs.readFileSync('VERCEL.md','utf8'),/telegram-monthly/);
});

test('migration 147 lets a monthly report claim its delivery and is in setup.sql',{skip:!process.env.PGLITE_MODULE},async()=>{
 const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/147_telegram_monthly_report.sql','utf8');
 assert.ok(setup.includes(migration));
 const {PGlite}=await import(process.env.PGLITE_MODULE);const d=new PGlite();
 const user='f1000000-0000-4000-8000-000000000001';
 try{
  await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;INSERT INTO auth.users VALUES('${user}');`);
  await d.exec(setup.slice(0,setup.indexOf(migration)));
  await assert.rejects(d.exec(`INSERT INTO telegram_deliveries(user_id,kind,period) VALUES('${user}','monthly','2026-09-01')`),/telegram_deliveries_kind_check/);
  await d.exec(migration);await d.exec(migration);
  await d.exec(`INSERT INTO telegram_deliveries(user_id,kind,period) VALUES('${user}','monthly','2026-09-01'),('${user}','recap','2026-09-01'),('${user}','digest','2026-09-01')`);
  await assert.rejects(d.exec(`INSERT INTO telegram_deliveries(user_id,kind,period) VALUES('${user}','yearly','2026-01-01')`),/telegram_deliveries_kind_check/);
  assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,147);
 }finally{await d.close();}
});

test('the edges of each card: unnamed owners, a list that fills the card across days, and quiet or empty months',()=>{
 const bills=(date,count,overdue=false)=>Array.from({length:count},(_,index)=>({...items[1],key:date+index,date,overdue,record:record(`Bill ${date} ${index}`,'Living expense',1000)}));
 const card=digestCard([...bills('2026-10-01',12,true),...bills('2026-10-20',10),...bills('2026-10-21',10)],'en',today).card;
 // Three overdue items at most, then the days ahead until the card holds six rows.
 assert.deepEqual(card.sections.map(section=>[section.title,section.rows.length]),[['Overdue',3],['20 October 2026',3]]);
 assert.equal(card.footer,'26 more');
 const week={currency:'USD',from:'2026-09-28',to:'2026-10-04',income:10,spending:5,top:null,goalsMoved:0,shareOrigin:null};
 const recap=recapCard(week,'en');
 assert.equal(recap.caption,'📊 <b>Your week</b>');assert.equal(recap.keyboard,undefined);assert.equal(recap.card.lines,undefined);
 const quiet={currency:'USD',month:'2026-09-01',income:0,spending:0,categories:[]};
 assert.equal(monthlyMessage(quiet,'en'),"📅 <b>Your month</b>\nSeptember 2026\n\nA quiet month. Add this month's records to see your report.");
 assert.equal(monthlyCard(quiet,'en').caption,'📅 <b>Your month</b> · September 2026');
 // A category without spending to divide by shows no share.
 assert.deepEqual(monthlyCard({...quiet,income:5,categories:[{label:'Pets',amount:0}]},'en').card.sections[0].rows,[{label:'Pets',value:'$0'}]);
});

test('the monthly cron names a deleted category as Other expense and answers 503 when Telegram is not configured',async()=>{
 process.env.CRON_SECRET='test-secret';
 const cron=monthlyRoute({subscriptions:[{user_id:'anna',chat_id:1}],prefs:{anna:{language:'en',display_name:'',currencies:['USD']}},records:{anna:[once('gone','Other expense',70,'2026-09-03',{custom_category_id:'c-gone'})]}});
 await cron.GET();
 assert.deepEqual(cron.sent[0].picture.card.sections[0].rows,[{label:'Other expense',value:'$70',detail:'100%'}]);
 const unconfigured=loadTS('app/api/cron/telegram-monthly/route.ts',{'@/lib/service-role':{serviceDatabase:()=>null}});
 const response=await unconfigured.GET(new Request('https://local',{headers:{authorization:'Bearer test-secret'}}));
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Telegram monthly report is not configured.'});
});

test('the card draws a line for net worth and labelled bars against the largest category',()=>{
 const svg=reportCardSvg({title:'T',tilesTitle:'Last 30 days',tiles:[{label:'Income',value:'$1'}],sectionsTitle:'Upcoming payments',sections:[{title:'Today',rows:[{label:'Rent',value:'$1'}]}],charts:[
  {kind:'line',title:'Net worth, last 30 days',values:[100,100,100],from:{label:'1 October 2026',value:'$100'},to:{label:'Today',value:'$100'}},
  {kind:'bars',title:'Expenses by category',bars:[{label:'Food',value:'$300',share:'75%',amount:300,color:'hsl(48 60% 48%)'},{label:'Tiny',value:'$0',share:'0%',amount:0,color:'#9aa38f'}]},
 ]});
 assert.match(svg,/LAST 30 DAYS/);assert.match(svg,/UPCOMING PAYMENTS/);assert.match(svg,/NET WORTH, LAST 30 DAYS/);assert.match(svg,/EXPENSES BY CATEGORY/);
 // A flat line sits in the middle of its plot, not on an edge.
 const [,y0]=/<polyline points="[\d.]+,([\d.]+)/.exec(svg);assert.ok(Number(y0)>0);
 assert.match(svg,/<polyline points="88,(\S+) 540,\1 992,\1"/);
 // The largest bar fills the width; a zero bar is still a dot.
 assert.match(svg,/width="904" height="14" rx="7" fill="hsl\(48 60% 48%\)"/);assert.match(svg,/width="14" height="14" rx="7" fill="#9aa38f"/);
 assert.match(svg,/>75%</);assert.match(svg,/>Today</);
 const falling=reportCardSvg({title:'T',charts:[{kind:'line',title:'N',values:[3,1],from:{label:'a',value:'3'},to:{label:'b',value:'1'},tone:'bad'}]});
 assert.match(falling,/stroke="#c0392b"/);
});
