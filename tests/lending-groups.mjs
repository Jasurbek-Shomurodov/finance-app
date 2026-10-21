import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {borrowers,borrowerKey,lendingSequence}=loadTS('lib/lending-groups.ts');
const {recordSchema}=loadTS('lib/record-schema.ts');
const lent=(id,group,extra={})=>({id,name:id,kind:'Money lent',borrower_group:group,amount:100,currency:'USD',...extra});

test('loans to the same borrower gather under one heading where the first of them was; everything else stays a row',()=>{
 const rows=[{id:'car',name:'Car loan',kind:'Loan'},lent('a','Family'),lent('b',null),lent('c',' family '),lent('d','Aziz'),lent('e','Family')];
 const items=lendingSequence(rows,row=>row);
 assert.deepEqual(items.map(item=>'row' in item?item.row.id:`${item.borrower}: ${item.rows.map(row=>row.id).join(',')}`),['car','Family: a,c,e','b','d'],'case and spaces do not split a borrower; one loan to Aziz needs no heading');
 assert.equal(borrowerKey('  '),null);
 assert.deepEqual(borrowers([...rows,{id:'x',kind:'Debt',borrower_group:'Bank'}]),['Aziz','Family'],'each borrower once, money lent only, in order');
});

test('only money lent may name a borrower, of at most 120 characters, trimmed',()=>{
 const base={id:'79000000-0000-4000-8000-000000000001',name:'School fees',kind:'Money lent',currency:'USD',amount:500,quantity:1,cost:0,rate:0,date:'',lent_date:'2026-09-01',frequency:'Once',notes:''};
 assert.equal(recordSchema.parse({...base,borrower_group:'  Family '}).borrower_group,'Family');
 assert.ok(!recordSchema.safeParse({...base,borrower_group:'x'.repeat(121)}).success);
 assert.ok(!recordSchema.safeParse({...base,kind:'Loan',date:'2026-12-01',borrower_group:'Family'}).success);
 assert.ok(recordSchema.safeParse({...base,borrower_group:null}).success);
});
