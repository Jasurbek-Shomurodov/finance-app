import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {recurringFlows}=loadTS('lib/recurring-flows.ts');
const item=(name,direction,amount,extra={})=>({key:name,record:{name,kind:direction==='income'?'Salary':'Living expense',currency:'USD'},date:'2026-10-01',status:'due',direction,amount,...extra});
const usd=(amount,currency)=>currency==='USD'?amount:currency==='UZS'?amount/12000:null;

test('the month’s schedules run from each income into one total, out to each bill and what is left',()=>{
 const groceries=item('Groceries','expense',3000*12000,{record:{name:'Groceries',kind:'Living expense',currency:'UZS'}});
 const flows=recurringFlows([item('Salary','income',5000),item('Salary','income',700),item('Rent','income',450,{status:'paid',recorded:400}),groceries,item('Gym','expense',60,{status:'skipped'})],usd,key=>key);
 assert.deepEqual(flows.nodes.map(node=>[node.name,node.kind]),[['Salary','income'],['Rent','income'],['Recurring','total'],['Groceries','expense'],['Left after expenses','savings']]);
 assert.deepEqual(flows.links.map(link=>link.value),[5700,400,3000,3100],'a paid income counts what was recorded; a UZS bill converts; a skipped one is left out');
 assert.equal(flows.missing,0);
});

test('more bills than income draws a shortfall; money left over is its own node; a long side folds into Other',()=>{
 const short=recurringFlows([item('Salary','income',100),item('Rent','expense',300)],usd,key=>key);
 assert.deepEqual(short.nodes.map(node=>node.name),['Salary','Shortfall','Recurring','Rent']);
 const left=recurringFlows([item('Salary','income',1000),item('Rent','expense',300)],usd,key=>key);
 assert.deepEqual(left.links.map(link=>[left.nodes[link.target].name,link.value]),[['Recurring',1000],['Rent',300],['Left after expenses',700]]);
 const many=recurringFlows([item('Salary','income',10000),...['a','b','c','d'].map((name,index)=>item(name,'expense',100-index))],usd,key=>key,2);
 assert.deepEqual(many.nodes.slice(2).map(node=>node.name),['a','b','Other','Left after expenses']);
 assert.equal(recurringFlows([item('x','income',5,{record:{name:'x',kind:'Salary',currency:'EUR'}})],usd,key=>key).missing,1);
 assert.deepEqual(recurringFlows([],usd,key=>key).nodes,[]);
});
