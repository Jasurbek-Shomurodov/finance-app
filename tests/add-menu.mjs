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
