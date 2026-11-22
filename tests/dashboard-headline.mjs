import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const {depositToday}=loadTS('lib/deposit-interest.ts');
const {shiftDay}=loadTS('lib/calendar-days.ts');
const today=depositToday();
const {monthlyIncomeCards}=loadTS('lib/monthly-income-cards.ts');
const {incomeStillExpected}=loadTS('lib/cash-flow-outlook.ts');
const tile=({label,value,tone,href,aside,children})=>React.createElement('a',{href,'data-tone':tone},label,'=',value,aside&&React.createElement('small',null,aside),children);
const {DashboardHeadline,useHeadlineFigures}=loadTS('components/dashboard-headline.tsx',{
 '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})},
 '@/components/presentation-foundation/stat-tile':{StatTiles:({children,columns})=>React.createElement('div',{'data-columns':columns},children),StatTile:tile},
 // As the real one: null when there is nothing to compare, never undefined.
 '@/components/spending-pace-card':{paceDifference:state=>state.difference??null},
 '@/components/presentation-foundation/info-hint':{InfoHint:({children})=>React.createElement('i',{'data-hint':true},children)},
 '@/components/presentation-foundation/rolling-text':{RollingText:({text})=>text},
});
// This month as the Monthly review totals it, which the spending read carries beside the pace.
const review={received:5000,spent:3824,missing:0,categories:[]};
const plan=(extra={})=>({month:today.slice(0,7),rows:[],plan:6200,spent:3824,watched:[],over:[],covered:new Set(['Living expense']),budgeted:true,loading:false,...extra});
const bill=(id,amount,extra={})=>({id,name:id,kind:'Living expense',amount,currency:'USD',frequency:'Monthly',date:today,notes:'',quantity:1,cost:0,rate:0,...extra});
const data={records:[bill('gym',60),bill('pay',5000,{kind:'Salary'})],occurrences:[],debtPayments:[],categories:[],goals:[],activity:[]};
const Headline=props=>React.createElement(DashboardHeadline,{...props,figures:useHeadlineFigures(props)});
const render=props=>renderToStaticMarkup(React.createElement(Headline,{netWorth:1484820,budget:plan(),spending:{month:review,loading:false},data,currency:'USD',market:null,...props}));

test('the key figures link what is safe to spend, this month, what is due within a week and the lowest cash ahead to their pages',()=>{
 const html=render({});
 assert.match(html,/^<div data-columns="2">/,'a 2×2 beside the Net worth over time card');
 assert.doesNotMatch(html,/Net worth=/,'the card beside the figures leads with net worth');
 assert.match(html,/^<div data-columns="2"><article class="stat-tile stat-tile-link stat-tile-covered"><h3><a class="stat-tile-cover" href="\/budget">Safe to spend<\/a><i data-hint="true">This month’s budget, minus what you have spent and the payments still due this month that no budget category covers\.<\/i><\/h3><strong class="positive">\$2,376<\/strong><div class="stat-tile-bar"><i style="width:61\.67[0-9]*%"><\/i><\/div><p>\$6,200 planned<\/p><\/article>/,'it leads the figures: 6,200 planned − 3,824 spent, and the gym bill is inside its category’s plan');
 assert.match(html,/<a href="\/transactions\?type=expense&amp;period=this_month">Spent this month=\$3,824<\/a>/);
 assert.doesNotMatch(html,/Budget left|Over budget/,'one figure says what is left');
 assert.match(html,/<a href="\/upcoming">Due in 7 days=\$60<p class="stat-tile-line"><span class="status-badge is-caution">1 due soon<\/span><span>Next: gym · Today<\/span><\/p><\/a>/,'the gym bill; the salary coming in is not due');
 assert.match(html,/<a href="\/income-expenses#forecast">Lowest balance ahead=/);
});

test('with the net worth card hidden, net worth joins the figures as a tile of its own',()=>{
 const html=render({netWorthTile:true});
 assert.match(html,/^<div data-columns="auto"><a href="\/assets">Net worth=\$1,484,820<\/a>/);
});

