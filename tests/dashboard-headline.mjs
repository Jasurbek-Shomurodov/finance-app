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
});
const bill=(id,amount,extra={})=>({id,name:id,kind:'Living expense',amount,currency:'USD',frequency:'Monthly',date:today,notes:'',quantity:1,cost:0,rate:0,...extra});
const data={records:[bill('gym',60),bill('pay',5000,{kind:'Salary'})],occurrences:[],debtPayments:[],categories:[],goals:[],activity:[]};
const render=props=>renderToStaticMarkup(React.createElement(DashboardHeadline,{netWorth:1484820,budget:{month:today.slice(0,7),rows:[],plan:6200,spent:3824,watched:[],loading:false},data,currency:'USD',market:null,...props}));

test('the headline row links net worth, this month, the budget and what is due within a week to their pages',()=>{
 const html=render({});
 assert.match(html,/<a href="\/assets">Net worth=\$1,484,820<\/a>/);
 assert.match(html,/<a href="\/transactions\?type=expense&amp;period=this_month">Spent this month=\$3,824<\/a>/);
 assert.match(html,/<a href="\/budget" data-tone="positive">Budget left=\$2,376<\/a>/,'6,200 planned − 3,824 spent');
 assert.match(html,/<a href="\/upcoming">Due in 7 days=\$60<small>1 due soon<\/small><\/a>/,'the gym bill; the salary coming in is not due');
});

test('the headline says over, or nothing, rather than a wrong budget figure',()=>{
 assert.match(render({budget:{plan:3000,spent:3824,loading:false}}),/data-tone="negative">Over budget=\$824</);
 assert.match(render({budget:{plan:0,spent:10,loading:false}}),/Budget left=—/,'no plan, no remainder');
 assert.match(render({budget:{plan:6200,spent:0,loading:true}}),/Spent this month=—.*Budget left=—/,'still loading');
 assert.match(render({netWorth:null}),/Net worth=—/);
 // Net worth no longer waits for the planning read: only what is due does.
 assert.match(render({data:null}),/Net worth=\$1,484,820.*<a href="\/upcoming">Due in 7 days=—<\/a>/);
});
