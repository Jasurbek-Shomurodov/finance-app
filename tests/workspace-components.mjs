import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
const overrides={'@/components/language-provider':language};
test('filters sit behind an accessible Filters disclosure at every width, with the search outside it',()=>{
 const {RecordFilters}=loadTS('components/record-filters.tsx',overrides);
 const html=renderToStaticMarkup(React.createElement(RecordFilters,{value:{query:'shop',category:'all',from:'',to:'',order:'newest'},onChange:()=>{},categories:[],kinds:[]}));
 assert.match(html,/aria-expanded="false"/);assert.match(html,/aria-controls=/);assert.match(html,/data-expanded="false"/);assert.match(html,/value="shop"/);assert.match(html,/Filters.*1/);
 // A filter already set opens the disclosure, so it is never hidden while it narrows the list; a search alone does not.
 const set=renderToStaticMarkup(React.createElement(RecordFilters,{value:{query:'',category:'Loan',from:'',to:'',order:'newest'},onChange:()=>{},categories:[],kinds:['Loan']}));
 assert.match(set,/aria-expanded="true"/);assert.match(set,/data-expanded="true"/);
});
test('failed settings render a retry control and prevent saving fallback preferences',()=>{
 const {SettingsPanel}=loadTS('components/settings-panel.tsx',{...overrides,'@/components/investment-comparison-settings':{InvestmentComparisonSettings:()=>null}});
 const html=renderToStaticMarkup(React.createElement(SettingsPanel,{initial:{language:'en',currencies:['USD']},demo:false,onSaved:()=>{},loading:false,loadError:'Offline',onRetry:()=>{}}));
 assert.match(html,/Retry loading settings/);assert.match(html,/role="alert"/);assert.match(html,/<fieldset[^>]*disabled=""/);assert.doesNotMatch(html,/Save changes/);
});
test('partial totals explicitly name excluded currencies and disappear when coverage is complete',()=>{
 const {PartialTotal}=loadTS('components/presentation-foundation/partial-total.tsx',overrides);
 assert.equal(renderToStaticMarkup(React.createElement(PartialTotal,{currencies:[]})),'');
 const html=renderToStaticMarkup(React.createElement(PartialTotal,{currencies:['EUR','UZS']}));assert.match(html,/Partial total/);assert.match(html,/EUR, UZS/);
});
test('discard guard keeps changed forms open until explicitly discarded, and leaves clean forms immediately',()=>{
 const slots=[],effects=[];let cursor=0,closed=0;const listeners=new Map();const previousWindow=globalThis.window;
 const hooks={...React,useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},useRef(initial){const index=cursor++;return slots[index]??(slots[index]={current:initial});},useEffect(effect){effects.push(effect);}};
 globalThis.window={addEventListener:(type,callback)=>listeners.set(type,callback),removeEventListener:type=>listeners.delete(type)};
 try{
  // This harness supplies fake hook primitives and invokes the loaded function directly.
  const {useDiscardChanges:runDiscardGuard}=loadTS('components/discard-changes.tsx',{...overrides,react:hooks,'@/components/ui/alert-dialog':{}});
  const render=(dirty,busy=false)=>{cursor=0;return runDiscardGuard(dirty,()=>closed++,busy);};
  render(false).close();assert.equal(closed,1);
  render(true).close();let result=render(true);assert.equal(closed,1);assert.equal(result.confirmation.props.open,true);
  result.confirmation.props.setOpen(false);assert.equal(render(true).confirmation.props.open,false);assert.equal(closed,1);
  render(true,true).close();assert.equal(render(true).confirmation.props.open,false);
  render(true).close();result=render(true);result.confirmation.props.discard();assert.equal(closed,2);assert.equal(render(true).confirmation.props.open,false);
 }finally{globalThis.window=previousWindow;}
});
test('the page-form guard attaches its document listener once per dirty stretch, not on every render, and still prompts',()=>{
 // A tiny renderer: useEffect honours its dependency list, so an effect keyed on a fresh object would re-run every render;
 // useEffectEvent hands back the latest function, as React's does.
 const slots=[],effects=[];let cursor=0;
 const changed=(a,b)=>!a||a.length!==b.length||a.some((value,i)=>!Object.is(value,b[i]));
 const hooks={...React,useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},useRef(initial){const index=cursor++;return slots[index]??(slots[index]={current:initial});},useEffect(effect,deps){const index=cursor++;if(changed(slots[index]?.deps,deps)){const old=slots[index];slots[index]={deps};effects.push(()=>{old?.cleanup?.();slots[index].cleanup=effect();});}},useEffectEvent(callback){const index=cursor++;slots[index]=callback;return (...args)=>slots[index](...args);}};
 // Loaded before the fake document is installed: a dependency reads the real one while loading.
 const {useUnsavedNavigation:runNavigationGuard}=loadTS('components/discard-changes.tsx',{...overrides,react:hooks,'@/components/ui/alert-dialog':{}});
 const added=[],removed=[];const previousWindow=globalThis.window,previousDocument=globalThis.document;
 globalThis.window={addEventListener:()=>{},removeEventListener:()=>{},location:{href:'https://app.local/budget',assign:href=>added.push('assign:'+href)}};
 globalThis.document={addEventListener:(type,callback,capture)=>added.push({type,capture,callback}),removeEventListener:type=>removed.push(type)};
 try{
  const render=dirty=>{cursor=0;const result=runNavigationGuard(dirty);while(effects.length)effects.shift()();return result;};
  render(true);render(true);render(true);
  assert.equal(added.filter(item=>item.type==='click').length,1,'three dirty renders attach one capture-phase listener');
  assert.equal(added[0].capture,true);assert.deepEqual(removed,[]);
  // The listener still reaches the latest guard: a plain link click is held behind the prompt instead of leaving.
  const link={target:'',href:'https://app.local/transactions',hasAttribute:()=>false,closest:()=>link};
  const element=class{};globalThis.Element=element;Object.setPrototypeOf(link,element.prototype);
  let prevented=0;added[0].callback({defaultPrevented:false,button:0,target:link,preventDefault:()=>prevented++,stopPropagation:()=>{}});
  assert.equal(prevented,1);assert.equal(render(true).props.open,true,'the discard prompt opens');
  assert.deepEqual(added.filter(item=>typeof item==='string'),[],'nothing navigated yet');
  render(false);assert.deepEqual(removed,['click'],'a clean form removes the listener once');
 }finally{globalThis.window=previousWindow;globalThis.document=previousDocument;delete globalThis.Element;}
});
test('account security clears the persistent workspace session before navigating after a password change',async context=>{
 const navigation=[];let cleared=false;context.mock.method(globalThis,'fetch',async()=>Response.json({message:'Password changed.'}));
 const {AccountAccessPanel}=loadTS('components/account-access-panel.tsx',{...overrides,react:{...React,useState:initial=>[initial,()=>{}],useEffect:()=>{},useId:()=>'password-hint'},'@/hooks/use-owner-resource':{useSessionResource:()=>({data:{}})},'next/navigation':{useRouter:()=>({replace:path=>{assert.ok(cleared);navigation.push(path);},refresh:()=>{}})}});
 const tree=AccountAccessPanel({settings:true,onSignedOut:()=>{cleared=true;}});const find=node=>{if(!node||typeof node!=='object')return null;if(node.type==='form')return node;return React.Children.toArray(node.props?.children).map(find).find(Boolean);};
 await find(tree).props.onSubmit({preventDefault:()=>{}});assert.equal(cleared,true);assert.deepEqual(navigation,['/']);
});