const safe=html=>html.match(/<article class="stat-tile stat-tile-link stat-tile-covered">.*?<\/article>/)[0].replace(/<i data-hint.*?<\/i>/,'');
test('safe to spend takes off what no budget category covers, says Over by, and falls back to income without a budget',()=>{
 // The gym bill (60, due today) is outside the plan once its category has none: it comes off, and the tile says so.
 assert.match(safe(render({budget:plan({covered:new Set()})})),/Safe to spend<\/a><\/h3><strong class="positive">\$2,316<\/strong>.*<p>\$6,200 planned · \$60 still due this month<\/p>/,'6,200 − 3,824 − 60');
 assert.match(safe(render({budget:plan({plan:3000,spent:3824,loading:false})})),/href="\/budget">Over by<\/a><\/h3><strong class="negative">\$824<\/strong><div class="stat-tile-bar negative"><i style="width:100%">/,'over is said by the label, not by colour alone');
 // No saved budget: expected income (received and still expected) − spent − everything still due.
 const expected=incomeStillExpected(monthlyIncomeCards(data.records,today.slice(0,7),[],today,undefined),amount=>amount);
 const none=render({budget:plan({budgeted:false,plan:60,covered:new Set(['Living expense'])})});
 const left=5000+expected-3824-60;
 assert.ok(none.includes('With no budget set: the income expected this month, minus what you have spent and everything still due this month.'),'the hint says which sum it is');
 assert.ok(safe(none).includes(`<strong class="positive">$${left.toLocaleString('en-US')}</strong>`),'bills alone are no budget: '+safe(none));
 assert.match(safe(none),/of \$[\d,]+ expected · \$60 still due this month<\/p>/);
});

test('safe to spend shows no figure while a read is loading, failed or holds an amount no rate converts',()=>{
 assert.match(safe(render({budget:plan({plan:6200,spent:0,loading:true})})),/Safe to spend<\/a><\/h3><strong>—<\/strong><\/article>/,'still loading: no figure and no note');
 assert.match(safe(render({spending:undefined})),/<strong>—<\/strong><\/article>/);
 assert.match(safe(render({budget:plan({error:'Could not load data.'})})),/<strong>—<\/strong><\/article>/,'a failed read never reads as the whole plan left');
 assert.match(safe(render({budget:plan({missing:1})})),/<strong>—<\/strong><p>Exchange rate unavailable\.<\/p><\/article>/,'one amount left out would overstate what is left');
 const euro={...data,records:[bill('car',300,{kind:'Loan',currency:'EUR',frequency:'Once',date:shiftDay(today,2)})]};
 assert.match(safe(render({data:euro})),/<strong>—<\/strong><p>Exchange rate unavailable\.<\/p><\/article>/,'a payment due that no rate converts');
 assert.match(safe(render({budget:plan({budgeted:false}),spending:{month:{...review,missing:1},loading:false}})),/<strong>—<\/strong><p>Exchange rate unavailable\.<\/p>/,'without a budget the month’s own totals must be whole');
 assert.match(safe(render({budget:plan({budgeted:false}),spending:{month:review,loading:false,error:'Could not load data.'}})),/<strong>—<\/strong><\/article>/);
});

test('the headline says nothing rather than a wrong figure',()=>{
 assert.match(render({budget:plan({plan:6200,spent:0,loading:true}),spending:undefined}),/Spent this month=—/,'still loading');
 assert.match(render({data:null}),/<a href="\/upcoming">Due in 7 days=—<\/a>.*Lowest balance ahead=—/,'what is due and the cash ahead wait for the planning read');
});

test('spending says how far ahead of or behind last month it is by this day',()=>{
 assert.match(render({spending:{month:review,difference:-1637}}),/Spent this month=\$3,824<p class="stat-tile-trend"><svg[^>]*class="lucide lucide-trending-down positive"[^>]*>.*<span>\$1,637 less than last month by this day<\/span>/);
 // The tile shows the Spending card's own figure (monthlyReview.spent, every category), not the Budget card's, which drops excluded categories (DRY-001).
 assert.match(render({spending:{month:review,difference:-1637,loading:false,pace:{spent:4100}}}),/Spent this month=\$4,100<p class="stat-tile-trend">/,'the tile, its trend and the Spending card agree');
 assert.match(render({spending:{month:review,difference:null,loading:true,pace:{spent:0}}}),/Spent this month=—/,'while the pace loads the tile waits rather than showing a different figure');
 assert.match(render({spending:{month:review,difference:null,loading:false,pace:{spent:0}},budget:plan({plan:6200,spent:3824,loading:true})}),/Spent this month=\$0/,'the pace is the figure even while the Budget card still loads');
 assert.match(render({spending:{month:review,difference:29}}),/<span>\$29 more than last month by this day<\/span>/);
 assert.match(render({spending:{month:review,difference:0}}),/<p class="stat-tile-trend"><span>Same as last month by this day<\/span>/,'no arrow when it is the same');
 assert.doesNotMatch(render({spending:{month:review,difference:null}}),/stat-tile-trend/,'nothing to compare');
});

test('spending with an amount no rate converts, or a read that failed, is unknown rather than a partial figure',()=>{
 const missing=render({spending:{month:review,difference:null,loading:false,error:'',pace:{spent:400,missing:true}}});
 assert.match(missing,/Spent this month=—<p>Exchange rate unavailable\.<\/p>/,'never the $400 that could be converted');
 assert.match(render({spending:{month:review,difference:null,loading:false,error:'Could not load data.',pace:{spent:0,missing:false}}}),/Spent this month=—<\/a>/,'a failed read is not $0');
 assert.match(render({spending:undefined,budget:plan({plan:6200,spent:3824,loading:false,missing:2})}),/Spent this month=—<p>Exchange rate unavailable\.<\/p>/);
 assert.match(render({spending:undefined,budget:plan({plan:6200,spent:0,loading:false,error:'Could not load data.'})}),/Spent this month=—<\/a>/);
});

