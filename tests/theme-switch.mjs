import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRenderer,host} from './helpers/component-tree.mjs';
import {stylesheet} from './helpers/stylesheet.mjs';

function setup({theme='light',transitions=true,reduced=false}={}){
 const set=[],style={},dataset={},started=[];let finish;
 globalThis.window={innerWidth:1000,innerHeight:800,matchMedia:()=>({matches:reduced})};
 globalThis.document={documentElement:{style:{setProperty:(name,value)=>{style[name]=value;}},dataset},...(transitions?{startViewTransition:update=>{started.push({...dataset});update();return {finished:new Promise(resolve=>{finish=resolve;})};}}:{})};
 const renderer=createRenderer();
 const loaded=renderer.load('components/theme-provider.tsx',{
  'react-dom':{flushSync:run=>run()},
  'next-themes':{ThemeProvider:host('next-themes'),useTheme:()=>({resolvedTheme:theme,setTheme:next=>set.push(next)})},
  '@/components/language-provider':{useLanguage:()=>({t:message=>message})},
  '@/components/ui/button':{Button:host('button')},
 });
 renderer.render(renderer.react.createElement(loaded.ThemeToggle));
 return {set,style,dataset,started,renderer,loaded,finish:()=>finish(),button:()=>renderer.find(node=>node.type==='button')};
}
const press={currentTarget:{getBoundingClientRect:()=>({left:900,top:10,width:40,height:40})}};

test('the toggle opens the other theme as a circle from where it was pressed, reaching the farthest corner',async()=>{
 const view=setup();
 view.button().props.onClick(press);
 assert.deepEqual(view.set,['dark']);
 assert.deepEqual(view.style,{'--theme-x':'920px','--theme-y':'30px','--theme-r':`${Math.ceil(Math.hypot(920,770))}px`});
 assert.deepEqual(view.started,[{themeSwitch:''}],'the page is marked before the transition captures it');
 assert.equal(view.dataset.themeSwitch,'');
 view.finish();await new Promise(resolve=>setImmediate(resolve));
 assert.equal('themeSwitch' in view.dataset,false,'the mark leaves with the transition');
 const dark=setup({theme:'dark'});dark.button().props.onClick(press);assert.deepEqual(dark.set,['light']);
});

test('without view transitions, or under reduced motion, the theme simply changes',()=>{
 for(const options of [{transitions:false},{reduced:true}]){
  const view=setup(options);
  view.button().props.onClick(press);
  assert.deepEqual(view.set,['dark']);assert.deepEqual(view.style,{});assert.deepEqual(view.started,[]);
 }
});

test('a switch without an origin (the command menu) opens from the top of the page',()=>{
 const view=setup();
 function Probe(){view.switch=view.loaded.useThemeSwitch();return null;}
 view.renderer.render(view.renderer.react.createElement(Probe));
 view.switch();
 assert.deepEqual([view.style['--theme-x'],view.style['--theme-y']],['500px','0px']);
});

test('the reveal is drawn only while a switch runs and never under reduced motion',()=>{
 const css=stylesheet();
 assert.match(css,/html\[data-theme-switch\]::view-transition-old\(root\)\{animation:none;z-index:0\}/);
 assert.match(css,/html\[data-theme-switch\]::view-transition-new\(root\)\{animation:theme-reveal \.52s var\(--ease-out\) both/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{[^@]*html\[data-theme-switch\]::view-transition-new\(root\)\{animation:none\}/);
 assert.match(fs.readFileSync('components/theme-provider.tsx','utf8'),/defaultTheme="system" enableSystem storageKey="hoggish-theme"/);
});