test('profile settings shows the shared country picker with its prompt and saved selection',()=>{
 const {SettingsPanel}=loadTS('components/settings-panel.tsx',overrides);
 const render=country=>renderToStaticMarkup(React.createElement(SettingsPanel,{initial:{language:'en',currencies:['USD'],country},demo:false,onSaved:()=>{},loading:false,loadError:'',onRetry:()=>{}}));
 const html=render('');
 assert.match(html,/<label for="profile-country">Country \/ region \(optional\)/);
 assert.match(html,/<select[^>]*data-slot="native-select"[^>]*id="profile-country"/);
 assert.match(html,/<option value="" selected="">Select your country<\/option>/);
 assert.match(render('UZ'),/<option value="UZ" selected="">Uzbekistan<\/option>/);
});
test('preferred currencies stop at two: the trigger adds below the limit and changes at it',()=>{
 const {SettingsPanel}=loadTS('components/settings-panel.tsx',overrides);
 const render=currencies=>renderToStaticMarkup(React.createElement(SettingsPanel,{initial:{language:'en',currencies},demo:false,onSaved:()=>{},loading:false,loadError:'',onRetry:()=>{}}));
 const one=render(['USD']),two=render(['USD','INR']);
 assert.match(one,/Add currency/);assert.doesNotMatch(one,/Change currencies/);
 assert.match(two,/Change currencies/);assert.doesNotMatch(two,/Add currency/);
 // The explanation sits behind the heading's ⓘ, not as a grey sentence under it.
 assert.doesNotMatch(two,/Choose one or two\./);
 assert.match(fs.readFileSync('components/settings-panel.tsx','utf8'),/<h4>\{t\('Preferred currencies'\)\}<InfoHint>\{t\('Shown in the top bar and whenever you choose a currency\. Choose one or two\.'\)\}<\/InfoHint><\/h4>/);
 assert.match(two,/aria-label="Remove INR"/);assert.doesNotMatch(two,/aria-label="Remove USD"/);
});