test('the Due tile says overdue when that is what is left',()=>{
 const html=render({data:{...data,records:[bill('rent',900,{date:shiftDay(today,-3),frequency:'Once',kind:'Debt'})]}});
 assert.match(html,/<span class="status-badge is-overdue">1 overdue<\/span>/);assert.doesNotMatch(html,/0 due soon/);
});

test('the next payment due is named, overdue in red when its date has passed',()=>{
 const late={...data,records:[bill('rent',900,{date:shiftDay(today,-3)}),bill('gym',60,{date:shiftDay(today,2)})]};
 const html=render({data:late});
 assert.match(html,/Next: rent · <span class="negative">Overdue<\/span>/);
 const ahead=render({data:{...data,records:[bill('gym',60,{date:shiftDay(today,2)})]}});
 assert.match(ahead,/Next: gym · \d+ \w+ \d{4}/,'a later date is written out');
});

test('the lowest balance ahead is dated, and waits for the budget lines the forecast spends',()=>{
 const cash={id:'cash',name:'Everyday checking',kind:'Cash',amount:900,currency:'USD',frequency:'One time',date:today,notes:'',quantity:1,cost:0,rate:0};
 const withCash={...data,records:[...data.records,cash]};
 assert.match(render({data:withCash}),/Lowest balance ahead=\$[\d,]+<p>\d+ \w+ \d{4} · Total cash<\/p><\/a>/);
 assert.match(render({data:withCash,forecastLoading:true}),/Lowest balance ahead=—/);
});

test('the headline works out its figures once, for both spots it stands in',()=>{
 assert.match(fs.readFileSync('components/workspace/screens/overview-screen.tsx','utf8'),/const figures = useHeadlineFigures\(/);
 assert.equal([...fs.readFileSync('components/workspace/screens/overview-screen.tsx','utf8').matchAll(/useHeadlineFigures\(/g)].length,1);
});

test('the lowest balance waits for a saved Budget that failed, warns below zero, and has no figure while a rate is missing',()=>{
 const cash={id:'cash',name:'Everyday checking',kind:'Cash',amount:100,currency:'USD',frequency:'One time',date:today,notes:'',quantity:1,cost:0,rate:0};
 const low={...data,records:[cash,bill('rent',900,{date:shiftDay(today,3)})]};
 assert.match(render({data:low}),/data-tone="negative">Lowest balance ahead=−\$2,600<p class="negative">Below zero on \d+ \w+ \d{4}<\/p>/,'$100 less three monthly rents of $900 in the 90 days');
 assert.match(render({data:low,forecastError:true}),/Lowest balance ahead=—<\/a>/,'a Budget that could not be read is not left out silently');
 const euro={...low,records:[cash,bill('rent',900,{date:shiftDay(today,3),currency:'EUR'})]};
 assert.match(render({data:euro}),/Lowest balance ahead=—<p>Exchange rate unavailable\.<\/p>/);
});

test('a surplus no goal has yet is offered to Plan funding; nothing shows when all of it is assigned or it is unknown',()=>{
 const goal=(monthly,extra={})=>({id:'g'+monthly,name:'Goal',kind:'savings',currency:'USD',funding_monthly:monthly,funding_enabled:true,funding_priority:10,target:100000,allocated:0,archived:false,...extra});
 const withGoals=goals=>({data:{...data,goals},surplus:5000.4,surplusReady:true});
 const html=render(withGoals([goal(128)]));
 assert.match(html,/<article class="stat-tile surplus-nudge">.*<h3>Unassigned monthly surplus<\/h3><strong>\$4,872<\/strong>.*<a[^>]*href="\/goals#plan-funding"[^>]*>Plan funding<\/a><\/article><\/div>$/,'5,000 − 128 planned, a whole amount, after the four figures');
 assert.doesNotMatch(render(withGoals([goal(5000.4)])),/surplus-nudge/,'every dollar has a goal');
 assert.doesNotMatch(render(withGoals([])),/surplus-nudge/,'no goal to fund');
 assert.doesNotMatch(render({...withGoals([goal(128)]),surplusReady:false}),/surplus-nudge/,'the estimate is not ready: no figure rather than a partial one');
 assert.doesNotMatch(render({...withGoals([goal(128,{currency:'EUR'})])}),/surplus-nudge/,'a funded goal no rate converts');
 assert.doesNotMatch(render({...withGoals([goal(128)]),data:null}),/surplus-nudge/);
});
