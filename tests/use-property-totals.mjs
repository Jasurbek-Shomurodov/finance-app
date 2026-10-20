import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {createRenderer} from './helpers/component-tree.mjs';
import {loadTS} from './helpers/load-ts.mjs';

const {depositToday}=loadTS('lib/deposit-interest.ts');
const today=depositToday(),year=today.slice(0,4),month=today.slice(0,7);
const entry=(id,kind,amount,extra={})=>({id,name:id,kind,amount,currency:'USD',frequency:'Once',date:`${year}-01-15`,notes:'',quantity:1,cost:0,rate:0,...extra});
const home=entry('home','Property',300000);
const records=[home,entry('rent','Rent income',1200,{income_source_id:'home'}),entry('roof','Other expense',400,{property_id:'home'}),entry('old','Other expense',999,{property_id:'home',date:`${Number(year)-1}-12-31`}),entry('lunch','Living expense',20)];

function open(props,resource){
 const r=createRenderer(),reads=[];
 const {usePropertyTotals}=r.load('hooks/use-property-totals.ts',{'@/hooks/use-owner-resource':{useOwnerResource:(...args)=>{reads.push(args);return resource();}}});
 let totals;
 const Host=all=>{totals=usePropertyTotals(all);return null;};
 const base={owner:null,demo:true,revision:0,records:[],sample:[],currency:'USD',market:null};
 r.mount(React.createElement(Host,{...base,...props}));
 return {reads,totals:()=>totals,render:next=>{r.mount(React.createElement(Host,{...base,...props,...next}));return totals;}};
}
const idle=()=>({data:{records:[]},initialLoading:false,error:''});

test('the sample workspace totals each property from the records it already holds, this year only',()=>{
 const view=open({sample:records,records},idle);
 assert.deepEqual(view.totals().get('home'),{income:1200,costs:400,missing:0},'last year\'s 999 and unlinked spending are left out');
 const [url,,live]=view.reads[0];
 assert.equal(live,false,'nothing is read from the server');
 assert.equal(url,`/api/planning?scope=budget&month=${month}&from=${year}-01`);
});

test('a signed-in workspace with a property reads this year\'s payments, and shows nothing while they load or fail',()=>{
 let state={data:{records:[]},initialLoading:true,error:''};
 const view=open({owner:'me',demo:false,records:[home],sample:[home]},()=>state);
 assert.equal(view.reads[0][1],'me');assert.equal(view.reads[0][2],true,'the read runs');
 assert.equal(view.totals(),null,'loading');
 state={data:{records:[]},initialLoading:false,error:'Could not load.'};
 assert.equal(view.render({revision:1}),null,'a failed read is never shown as zero');
 state={data:{records},initialLoading:false,error:''};
 assert.deepEqual(view.render({revision:2}).get('home'),{income:1200,costs:400,missing:0},'the read\'s payments, not the sample');
});

test('a signed-in workspace without a property reads nothing and has no totals to show',()=>{
 const view=open({owner:'me',demo:false,records:[entry('cash','Cash',10)],sample:[]},idle);
 assert.equal(view.reads[0][2],false);
 assert.equal(view.totals().size,0);
});
