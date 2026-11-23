import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer } from './helpers/component-tree.mjs';

// The dashboard's forecasts and spending pace memoize on the planning data; a new copy on every render ran them again.
test('the planning data keeps one identity across renders until its reply changes',()=>{
 let reply={records:[{id:'r',name:'Rent',kind:'Rent expense',currency:'USD',amount:'500',date:'2026-10-01',frequency:'Monthly'}],categories:[],goals:[],occurrences:[],activity:[]};
 const r=createRenderer();
 const {usePlanning}=r.load('hooks/use-planning.ts',{'./use-owner-resource':{useOwnerResource:()=>({data:reply,initialLoading:false,loading:false,error:'',invalidate(){},update(){}})}});
 const seen=[],accounts=[],rows=[];
 const Probe=()=>{seen.push(usePlanning('me',false,rows,0,()=>{},accounts,'workspace').data);return null;};
 r.render(React.createElement(Probe));
 r.render(React.createElement(Probe));
 assert.equal(seen.length,2);assert.equal(seen[0],seen[1],'the same reply gives the same copy');
 assert.equal(seen[0].records[0].amount,500,'records are still normalized once');
 reply={...reply,records:[]};
 r.render(React.createElement(Probe));
 assert.notEqual(seen.at(-1),seen[0]);assert.deepEqual(seen.at(-1).records,[]);
});

// Record payment shows a loan's payment at once, before the reload that follows the save returns.
test('a confirmed loan payment settles its month and lowers the balance in the data at hand; the sample workspace keeps its own rows',()=>{
 let reply={records:[{id:'loan',name:'Car',kind:'Loan',currency:'USD',amount:'3000',date:'2030-01-01',frequency:'Once'},{id:'other',name:'Card',kind:'Debt',currency:'USD',amount:'90',date:'2030-01-01',frequency:'Once'}],categories:[],goals:[],occurrences:[],activity:[]};
 let updates=0;
 const r=createRenderer();
 const {usePlanning}=r.load('hooks/use-planning.ts',{'./use-owner-resource':{useOwnerResource:()=>({data:reply,initialLoading:false,loading:false,error:'',invalidate(){},update(change){updates++;reply=change(reply);}})}});
 const payment={record_id:'loan',date:'2026-11-23',amount:470,currency:'USD',account_id:'cash'};
 usePlanningOnce(r,usePlanning,false).noteDebtPayment(payment,450);
 assert.deepEqual(reply.debtPayments,[payment]);
 assert.deepEqual(reply.records.map(record=>Number(record.amount)),[2550,90]);
 usePlanningOnce(r,usePlanning,false).noteDebtPayment({...payment,date:'2026-12-01'},50);
 assert.equal(reply.debtPayments.length,2,'it adds to the payments already read');
 usePlanningOnce(r,usePlanning,true).noteDebtPayment(payment,450);
 assert.equal(updates,2,'nothing is written over the sample rows');
});
function usePlanningOnce(r,usePlanning,demo){
 const seen=[],rows=[],accounts=[];
 const Probe=()=>{seen.push(usePlanning('me',demo,rows,0,()=>{},accounts,'workspace'));return null;};
 r.render(React.createElement(Probe));
 return seen.at(-1);
}
