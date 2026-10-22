import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const {depositToday}=loadTS('lib/deposit-interest.ts');
const today=depositToday();
const tile=({label,value,tone,href,aside,children})=>React.createElement('a',{href,'data-tone':tone},label,'=',value,aside&&React.createElement('small',null,aside),children);
const {DashboardHeadline}=loadTS('components/dashboard-headline.tsx',{
 '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})},
 '@/components/presentation-foundation/stat-tile':{StatTiles:({children})=>React.createElement('div',null,children),StatTile:tile},
 '@/components/charts-lazy':{NetWorthSparkline:({values})=>React.createElement('svg',{'data-points':values.length})},
});
const bill=(id,amount,extra={})=>({id,name:id,kind:'Living expense',amount,currency:'USD',frequency:'Monthly',date:today,notes:'',quantity:1,cost:0,rate:0,...extra});
const data={records:[bill('gym',60),bill('pay',5000,{kind:'Salary'})],occurrences:[],debtPayments:[],categories:[],goals:[],activity:[]};
const render=props=>renderToStaticMarkup(React.createElement(DashboardHeadline,{netWorth:1484820,budget:{month:today.slice(0,7),rows:[],plan:6200,spent:3824,watched:[],loading:false},data,currency:'USD',market:null,...props}));

test('the headline row links net worth, this month, the budget and what is due within a week to their pages',()=>{
 const html=render({});
 assert.match(html,/<a href="\/assets">Net worth over time=\$1,484,820<\/a>/,'no trend yet: the figure alone');
 assert.match(html,/<a href="\/transactions\?type=expense&amp;period=this_month">Spent this month=\$3,824<\/a>/);
 assert.match(html,/<a href="\/budget" data-tone="positive">Budget left=\$2,376<div class="stat-tile-bar"><i style="width:61.6774[0-9]*%"><\/i><\/div><p>of \$6,200<\/p><\/a>/,'6,200 planned − 3,824 spent, with how much is used');
 assert.match(html,/<a href="\/upcoming">Due in 7 days=\$60<small>1 due soon<\/small><\/a>/,'the gym bill; the salary coming in is not due');
});

test('the headline says over, or nothing, rather than a wrong budget figure',()=>{
 assert.match(render({budget:{plan:3000,spent:3824,loading:false}}),/data-tone="negative">Over budget=\$824</);
 assert.match(render({budget:{plan:0,spent:10,loading:false}}),/Budget left=—/,'no plan, no remainder');
 assert.match(render({budget:{plan:6200,spent:0,loading:true}}),/Spent this month=—.*Budget left=—/,'still loading');
 assert.match(render({netWorth:null}),/Net worth over time=—/);
 // Net worth no longer waits for the planning read: only what is due does.
 assert.match(render({data:null}),/Net worth over time=\$1,484,820.*<a href="\/upcoming">Due in 7 days=—<\/a>.*Lowest balance ahead=—/);
});

test('the hero shows how net worth moved over the year, with its line, and nothing when the history is partial',()=>{
 const html=render({trend:{values:[1265775,1300000,1484820],change:219045,percent:17.3,fullYear:true}});
 assert.match(html,/Net worth over time=\$1,484,820<p class="dashboard-headline-change"><span class="overview-delta positive">.*\+\$219,045 · \+17\.3%<\/span><span>365 days<\/span><\/p><svg data-points="3">/);
 assert.match(render({trend:{values:[1,2],change:-50,percent:-1,fullYear:false}}),/overview-delta negative.*−\$50.*All history/,'a shorter history says so');
 assert.doesNotMatch(render({trend:{values:[1,2],change:null,percent:null,fullYear:true}}),/dashboard-headline-change/,'a partial history has no change to show');
});

test('an overspent budget fills its bar in red, and the lowest balance ahead is dated',()=>{
 assert.match(render({budget:{plan:3000,spent:3824,loading:false}}),/<div class="stat-tile-bar negative"><i style="width:100%">/);
 const cash={id:'cash',name:'Everyday checking',kind:'Cash',amount:900,currency:'USD',frequency:'One time',date:today,notes:'',quantity:1,cost:0,rate:0};
 assert.match(render({data:{...data,records:[...data.records,cash]}}),/<a href="\/income-expenses#forecast">Lowest balance ahead=\$[\d,]+<p>\d+ \w+ \d{4}<\/p><\/a>/);
 assert.match(render({data:{...data,records:[...data.records,cash]},forecastLoading:true}),/Lowest balance ahead=—/,'waits for the budget lines the forecast spends');
});

test('the net worth sparkline draws the line alone and is hidden from screen readers, the figure beside it being the reading',()=>{
 const {NetWorthSparkline}=loadTS('components/net-worth-sparkline.tsx');
 const html=renderToStaticMarkup(React.createElement(NetWorthSparkline,{values:[1265775,1300000,1484820]}));
 assert.match(html,/^<div class="net-worth-sparkline" aria-hidden="true">/);
 assert.match(renderToStaticMarkup(React.createElement(NetWorthSparkline,{values:[5,5]})),/net-worth-sparkline/,'a flat line still draws');
});
