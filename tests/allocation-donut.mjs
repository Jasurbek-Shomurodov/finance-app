import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const language={useLanguage:()=>({locale:'en-US',t:text=>text})};
const host=name=>{const Host=({children,data})=>React.createElement('div',{'data-host':name,...(data?{'data-kinds':data.map(item=>item.kind).join(',')}:{})},children);Host.displayName=name;return Host;};
const recharts=Object.fromEntries(['Cell','Pie','PieChart','ResponsiveContainer','Tooltip'].map(name=>[name,host(name)]));

test('the allocation donut draws each kind with a value, names every share and shows the total in its middle',()=>{
 const {AllocationDonut}=loadTS('components/allocation-donut.tsx',{recharts,'@/components/language-provider':language});
 const html=renderToStaticMarkup(React.createElement(AllocationDonut,{slices:[{kind:'Property',amount:265000},{kind:'Business',amount:97812},{kind:'Deposit',amount:0}],total:362812,currency:'USD'}));
 assert.match(html,/aria-label="Asset allocation: Property 73%, Business 27%"/);
 assert.match(html,/data-kinds="Property,Business"/,'a kind worth nothing has no slice');
 assert.match(html,/<strong>\$363K<\/strong><span>Total assets<\/span>/);
});

test('a tap on a slice opens its kind',()=>{
 const opened=[];
 const {AllocationDonut}=loadTS('components/allocation-donut.tsx',{recharts:{...recharts,Pie:props=>{props.onClick({payload:{kind:'Property'}});props.onClick({});return null;}},'@/components/language-provider':language});
 renderToStaticMarkup(React.createElement(AllocationDonut,{slices:[{kind:'Property',amount:1}],total:1,currency:'USD',onSelect:kind=>opened.push(kind)}));
 assert.deepEqual(opened,['Property']);
});
