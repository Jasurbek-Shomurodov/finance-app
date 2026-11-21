import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
import {createRenderer,text,host} from './helpers/component-tree.mjs';
import {stylesheet} from './helpers/stylesheet.mjs';

const {matchRank,matchCommands,recordPath,searchableRecords,commandMenuEvent,openCommandMenu}=loadTS('lib/command-menu.ts');
const line=(id,group,label,keywords)=>({id,group,label,keywords});

test('a search ranks what starts with it over a word that does, over text that only holds it',()=>{
 assert.equal(matchRank('Budget','bud','en-US'),3);
 assert.equal(matchRank('Loans & debts','deb','en-US'),2);
 assert.equal(matchRank('Recently deleted','let','en-US'),1);
 assert.equal(matchRank('Goals','xyz','en-US'),0);
 assert.equal(matchRank('Goals','  ','en-US'),1,'an empty search matches everything');
 // Case folds by the language's own rules: Turkish dotted İ.
 assert.equal(matchRank('İşlemler','işl','tr-TR'),3);
});

test('without a search the menu lists pages and actions; saved records wait for a search',()=>{
 const commands=[line('p1','pages','Dashboard'),line('a1','actions','Add expense'),line('r1','records','Wallet')];
 assert.deepEqual(matchCommands(commands,'','en-US').map(item=>item.id),['p1','a1']);
});

test('a label match outranks a keyword match, ties keep their order and each group stops at its limit',()=>{
 const commands=[line('p1','pages','Cash flow','Income & expenses'),line('p2','pages','Investments','income shares'),line('a1','actions','Add income'),line('r1','records','Income fund','Stock')];
 assert.deepEqual(matchCommands(commands,'inc','en-US').map(item=>item.id),['r1','a1','p1','p2']);
 const many=Array.from({length:12},(_,index)=>line('r'+index,'records','Wallet '+index));
 assert.equal(matchCommands([...many,line('p','pages','Wallets')],'wal','en-US',5).filter(item=>item.group==='records').length,5);
 assert.equal(matchCommands([...many,line('p','pages','Wallets')],'wal','en-US',5).filter(item=>item.group==='pages').length,1);
 assert.deepEqual(matchCommands(commands,'zzz','en-US'),[]);
});

test('choosing a saved record opens the page that lists it',()=>{
 assert.equal(recordPath({kind:'Cash',frequency:'Once'}),'/accounts');
 assert.equal(recordPath({kind:'Cash',frequency:'Once',holding_account_id:'h1'}),'/assets');
 assert.equal(recordPath({kind:'Stock',frequency:'Once'}),'/assets');
 assert.equal(recordPath({kind:'Property',frequency:'Once'}),'/assets');
 assert.equal(recordPath({kind:'Mortgage',frequency:'Monthly'}),'/loans-debts');
 assert.equal(recordPath({kind:'Money lent',frequency:'Once'}),'/loans-debts');
 assert.equal(recordPath({kind:'Salary',frequency:'Monthly'}),'/upcoming');
 assert.equal(recordPath({kind:'Other expense',frequency:'Once'}),'/transactions');
});

test('saved records are searchable once each: no one-time transaction, nothing archived or unnamed',()=>{
 const record=(id,extra={})=>({id,name:'Row '+id,kind:'Cash',frequency:'Once',...extra});
 const found=searchableRecords([record('a'),record('a'),record('b',{kind:'Other expense'}),record('c',{kind:'Salary',frequency:'Monthly'}),record('d',{archived:true}),record('e',{name:'  '}),record('f',{kind:'Rent expense',frequency:'Monthly'})]);
 assert.deepEqual(found.map(item=>item.id),['a','c','f']);
});

test('the search button opens the menu through one window event',()=>{
 const seen=[];globalThis.window={dispatchEvent:event=>seen.push(event.type)};
 openCommandMenu();
 assert.deepEqual(seen,[commandMenuEvent]);
});

