import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,text,host} from './helpers/component-tree.mjs';

function open(){
 const renderer=createRenderer();
 const {AddAssetDialog,choosableAssetKinds}=renderer.load('components/planning/add-asset-dialog.tsx',{
  '@/components/language-provider':{useLanguage:()=>({t:message=>message})},
  '@/components/ui/dialog':{Dialog:host('dialog'),DialogContent:host('dialog-content'),DialogTitle:host('h2'),DialogDescription:host('p')},
  '@/components/presentation-foundation/record-icon':{RecordIcon:host('record-icon')},
 });
 const calls={open:[],chosen:[]};
 const tree=renderer.render(renderer.react.createElement(AddAssetDialog,{open:true,onOpenChange:next=>calls.open.push(next),onChoose:kind=>calls.chosen.push(kind)}));
 return {renderer,tree,calls,choosableAssetKinds};
}

test('Add asset offers every asset kind except cash and deposits, which are added as accounts',()=>{
 const {renderer,choosableAssetKinds}=open();
 assert.equal(text(renderer.find(node=>node.type==='h2')),'Add asset');
 const tiles=renderer.all(node=>node.type==='button');
 assert.deepEqual(tiles.map(tile=>text(tile)),choosableAssetKinds);
 assert.deepEqual(choosableAssetKinds,['Stock','Crypto','Precious metals','Equity compensation','Treasury bill','Bond','Retirement account','Property','Business','Vehicle','Valuables']);
 for(const kind of ['Cash','Deposit','Money lent'])assert.ok(!choosableAssetKinds.includes(kind),kind);
 // Each tile shows the kind's own icon.
 assert.deepEqual(renderer.all(node=>node.type==='record-icon').map(icon=>icon.props.record.kind),choosableAssetKinds);
});

test('choosing a kind closes the list and opens that kind',()=>{
 const {renderer,calls}=open();
 renderer.all(node=>node.type==='button').find(tile=>text(tile)==='Bond').props.onClick();
 assert.deepEqual(calls.open,[false]);
 assert.deepEqual(calls.chosen,['Bond']);
});
