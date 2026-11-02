import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const realDeposit=loadTS('lib/deposit-interest.ts');
const today='2026-10-20';
const reads=[];let reply={};
const {useForecastBudget}=loadTS('components/workspace/state/use-forecast-budget.ts',{
 '@/lib/deposit-interest':{...realDeposit,depositToday:()=>today},
 '@/hooks/use-owner-resource':{useOwnerResource:(url,owner,enabled,revision,empty)=>{reads.push({url,owner,enabled,revision});return {data:empty,initialLoading:false,error:'',retry:()=>reads.push('retried'),...reply};}},
});
const {cashForecast}=loadTS('lib/cash-forecast.ts');
const {emptyBudget}=loadTS('lib/budget.ts');
const entry=(id,kind,amount,extra={})=>({id,name:id,kind,amount,quantity:1,cost:0,rate:0,currency:'USD',frequency:'Once',date:'2026-10-05',notes:'',...extra});
const cash=entry('cash','Cash',1000,{date:'2026-01-01'}),food=entry('food','Living expense',700);
const budget={state:{...emptyBudget,amounts:[{category_key:'Living expense',month:'2026-10',amount:800,currency:'USD',applies_forward:false}]},loading:false,error:'',retry(){reads.push('budget retried');}};
const planning=records=>({records,categories:[],goals:[],occurrences:[],activity:[],debtPayments:[]});
function forecast(props){
 let result;
 const Probe=()=>{result=useForecastBudget({budget,data:planning([cash]),splits:[],currency:'USD',market:{rates:{USD:1}},owner:'me',revision:3,projecting:true,...props});return null;};
 renderToStaticMarkup(React.createElement(Probe));
 return result;
}
const lowest=(result,data=planning([cash]))=>cashForecast({records:data.records,occurrences:[],today,days:10,currency:'USD',rates:{USD:1},budget:result.cash}).totals[0].lowest.balance;

test('the projection spends what is left of the budget, whatever the screen’s planning read holds',()=>{
 reads.length=0;reply={data:planning([cash,food])};
 const dashboard=forecast({});
 assert.deepEqual(reads.at(-1),{url:'/api/planning?scope=review&month=2026-10',owner:'me',enabled:true,revision:3},'the month’s own read, the URL the Dashboard already asks for');
 assert.equal(lowest(dashboard),900,'$800 budget less the $700 already spent; the workspace scope has no transactions, so it used to take all $800 again');
 assert.equal(lowest(forecast({data:planning([cash,entry('old','Living expense',55,{date:'2026-07-05'})])})),900,'a month picked on Cash flow changes nothing');
});

test('only a screen that projects cash reads the month; the sample workspace counts its own rows',()=>{
 reads.length=0;reply={};
 forecast({projecting:false});
 assert.equal(reads.at(-1).enabled,false);
 reads.length=0;
 const sample=forecast({owner:null,data:planning([cash,food])});
 assert.equal(reads.at(-1).enabled,false);
 assert.equal(lowest(sample),900);
});

test('the projection waits for the month and reports it when the read fails',()=>{
 reply={initialLoading:true};
 assert.equal(forecast({}).loading,true);
 assert.equal(forecast({}).ready,true,'the monthly estimate needs no actuals');
 reply={error:'Could not load data.'};
 const failed=forecast({});
 assert.equal(failed.error,'Could not load data.');
 reads.length=0;failed.retry();
 assert.deepEqual(reads,['budget retried','retried']);
 reply={};
});
