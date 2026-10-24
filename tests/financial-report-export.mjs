import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';
function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of React.Children.toArray(node.props?.children)){const match=find(child,predicate);if(match)return match;}}
function fixture(){
 const states=[],built=[],painted=[];let cursor=0;const downloading={current:false};
 const {FinancialReportExport}=loadTS('components/financial-report-export.tsx',{
  react:{...React,useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=value;}];},useRef:()=>downloading},
  '@/components/language-provider':{useLanguage:()=>({t:key=>key,language:'uz'})},
  '@/lib/financial-report':{reportRateDays:()=>({days:['2026-10-15'],currencies:['UZS','USD']}),buildFinancialReport:(backup,language,context,market,options)=>{built.push({backup,language,context,market,options});return {}; }},
  '@/components/presentation-foundation/error-popup':{ErrorPopup:function ErrorPopup(){return null;}},
  '@/lib/financial-report-pdf':{renderFinancialReportPdf:async(report,font,options)=>{painted.push(options);return new Uint8Array([37,80,68,70,45]);}},
 });
 return {render:(demo=false,sample)=>{cursor=0;return FinancialReportExport({demo,currency:'UZS',sample});},built,painted};
}
test('report download uses only the owner backup and local font; failures never download a partial file',async()=>{
 const original={fetch:globalThis.fetch,document:globalThis.document,setTimeout:globalThis.setTimeout,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 let downloads=0,failed=true,fontFailed=false;const requests=[];
 globalThis.fetch=async path=>{requests.push(path);if(path.startsWith('/api/exchange-rate?'))return Response.json({days:{'2026-10-15':{USD:1,UZS:11963.16}}});return path==='/api/backup'?(failed?Response.json({error:'Offline'},{status:503}):Response.json({version:1})):fontFailed?new Response('',{status:503}):new Response(new Uint8Array([1]));};
 globalThis.document={body:{appendChild(){}},createElement:()=>({click(){downloads++;},remove(){}})};
 // Timers run at once: the retry delays of `refreshRead` and the blob's revocation.
 URL.createObjectURL=()=> 'blob:report';URL.revokeObjectURL=()=>{};globalThis.setTimeout=callback=>{callback();return 0;};
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  const h=fixture();const tree=h.render();assert.equal(find(tree,node=>node.type==='textarea'),undefined);
  find(tree,node=>typeof node.props?.onClick==='function').props.onClick();assert.equal(find(h.render(),node=>typeof node.props?.onClick==='function').props.disabled,true);find(h.render(),node=>typeof node.props?.onClick==='function').props.onClick();await flush();await flush();
  // The backup is read through `refreshRead`: a 503 is asked again three times before the export gives up.
  assert.equal(requests.length,5);assert.equal(requests.filter(path=>path==='/api/backup').length,4);assert.equal(downloads,0);assert.equal(h.built.length,0);assert.equal(find(h.render(),node=>node.type?.name==='ErrorPopup').props.message,'Could not export all data. No incomplete backup was created.');
  failed=false;fontFailed=true;find(h.render(),node=>typeof node.props?.onClick==='function').props.onClick();await flush();await flush();
  assert.equal(downloads,0);assert.equal(h.built.length,0);assert.equal(find(h.render(),node=>node.type?.name==='ErrorPopup').props.message,'Could not create the PDF. Please try again.');
  fontFailed=false;find(h.render(),node=>typeof node.props?.onClick==='function').props.onClick();await flush();await flush();
  assert.equal(downloads,1);assert.deepEqual(h.built,[{backup:{version:1},language:'uz',context:'',market:null,options:{currency:'UZS',dayRates:{'2026-10-15':{USD:1,UZS:11963.16}}}}]);assert.ok(requests.every(path=>path==='/api/backup'||path==='/fonts/NotoSans-Regular.ttf'||path==='/api/exchange-rate?days=2026-10-15&currencies=UZS,USD'),'only the backup, the font and the days\' official rates');
  assert.equal(find(h.render(true),node=>typeof node.props?.onClick==='function').props.disabled,true);
 }finally{globalThis.fetch=original.fetch;globalThis.document=original.document;globalThis.setTimeout=original.setTimeout;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;}
});

test('the sample workspace downloads its own report from the sample data, with category icons, never the owner backup',async()=>{
 const original={fetch:globalThis.fetch,document:globalThis.document,setTimeout:globalThis.setTimeout,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 let downloads=0;const requests=[];
 globalThis.fetch=async path=>{requests.push(path);return new Response(new Uint8Array([1]));};
 globalThis.document={body:{appendChild(){}},createElement:()=>({click(){downloads++;},remove(){}})};
 URL.createObjectURL=()=> 'blob:report';URL.revokeObjectURL=()=>{};globalThis.setTimeout=()=>0;
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  const h=fixture(),sample=()=>({version:1,sample:true});
  const button=find(h.render(true,sample),node=>typeof node.props?.onClick==='function');
  assert.equal(button.props.disabled,false);
  button.props.onClick();await flush();await flush();
  assert.equal(downloads,1);assert.deepEqual(requests,['/fonts/NotoSans-Regular.ttf']);
  assert.deepEqual(h.built[0].backup,{version:1,sample:true});assert.deepEqual(h.built[0].options,{currency:'UZS'});
  assert.equal(typeof h.painted[0].emojiImage,'function');
 }finally{globalThis.fetch=original.fetch;globalThis.document=original.document;globalThis.setTimeout=original.setTimeout;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;}
});
test('a backup that fails once is read again and the report downloads; a day whose rates fail is left missing',async()=>{
 const original={fetch:globalThis.fetch,document:globalThis.document,setTimeout:globalThis.setTimeout,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 let downloads=0,backups=0;const requests=[];
 globalThis.fetch=async path=>{requests.push(path);if(path.startsWith('/api/exchange-rate?'))return Response.json({error:'Rates are unavailable.'},{status:400});if(path==='/api/backup')return ++backups===1?Response.json({error:'Busy'},{status:503}):Response.json({version:1});return new Response(new Uint8Array([1]));};
 globalThis.document={body:{appendChild(){}},createElement:()=>({click(){downloads++;},remove(){}})};
 URL.createObjectURL=()=> 'blob:report';URL.revokeObjectURL=()=>{};globalThis.setTimeout=callback=>{callback();return 0;};
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  const h=fixture();find(h.render(),node=>typeof node.props?.onClick==='function').props.onClick();await flush();await flush();
  assert.equal(downloads,1);assert.equal(backups,2,'the second read of the backup answers');
  assert.deepEqual(h.built[0].options,{currency:'UZS',dayRates:{}},'a day without rates is left to read Not available');
  assert.equal(requests.filter(path=>path.startsWith('/api/exchange-rate?')).length,1,'a 400 is not retried');
 }finally{globalThis.fetch=original.fetch;globalThis.document=original.document;globalThis.setTimeout=original.setTimeout;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;}
});
