import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,text,host} from './helpers/component-tree.mjs';

const item=(name,direction,amount,currency='USD')=>({key:name,record:{name,kind:direction==='income'?'Salary':'Living expense',currency},date:'2026-10-01',status:'due',direction,amount});
function open(items){
 const renderer=createRenderer();
 const {RecurringFlowButton}=renderer.load('components/planning/recurring-flow-button.tsx',{
  '@/components/language-provider':{useLanguage:()=>({t:message=>message,locale:'en-US'})},
  '@/components/ui/button':{Button:host('button')},
  '@/components/cash-flow-drill-lazy':{FlowDialog:host('flow-dialog')},
  'lucide-react':{Workflow:host('svg')},
 });
 const convert=(amount,currency)=>currency==='USD'?amount:null;
 renderer.render(renderer.react.createElement(RecurringFlowButton,{items,month:'2026-10',currency:'USD',convert}));
 return renderer;
}
const dialogs=renderer=>renderer.all(node=>node.type==='flow-dialog');

test('Money flow opens the month’s schedules as a Sankey under the month’s name, and closes again',()=>{
 const renderer=open([item('Salary','income',1000),item('Rent','expense',300)]);
 const button=renderer.find(node=>node.type==='button');
 assert.equal(text(button),'Money flow');assert.equal(button.props.type,'button');
 // Nothing is worked out until it is opened.
 assert.equal(dialogs(renderer).length,0);
 renderer.fire(button,'onClick');
 const [dialog]=dialogs(renderer);
 assert.equal(dialog.props.title,'Money flow');assert.equal(dialog.props.figure,'October 2026');assert.equal(dialog.props.currency,'USD');
 assert.deepEqual(dialog.props.flows.nodes.map(node=>node.name),['Salary','Recurring','Rent','Left after expenses']);
 assert.equal(renderer.all(node=>node.type==='p').length,0,'a complete month needs no note');
 renderer.fire(dialog,'onClose');
 assert.equal(dialogs(renderer).length,0);
});

test('a schedule without a rate leaves a note that the totals are incomplete',()=>{
 const renderer=open([item('Salary','income',1000),item('Rent','expense',300,'EUR')]);
 renderer.fire(renderer.find(node=>node.type==='button'),'onClick');
 assert.equal(dialogs(renderer)[0].props.flows.missing,1);
 const note=renderer.find(node=>node.type==='p');
 assert.equal(note.props.role,'status');assert.equal(note.props.className,'partial-total');
 assert.equal(text(note),'Some transactions could not be converted. Current or previous month totals are incomplete.');
});