function menu({workspace={},theme='light'}={}){
 const listeners={window:{},document:{}},opened=[],ran=[],themes=[];
 globalThis.window={addEventListener:(type,callback)=>{listeners.window[type]=callback;},removeEventListener:type=>{delete listeners.window[type];},dispatchEvent(){}};
 let dialogs=0;
 globalThis.document={addEventListener:(type,callback)=>{listeners.document[type]=callback;},removeEventListener:type=>{delete listeners.document[type];},querySelector:()=>dialogs?{}:null};
 globalThis.HTMLElement=class{};
 const renderer=createRenderer();
 const state={planning:{data:{records:[{id:'w',name:'Wallet',kind:'Cash',frequency:'Once',currency:'USD'},{id:'s',name:'Salary at Acme',kind:'Salary',frequency:'Monthly',currency:'USD'},{id:'t',name:'Coffee',kind:'Other expense',frequency:'Once',currency:'USD'}],goals:[{id:'g',name:'Wedding',archived:false},{id:'old',name:'Wedding ring',archived:true}]}},readOnly:false,quickExpense:()=>ran.push('expense'),addCashFlow:kind=>ran.push('income:'+kind),addAccountRecord:kind=>ran.push('account:'+kind),currency:'USD',setCurrency:code=>ran.push('currency:'+code),preferencesData:{currencies:['USD','EUR']},...workspace};
 const loaded=renderer.load('components/workspace/command-menu.tsx',{
  'next-themes':{useTheme:()=>({resolvedTheme:theme})},
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:(message,values={})=>message.replace(/\{(\w+)\}/g,(_,key)=>values[key])})},
  '@/components/presentation-foundation/record-icon':{RecordIcon:host('record-icon')},
  '@/components/theme-provider':{useThemeSwitch:()=>origin=>themes.push(origin)},
  '@/components/ui/command':{Command:host('command'),CommandEmpty:host('command-empty'),CommandGroup:host('command-group'),CommandInput:host('command-input'),CommandItem:host('command-item'),CommandList:host('command-list')},
  '@/components/ui/dialog':{Dialog:host('dialog'),DialogContent:host('dialog-content'),DialogDescription:host('dialog-description'),DialogTitle:host('dialog-title')},
  '@/components/workspace/workspace-provider':{useWorkspace:()=>state},
 });
 const view={renderer,listeners,opened,ran,themes,setDialogs:count=>{dialogs=count;},
  render:()=>renderer.render(renderer.react.createElement(loaded.CommandMenu,{onNavigate:path=>opened.push(path)})),
  dialog:()=>renderer.find(node=>node.type==='dialog'),
  items:()=>renderer.all(node=>node.type==='command-item'),
  labels:()=>view.items().map(node=>text(node)),
  groups:()=>renderer.all(node=>node.type==='command-group').map(node=>node.props.heading),
  type:value=>renderer.fire(renderer.find(node=>node.type==='command-input'),'onValueChange',value),
  choose:label=>renderer.fire(view.items().find(node=>text(node).includes(label)),'onSelect'),
  key:(key,extra={})=>{let prevented=false;listeners.document.keydown({key,metaKey:false,ctrlKey:false,altKey:false,shiftKey:false,target:null,preventDefault:()=>{prevented=true;},...extra});renderer.update();return prevented;},
 };
 view.render();
 return view;
}

test('the menu opens with ⌘K, Ctrl+K, "/" and the search button, and closes again',()=>{
 const view=menu();
 assert.equal(view.dialog().props.open,false);
 assert.equal(view.key('k',{metaKey:true}),true);assert.equal(view.dialog().props.open,true);
 view.key('K',{ctrlKey:true});assert.equal(view.dialog().props.open,false,'the shortcut toggles');
 assert.equal(view.key('k'),false,'a plain k is just a letter');assert.equal(view.dialog().props.open,false);
 assert.equal(view.key('/'),true);assert.equal(view.dialog().props.open,true);
 view.renderer.fire(view.dialog(),'onOpenChange',false);assert.equal(view.dialog().props.open,false);
 // "/" typed into a field, or while a dialog is open, stays a character.
 const field=new globalThis.HTMLElement();field.tagName='INPUT';
 assert.equal(view.key('/',{target:field}),false);assert.equal(view.dialog().props.open,false);
 const editable=new globalThis.HTMLElement();editable.tagName='DIV';editable.isContentEditable=true;
 assert.equal(view.key('/',{target:editable}),false);
 view.setDialogs(1);assert.equal(view.key('/'),false);assert.equal(view.dialog().props.open,false);
 view.listeners.window[commandMenuEvent]();view.renderer.update();assert.equal(view.dialog().props.open,true);
 view.renderer.unmount();
 assert.deepEqual([Object.keys(view.listeners.window),Object.keys(view.listeners.document)],[[],[]],'listeners leave with the menu');
});

