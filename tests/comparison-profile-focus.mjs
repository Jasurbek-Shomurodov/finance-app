import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer } from './helpers/component-tree.mjs';

test('the comparison profile reads again on a saved setting at once, and on focus only a minute after the last read',()=>{
 const listeners={},revisions=[];let now=1_000_000;
 globalThis.window={addEventListener:(name,fn)=>{listeners[name]=fn;},removeEventListener:name=>{delete listeners[name];}};
 const realNow=Date.now;Date.now=()=>now;
 try{
  const r=createRenderer();
  const {useComparisonProfile,focusRereadMs}=r.load('hooks/use-comparison-profile.ts',{'@/hooks/use-owner-resource':{useOwnerResource:(url,owner,enabled,revision)=>{revisions.push(revision);return {data:null,error:'',retry(){},update(){}};}}});
  const Probe=()=>{useComparisonProfile(false);return null;};
  r.mount(React.createElement(Probe));
  const last=()=>revisions.at(-1);
  assert.equal(last(),0);
  now+=5_000;listeners.focus();r.update();
  assert.equal(last(),0,'switching back to the tab a moment later reads nothing');
  listeners['comparison-settings-saved']();r.update();
  assert.equal(last(),1,'a saved setting reads at once');
  now+=focusRereadMs-1;listeners.focus();r.update();assert.equal(last(),1);
  now+=1;listeners.focus();r.update();assert.equal(last(),2,'a minute after the last read, focus reads again');
 }finally{Date.now=realNow;delete globalThis.window;}
});
