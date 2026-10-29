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
