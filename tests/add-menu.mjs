import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,hostModule,language,text,byType} from './helpers/component-tree.mjs';
import {loadTS} from './helpers/load-ts.mjs';

test('the bar’s Add offers an expense, an income and a transfer', () => {
 const r=createRenderer(),ran=[];
 const {AddMenu}=r.load('components/workspace/add-menu.tsx',{'@/components/language-provider':language('en'),'@/components/ui/button':hostModule(),'@/components/ui/dropdown-menu':hostModule(),'lucide-react':hostModule(),'next/link':{__esModule:true,default:'Link'}});
 r.render(r.react.createElement(AddMenu,{onExpense:()=>ran.push('expense'),onIncome:()=>ran.push('income')}));
 assert.equal(r.find(byType('Button')).props['aria-label'],'Add');
 const items=r.all(byType('DropdownMenuItem'));
 assert.deepEqual(items.map(text),['Expense','Income','Transfer']);
 items[0].props.onSelect();items[1].props.onSelect();
 assert.deepEqual(ran,['expense','income']);
 assert.equal(r.find(byType('Link')).props.href,'/accounts#transfer','a transfer opens on Accounts');
});

test('the transfer link is recognised by its hash alone', () => {
 const {transferLink,transferRequested}=loadTS('lib/add-links.ts');
 assert.equal(transferLink,'/accounts#transfer');
 assert.equal(transferRequested('#transfer'),true);
 assert.equal(transferRequested(''),false);
 assert.equal(transferRequested('#transfers'),false);
});

test('Save and add another keeps the kind, category, date, account and owner, and clears the rest', () => {
 const {anotherEntry}=loadTS('lib/record-save.ts');
 const saved={id:'a',name:'Lunch',kind:'Other expense',custom_category_id:'cat',currency:'EUR',amount:12.5,date:'2026-11-20',account_id:'wallet',shared:false,member_id:'me',frequency:'Once',notes:'with Sam'};
 const next=anotherEntry(saved);
 assert.notEqual(next.id,'a');
 assert.deepEqual([next.kind,next.custom_category_id,next.currency,next.date,next.account_id,next.shared,next.member_id,next.frequency],['Other expense','cat','EUR','2026-11-20','wallet',false,'me','Once']);
 assert.deepEqual([next.name,next.amount,next.notes],['',0,'']);
});
