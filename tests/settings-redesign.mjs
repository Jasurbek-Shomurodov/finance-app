import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {createRenderer,hostModule,language} from './helpers/component-tree.mjs';
import {loadTS} from './helpers/load-ts.mjs';
import {stylesheet} from './helpers/stylesheet.mjs';

const {movePreferredCurrency,maxPreferredCurrencies}=loadTS('lib/currencies.ts');
const {quotedPair}=loadTS('lib/market.ts');
const {categoryPlan}=loadTS('lib/category-plans.ts');

test('dragging a preferred currency onto another takes its place; the first place is the primary',()=>{
 assert.equal(maxPreferredCurrencies,2);
 const list=['USD','UZS'];
 assert.deepEqual(movePreferredCurrency(list,'UZS','USD'),['UZS','USD']);
 assert.deepEqual(movePreferredCurrency(list,'USD','UZS'),['UZS','USD']);
 assert.deepEqual(movePreferredCurrency(['USD','EUR','GBP'],'GBP','USD'),['GBP','USD','EUR']);
 assert.deepEqual(movePreferredCurrency(['USD','EUR','GBP'],'USD','EUR'),['EUR','USD','GBP']);
 // Nothing to do, or a code that is not in the list: the same list back, so no save is sent.
 assert.equal(movePreferredCurrency(list,'USD','USD'),list);
 assert.equal(movePreferredCurrency(list,'EUR','USD'),list);
 assert.equal(movePreferredCurrency(list,'USD','EUR'),list);
 assert.deepEqual(list,['USD','UZS'],'the saved list is never changed in place');
});

test('a currency pair is quoted from the dearer currency, and never without a usable rate',()=>{
 const rates={USD:1,UZS:12840,EUR:.8};
 assert.deepEqual(quotedPair('USD','UZS',rates),{from:'USD',to:'UZS',rate:12840});
 assert.deepEqual(quotedPair('UZS','USD',rates),{from:'USD',to:'UZS',rate:12840},'the same line whichever is primary');
 assert.deepEqual(quotedPair('USD','EUR',rates),{from:'EUR',to:'USD',rate:1.25});
 assert.deepEqual(quotedPair('USD','UZS',12840),{from:'USD',to:'UZS',rate:12840},'a single USD/UZS rate works too');
 for(const [first,second,table] of [['USD','USD',rates],['USD','GBP',rates],['USD','UZS',undefined],['USD','UZS',{UZS:0}],['USD','UZS',{UZS:-5}]])assert.equal(quotedPair(first,second,table),null,`${first}/${second}`);
});

test('a category plan reads this month’s budget in the display currency and only the schedules still running',()=>{
 const schedule=(name,kind,extra={})=>({id:name,name,kind,frequency:'Monthly',amount:10,currency:'USD',date:'2026-01-05',...extra});
 const source={month:'2026-11',currency:'USD',rates:{USD:1,EUR:.5},
  amounts:[{category_key:'Charity',month:'2026-09',amount:100,currency:'EUR',applies_forward:true},{category_key:'Charity',month:'2026-12',amount:999,currency:'USD',applies_forward:true},{category_key:'Living expense',month:'2026-10',amount:70,currency:'USD',applies_forward:false},{category_key:'Other expense',month:'2026-11',amount:40,currency:'GBP',applies_forward:false}],
  records:[schedule('Donation','Charity'),schedule('Stopped','Charity',{archived:true}),schedule('Paused','Charity',{source_paused:true}),schedule('Gift','Charity',{frequency:'Once'}),schedule('Club','Other expense',{custom_category_id:'club'}),schedule('Pay','Salary'),schedule('Wrong way','Salary',{custom_category_id:'Charity'})]};
 const charity=categoryPlan('Charity','expense',source);
 assert.equal(charity.budget,200,'the latest forward amount up to this month, converted');
 assert.deepEqual(charity.schedules.map(record=>record.name),['Donation']);
 assert.equal(categoryPlan('Living expense','expense',source).budget,undefined,'an amount for one earlier month only is not this month’s budget');
 assert.equal(categoryPlan('Other expense','expense',source).budget,null,'no rate: unknown, never zero and never under another currency');
 assert.deepEqual(categoryPlan('Other expense','expense',source).schedules,[],'a bill of a custom category is that category’s, not its built-in kind’s');
 assert.deepEqual(categoryPlan('club','expense',source).schedules.map(record=>record.name),['Club']);
 assert.deepEqual(categoryPlan('Salary','income',source).schedules.map(record=>record.name),['Pay'],'income categories count recurring incomes');
 assert.deepEqual(categoryPlan('Salary','expense',source).schedules,[]);
});