test('unsearched it lists every page and the actions; a page opens as a drawer tap does',()=>{
 const view=menu();
 assert.deepEqual(view.groups(),['Go to','Actions']);
 assert.deepEqual(view.labels().slice(0,3),['Dashboard','Assistant','Accounts']);
 assert.ok(view.labels().includes('Settings'));
 assert.deepEqual(view.labels().slice(-6),['Add expense','Add income','Transfer money','Add account','Switch to dark mode','Show amounts in EUR']);
 view.key('k',{metaKey:true});view.type('bud');
 assert.deepEqual(view.labels(),['Budget','Search transactions for “bud”']);
 view.choose('Budget');
 assert.deepEqual(view.opened,['/budget']);
 assert.equal(view.dialog().props.open,false,'choosing closes the menu');
 assert.equal(view.renderer.find(node=>node.type==='command-input').props.value,'','and clears the search');
});

test('actions run what the workspace offers; a viewer keeps the pages and the display choices only',()=>{
 const view=menu();
 view.choose('Add expense');view.choose('Add income');view.choose('Transfer money');view.choose('Add account');view.choose('Show amounts in EUR');view.choose('Switch to dark mode');
 assert.deepEqual(view.ran,['expense','income:Other income','account:Cash','currency:EUR']);assert.deepEqual(view.opened,['/accounts#transfer'],'a transfer opens on Accounts');
 assert.deepEqual(view.themes,[undefined],'the theme opens from the top of the page');
 const dark=menu({theme:'dark',workspace:{readOnly:true,preferencesData:{currencies:['USD']}}});
 assert.deepEqual(dark.labels().slice(-2),['Settings','Switch to light mode']);
});

test('a search finds saved records and goals by name or kind, and always offers the transactions search',()=>{
 const view=menu();
 view.type('wed');
 assert.deepEqual(view.groups(),['Your records','Transactions']);
 assert.deepEqual(view.labels(),['WeddingGoals','Search transactions for “wed”']);
 view.choose('Wedding');assert.deepEqual(view.opened,['/goals']);
 view.type('sal');view.choose('Salary at Acme');
 view.type('wallet');view.choose('Wallet');
 view.type('coffee & tea');
 assert.deepEqual(view.labels(),['Search transactions for “coffee & tea”'],'a one-time transaction is found on Transactions');
 view.choose('Search transactions');
 assert.deepEqual(view.opened,['/goals','/upcoming','/accounts','/transactions?q=coffee%20%26%20tea']);
});

test('the shell holds one command menu, the top bar its search button, and the styles follow the motion rules',()=>{
 const shell=fs.readFileSync('components/workspace/workspace-shell.tsx','utf8'),bar=fs.readFileSync('components/workspace/top-bar.tsx','utf8'),css=stylesheet();
 assert.equal(shell.split('<CommandMenu ').length,2);
 assert.match(shell,/function go\(path: string\) \{ const page = path\.split\('\?'\)\[0\]; if \(page !== pathname\) navigate\(page\); openPath\(path\); \}/);
 assert.match(bar,/className="command-search" aria-label=\{t\('Search'\)\} aria-keyshortcuts="Meta\+K Control\+K" onClick=\{openCommandMenu\}/);
 assert.ok(!/from '@\/components\/workspace\/command-menu'/.test(bar),'the bar opens the menu by event, without importing it');
 assert.match(css,/\[data-slot=dialog-content\]\.command-menu\{[^}]*backdrop-filter/);
 assert.match(css,/@container topbar \(max-width:900px\)\{\.command-search\{width:38px/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.command-line,\.command-line-icon,\.command-line-enter\{transition:none\}/);
 assert.match(fs.readFileSync('app/globals.css','utf8'),/interaction\.css";\n@import "\.\/styles\/command\.css";/);
});
