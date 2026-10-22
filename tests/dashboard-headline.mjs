import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const {depositToday}=loadTS('lib/deposit-interest.ts');
const {shiftDay}=loadTS('lib/calendar-days.ts');
const today=depositToday();
const tile=({label,value,tone,href,aside,children})=>React.createElement('a',{href,'data-tone':tone},label,'=',value,aside&&React.createElement('small',null,aside),children);
const {DashboardHeadline}=loadTS('components/dashboard-headline.tsx',{
 '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})},
 '@/components/presentation-foundation/stat-tile':{StatTiles:({children,columns})=>React.createElement('div',{'data-columns':columns},children),StatTile:tile},
 '@/components/spending-pace-card':{paceDifference:state=>state.difference},
});
const bill=(id,amount,extra={})=>({id,name:id,kind:'Living expense',amount,currency:'USD',frequency:'Monthly',date:today,notes:'',quantity:1,cost:0,rate:0,...extra});
const data={records:[bill('gym',60),bill('pay',5000,{kind:'Salary'})],occurrences:[],debtPayments:[],categories:[],goals:[],activity:[]};
const render=props=>renderToStaticMarkup(React.createElement(DashboardHeadline,{netWorth:1484820,budget:{month:today.slice(0,7),rows:[],plan:6200,spent:3824,watched:[],loading:false},data,currency:'USD',market:null,...props}));

test('the key figures link this month, the budget, what is due within a week and the lowest cash ahead to their pages',()=>{
 const html=render({});
 assert.match(html,/^<div data-columns="2">/,'a 2×2 beside the Net worth over time card');
 assert.doesNotMatch(html,/Net worth=/,'the card beside the figures leads with net worth');
 assert.match(html,/<a href="\/transactions\?type=expense&amp;period=this_month">Spent this month=\$3,824<\/a>/);
 assert.match(html,/<a href="\/budget" data-tone="positive">Budget left=\$2,376<div class="stat-tile-bar"><i style="width:61\.67[0-9]*%"><\/i><\/div><p>\$3,824 of \$6,200 spent<\/p><\/a>/,'6,200 planned − 3,824 spent');
 assert.match(html,/<a href="\/upcoming">Due in 7 days=\$60<p class="stat-tile-line"><span class="status-badge is-caution">1 due soon<\/span><span>Next: gym · Today<\/span><\/p><\/a>/,'the gym bill; the salary coming in is not due');
 assert.match(html,/<a href="\/income-expenses#forecast">Lowest balance ahead=/);
});

test('with the net worth card hidden, net worth joins the figures as a tile of its own',()=>{
 const html=render({netWorthTile:true});
 assert.match(html,/^<div data-columns="auto"><a href="\/assets">Net worth=\$1,484,820<\/a>/);
 assert.match(render({netWorthTile:true,netWorth:null}),/Net worth=—/);
});

test('the headline says over, or nothing, rather than a wrong budget figure',()=>{
 assert.match(render({budget:{plan:3000,spent:3824,loading:false}}),/data-tone="negative">Over budget=\$824<div class="stat-tile-bar negative"><i style="width:100%">/);
 assert.match(render({budget:{plan:0,spent:10,loading:false}}),/Budget left=—<\/a>/,'no plan, no remainder and no bar');
 assert.match(render({budget:{plan:6200,spent:0,loading:true}}),/Spent this month=—.*Budget left=—/,'still loading');
 assert.match(render({data:null}),/<a href="\/upcoming">Due in 7 days=—<\/a>.*Lowest balance ahead=—/,'what is due and the cash ahead wait for the planning read');
});

test('spending says how far ahead of or behind last month it is by this day',()=>{
 assert.match(render({spending:{difference:-1637}}),/Spent this month=\$3,824<p class="stat-tile-trend"><svg[^>]*class="lucide lucide-trending-down positive"[^>]*>.*<span>\$1,637 less than last month by this day<\/span>/);
 assert.match(render({spending:{difference:29}}),/<span>\$29 more than last month by this day<\/span>/);
 assert.match(render({spending:{difference:0}}),/<p class="stat-tile-trend"><span>Same as last month by this day<\/span>/,'no arrow when it is the same');
 assert.doesNotMatch(render({spending:{difference:null}}),/stat-tile-trend/,'nothing to compare');
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

test('the lowest balance waits for a saved Budget that failed, warns below zero, and has no figure while a rate is missing',()=>{
 const cash={id:'cash',name:'Everyday checking',kind:'Cash',amount:100,currency:'USD',frequency:'One time',date:today,notes:'',quantity:1,cost:0,rate:0};
 const low={...data,records:[cash,bill('rent',900,{date:shiftDay(today,3)})]};
 assert.match(render({data:low}),/data-tone="negative">Lowest balance ahead=−\$2,600<p class="negative">Below zero on \d+ \w+ \d{4}<\/p>/,'$100 less three monthly rents of $900 in the 90 days');
 assert.match(render({data:low,forecastError:true}),/Lowest balance ahead=—<\/a>/,'a Budget that could not be read is not left out silently');
 const euro={...low,records:[cash,bill('rent',900,{date:shiftDay(today,3),currency:'EUR'})]};
 assert.match(render({data:euro}),/Lowest balance ahead=—<p>Exchange rate unavailable\.<\/p>/);
});