test('a sortable item says which edge a dragged item would land on, so a list can draw a drop line there',()=>{
 let state={};
 const r=createRenderer();
 const {SortableItem}=r.load('components/presentation-foundation/sortable.tsx',{'@/components/language-provider':language('en'),'lucide-react':hostModule(),'@dnd-kit/sortable':{useSortable:()=>({attributes:{},listeners:{},setNodeRef(){},setActivatorNodeRef(){},transform:null,transition:undefined,isDragging:false,isSorting:false,index:1,activeIndex:-1,overIndex:-1,...state})},'@dnd-kit/utilities':{CSS:{Translate:{toString:()=>undefined}}}});
 const drop=()=>{r.mount(React.createElement(SortableItem,{id:'b',label:'Charity',as:'li'},'x'));return r.find(node=>node.type==='li').props['data-drop'];};
 assert.equal(drop(),undefined,'nothing is being dragged');
 state={isSorting:true,activeIndex:0,overIndex:1};assert.equal(drop(),'after','dragged down onto it: it lands after');
 state={isSorting:true,activeIndex:3,overIndex:1};assert.equal(drop(),'before','dragged up onto it: it lands before');
 state={isSorting:true,activeIndex:0,overIndex:2};assert.equal(drop(),undefined,'another row is the target');
 state={isSorting:true,isDragging:true,activeIndex:1,overIndex:1};assert.equal(drop(),undefined,'the dragged row itself draws no line');
});

test('Settings is an index card beside rows of label and control, with the open section in the brand tint',()=>{
 const css=stylesheet().replace(/\/\*[\s\S]*?\*\//g,'');
 const layout=fs.readFileSync('components/settings-layout.tsx','utf8');
 assert.match(layout,/<section\.icon size=\{17\} aria-hidden="true"\/>\{t\(section\.label\)\}<\/button>/,'every section has its icon');
 assert.equal(layout.match(/label:'[^']+',icon:\w+\}/g).length,10);
 assert.match(css,/\.settings-nav button\[aria-current=page\]\{background:color-mix\(in srgb,var\(--primary\) 12%,transparent\);color:var\(--primary\);font-weight:600\}/);
 // One row a setting; it stacks only when the page itself is narrow.
 assert.match(css,/\.setting-row\{display:grid;grid-template-columns:minmax\(9rem,14rem\) minmax\(0,1fr\);/);
 assert.match(css,/@container content \(max-width:640px\)\{\s*\.setting-row\{grid-template-columns:minmax\(0,1fr\)\}/);
 const panel=fs.readFileSync('components/settings-panel.tsx','utf8');
 assert.doesNotMatch(panel,/Primary currency|<option value="">|type="submit"/,'no separate Primary select, no country select and no Save button: a change saves at once');
 assert.equal(panel.match(/<SettingsCard /g).length,3);
 // Choices and category rows answer the pointer, the keyboard and a press; motion stops under reduced motion.
 assert.match(css,/\.choice-card:has\(input:focus-visible\)\{outline:2px solid var\(--ring\);outline-offset:2px\}/);
 assert.match(css,/\.category-row:is\(:hover,:focus-within,\[data-dragging\]\) \.category-row-actions\{opacity:1\}/);
 assert.match(css,/@media\(hover:none\)\{\.category-row>\.drag-handle,\.category-row-actions\{opacity:1\}\}/,'touch screens always show the handle and the actions');
 assert.match(css,/\.category-row\[data-drop\]::after\{content:"";position:absolute;inset-inline:8px;height:2px;border-radius:1px;background:var\(--primary\);pointer-events:none\}/);
 assert.match(css,/@container category-list \(max-width:620px\)\{[^@]*\.category-row>\.category-row-plan::before\{content:attr\(data-label\)/,'a narrow row keeps its figures, labelled, under the name');
 // Fonts stay Inter and Onest, and the theme cards offer the device's own setting.
 const {fonts}=loadTS('lib/fonts.ts');
 assert.deepEqual(fonts.map(font=>font.name),['Inter','Onest']);
 assert.match(fs.readFileSync('components/settings/appearance-choices.tsx','utf8'),/const themes = \[\['light', 'Light'\], \['dark', 'Dark'\], \['system', 'Match system'\]\] as const;/);
});
