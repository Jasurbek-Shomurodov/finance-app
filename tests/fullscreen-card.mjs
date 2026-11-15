import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
import {stylesheet} from './helpers/stylesheet.mjs';

// The hook under a small React: state and refs in slots, effects run after each render with their cleanups.
function mount(){
 const slots=[],pending=[];let cursor=0;
 const changed=(a,b)=>!a||a.some((value,i)=>!Object.is(value,b[i]));
 const react={
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
  useRef(initial){const index=cursor++;return slots[index]??(slots[index]={current:initial});},
  useCallback(callback,deps){const index=cursor++;if(changed(slots[index]?.deps,deps))slots[index]={deps,callback};return slots[index].callback;},
  useEffect(effect,deps){const index=cursor++;if(changed(slots[index]?.deps,deps)){const old=slots[index];slots[index]={deps};pending.push(()=>{old?.cleanup?.();slots[index].cleanup=effect();});}},
 };
 const {useFullscreenCard}=loadTS('hooks/use-fullscreen-card.ts',{react});
 return ()=>{cursor=0;const result=useFullscreenCard();while(pending.length)pending.shift()();return result;};
}
// A page with one card holding one chart, and a browser that grants (or refuses) full screen.
function page({grants=true}={}){
 const listeners={},observed=new Set();let resize,mutate;
 const chart={clientHeight:310},card={chart,querySelector:()=>card.chart};
 const document={fullscreenElement:null,documentElement:{style:{overflow:''},requestFullscreen:grants?async()=>{document.fullscreenElement=document.documentElement;}:undefined},
  exitFullscreen:async()=>{document.fullscreenElement=null;listeners.fullscreenchange?.();},
  addEventListener:(name,fn)=>{listeners[name]=fn;},removeEventListener:name=>{delete listeners[name];}};
 globalThis.document=document;
 globalThis.ResizeObserver=class{constructor(fn){resize=fn;}observe(node){observed.add(node);}unobserve(node){observed.delete(node);}disconnect(){observed.clear();}};
 globalThis.MutationObserver=class{constructor(fn){mutate=fn;}observe(){}disconnect(){}};
 return {document,card,chart,listeners,observed,resize:()=>resize(),mutate:()=>mutate()};
}

test('the expand button fills the screen with the card, sizes its chart to the room left, and Escape brings it back',async()=>{
 const dom=page(),render=mount();
 let card=render();card.ref.current=dom.card;
 assert.equal(card.open,false);assert.equal(card.chartHeight,undefined);
 card.toggle();await 0;card=render();card=render();
 assert.equal(card.open,true);
 assert.equal(dom.document.fullscreenElement,dom.document.documentElement,'the browser went full screen from the press');
 assert.equal(dom.document.documentElement.style.overflow,'hidden','the page behind does not scroll');
 assert.equal(card.chartHeight,310);
 // The layout gives the chart the room left; the chart is redrawn to it.
 dom.chart.clientHeight=642.7;dom.resize();card=render();
 assert.equal(card.chartHeight,642);
 // Another period swaps the chart for a skeleton and back: the watcher follows the new chart.
 const next={clientHeight:600};dom.card.chart=null;dom.mutate();assert.equal(dom.observed.size,0);
 dom.card.chart=next;dom.mutate();card=render();
 assert.ok(dom.observed.has(next));assert.equal(card.chartHeight,600);
 // Escape taken by a dialog opened from the card leaves the card full screen.
 dom.listeners.keydown({key:'Escape',defaultPrevented:true});dom.listeners.keydown({key:'a'});card=render();
 assert.equal(card.open,true);
 dom.listeners.keydown({key:'Escape',defaultPrevented:false});await 0;card=render();card=render();
 assert.equal(card.open,false);assert.equal(card.chartHeight,undefined);
 assert.equal(dom.document.fullscreenElement,null);
 assert.equal(dom.document.documentElement.style.overflow,'','the page scrolls again');
 assert.deepEqual(Object.keys(dom.listeners),[],'no listener is left behind');
});

test('the browser\'s own exit and a second press both return the card; without browser full screen the card fills the window',async()=>{
 const dom=page(),render=mount();
 let card=render();card.ref.current=dom.card;
 card.toggle();await 0;card=render();
 dom.listeners.fullscreenchange();card=render();assert.equal(card.open,true,'entering full screen keeps it open');
 dom.document.fullscreenElement=null;dom.listeners.fullscreenchange();card=render();card=render();
 assert.equal(card.open,false);
 card.toggle();await 0;card=render();assert.equal(card.open,true);
 card.toggle();await 0;card=render();assert.equal(card.open,false);assert.equal(dom.document.fullscreenElement,null);
 // An iPhone has no full screen for pages, and a card that has not rendered a chart yet has nothing to size.
 const phone=page({grants:false}),again=mount();
 card=again();phone.card.chart=null;card.ref.current=phone.card;
 card.toggle();card=again();card=again();
 assert.equal(card.open,true);assert.equal(card.chartHeight,undefined);assert.equal(phone.document.fullscreenElement,null);
 card.toggle();card=again();assert.equal(card.open,false);
});

test('the net worth card carries the button, and the stylesheet lays the open card over the app under dialogs',()=>{
 const source=fs.readFileSync('components/portfolio-overview.tsx','utf8'),css=stylesheet();
 assert.match(source,/data-fullscreen=\{filling \|\| undefined\}/);
 assert.match(source,/aria-pressed=\{filling\}/);
 assert.match(source,/<InvestmentComparison [^>]*chartHeight=\{chartHeight\}/);
 const rule=css.match(/\.overview-hero\[data-fullscreen\]\{([^}]*)\}/)?.[1]??'';
 assert.match(rule,/position:fixed;inset:0;z-index:40/);assert.match(rule,/height:100dvh/);
 assert.match(css,/\.overview-hero\[data-fullscreen\]>\.portfolio-chart\{flex:1 1 0;min-height:320px/);
 for(const file of fs.readdirSync('lib/locales')){const labels=JSON.parse(fs.readFileSync('lib/locales/'+file,'utf8'));assert.ok(labels['Open in full screen']&&labels['Exit full screen'],file);}
});
