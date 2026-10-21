import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
import {reportFixture,reportMarket} from './helpers/report-fixture.mjs';

const kit=loadTS('lib/report-pdf-kit.ts');
const {tilesChart,sankeyChart,barsChart,sharesChart}=loadTS('lib/report-pdf-charts.ts');
const {layoutReport}=loadTS('lib/report-pdf-layout.ts');
const {renderFinancialReportPdf,fontText}=loadTS('lib/financial-report-pdf.ts');
const {buildFinancialReport}=loadTS('lib/financial-report.ts');
const {axisTicks,categoryLooks,savingsIcon}=loadTS('lib/financial-report-visuals.ts');
const {sampleBackup,parseFinanceBackup}=loadTS('lib/report-figures.ts');
const {demoWorkspace,demoMarket}=loadTS('lib/demo-finance.ts');

/** Every character 5pt wide per 10pt, like a plain sans; nothing is removed. */
const fonts={width:(text,size)=>Array.from(text).length*size*.5,clean:text=>text};
const texts=ops=>ops.filter(op=>op.op==='text').map(op=>op.text);
const entry=(id,kind,amount,extra={})=>({id,name:id,kind,amount,currency:'USD',quantity:1,cost:0,rate:0,ownership_percentage:100,frequency:'Once',date:'2026-09-10',notes:'',...extra});
const font=fs.readFileSync('public/fonts/NotoSans-Regular.ttf');
// A 1×1 transparent PNG, standing in for an emoji the browser drew.
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64'));

test('the page kit converts category hues, wraps long words and rounds rectangles',()=>{
 assert.equal(kit.hueHex(0),'#c43131');assert.equal(kit.hueHex(120,70,92),'#dcf9dc');
 assert.deepEqual(kit.wrap(fonts,'a '+'x'.repeat(12),10,30),['a','xxxxxx','xxxxxx']);
 assert.deepEqual(kit.wrap(fonts,'one\ntwo',10,100),['one','two']);
 assert.match(kit.roundedRect(0,0,10,4,9),/^M2 0H8Q10 0 10 2/);
 assert.equal(kit.initial(fonts,'  groceries'),'G');assert.equal(kit.initial(fonts,''),'');
 assert.equal(kit.toneColor('positive'),kit.colors.positive);assert.equal(kit.toneColor('negative'),kit.colors.negative);assert.equal(kit.toneColor(undefined),kit.colors.ink);
});

test('a card that reaches the page bottom closes there and continues on the next page under the running header',()=>{
 const flow=kit.createFlow(fonts,'Report');
 flow.openCard();flow.openCard();flow.text('',0,0,9);
 assert.equal(flow.page().ops.length,0,'empty text is not drawn');
 flow.y=kit.pageBottom-10;flow.ensure(100);
 assert.equal(flow.pages.length,2);assert.equal(flow.inCard(),true);
 assert.equal(flow.pages[0].back.filter(op=>op.fill===kit.colors.card).length,1);
 assert.deepEqual(texts(flow.pages[1].ops),['Report']);
 // A fresh page never breaks again, however tall the content.
 flow.ensure(5000);assert.equal(flow.pages.length,2);
 flow.closeCard();flow.closeCard();flow.y=kit.pageBottom;flow.ensure(10);assert.equal(flow.pages.length,3);assert.equal(flow.inCard(),false);
});

test('tiles shrink a long figure to fit and tone only figures whose sign means something',()=>{
 const chart=tilesChart(fonts,[{label:'Net worth',value:'$1,234,567,890,123',tone:'negative',detail:'Exchange rate unavailable.'},{label:'Spending',value:'$5',tone:'plain'},{label:'Savings rate',value:'19%',tone:'positive',detail:'+$890'}],500);
 const ops=chart.draw(0,0),values=ops.filter(op=>op.op==='text'&&op.medium);
 assert.ok(values[0].size<17&&values[1].size===17);
 assert.equal(values[0].color,kit.colors.negative);assert.equal(values[1].color,kit.colors.ink);
 assert.equal(ops.find(op=>op.text==='+$890').color,kit.colors.positive);
 assert.equal(ops.find(op=>op.text==='Exchange rate unavailable.').color,kit.colors.negative);
 assert.ok(tilesChart(fonts,[{label:'A',value:'1'}],100).height<chart.height);
});

const sankey=(savings=true)=>({kind:'sankey',text:'Where your money went',nodes:[
 {label:'Salary',value:'$900',amount:900,kind:'income',icon:{emoji:'💰',hue:120}},{label:'Rent income',value:'$100',amount:100,kind:'income',icon:{emoji:'🏘️',hue:165}},
 {label:'Income',value:'$1,000',amount:1000,kind:'total'},
 {label:'Groceries and a very long category name that wraps',value:'$700',amount:700,kind:'expense',icon:{emoji:'🥦',hue:48}},
 ...(savings?[{label:'Savings',value:'$300',amount:300,kind:'savings',icon:savingsIcon}]:[{label:'Charity',value:'$600',amount:600,kind:'expense',icon:{emoji:'🤲',hue:290}}]),
],links:[{source:0,target:2,value:900},{source:1,target:2,value:100},{source:2,target:3,value:700},{source:2,target:4,value:savings?300:600}]});

test('the Sankey draws a ribbon per flow under labelled, icon-tiled nodes, and keeps an overspend visible',()=>{
 const chart=sankeyChart(fonts,sankey(),480),ops=chart.draw(10,20);
 assert.equal(ops.filter(op=>op.op==='path').length,4);
 assert.ok(ops.findIndex(op=>op.op!=='path')>ops.findLastIndex(op=>op.op==='path'),'labels are drawn over the flows');
 assert.deepEqual(ops.filter(op=>op.op==='icon').map(op=>op.emoji),['💰','🏘️','🥦','🐷']);
 for(const name of ['Salary','$900','Income','$1,000','Savings','$300'])assert.ok(texts(ops).includes(name),name);
 assert.ok(texts(ops).filter(text=>text.startsWith('Groceries')||text.includes('wraps')).length===2,'a long name takes two lines');
 assert.equal(ops.find(op=>op.op==='rect'&&op.fill===kit.colors.mark).h>0,true);
 // Spending above income: the right side is taller than what came in, and the total still sits between them.
 const over=sankeyChart(fonts,sankey(false),480);
 assert.ok(over.height>0);assert.equal(over.draw(0,0).filter(op=>op.op==='path').length,4);
 const lone=sankeyChart(fonts,{...sankey(),nodes:sankey().nodes.map(node=>node.kind==='total'?{...node,kind:'expense'}:node)},480);
 assert.ok(!lone.draw(0,0).some(op=>op.op==='rect'&&op.fill===kit.colors.mark),'no total node, no total bar');
});

test('income and spending bars follow the axis; a month that could not be converted shows a dash and a note',()=>{
 const block={kind:'bars',text:'',legend:['Income','Spending'],bars:[{label:'Sep',income:900,spending:0},{label:'Oct',income:null,spending:null}],ticks:[{value:0,label:'$0'},{value:500,label:'$500'},{value:1000,label:'$1K'}],missing:'Exchange rate unavailable.'};
 const ops=barsChart(fonts,block,400).draw(0,0),bars=ops.filter(op=>op.op==='rect'&&op.w<10&&op.h!==8);
 assert.equal(bars.length,1,'a zero bar is not drawn');assert.equal(bars[0].fill,kit.colors.positive);
 for(const label of ['Income','Spending','$1K','—','Sep','Oct','Exchange rate unavailable.'])assert.ok(texts(ops).includes(label),label);
 assert.ok(barsChart(fonts,{...block,missing:undefined},400).height<barsChart(fonts,block,400).height);
});

test('shares draw an icon, a bar in the category hue, the percentage and the amount; stacked shares add one bar on top',()=>{
 const rows=[{label:'Property',value:'$900',share:'90%',fraction:.9,icon:{emoji:'🏠',hue:275}},{label:'Cash',value:'$100',share:'10%',fraction:.1,icon:{emoji:'💵',hue:145}},{label:'Nothing',value:'$0',share:'0%',fraction:0,icon:{emoji:'🏷️',hue:330}}];
 const plain=sharesChart(fonts,{kind:'shares',text:'',rows},400),stacked=sharesChart(fonts,{kind:'shares',text:'',rows,stacked:true},400);
 assert.equal(stacked.height-plain.height,22);
 const ops=stacked.draw(0,0);
 assert.equal(ops.filter(op=>op.op==='icon').length,3);
 assert.equal(ops.filter(op=>op.op==='rect'&&op.h===10).length,3,'track plus a segment per share above zero');
 for(const label of ['Property','90%','$900','$0'])assert.ok(texts(ops).includes(label),label);
});

test('blocks flow onto pages: the cover on the grey page, sections and charts on cards, tall rows split by line',()=>{
 const tall=Array.from({length:120},(_,i)=>`line ${i}`).join('\n');
 const blocks=[
  {kind:'cover',text:'Personal financial report',brand:'Hoggish',lines:['Reporting period: 1 October 2026 – 21 October 2026']},
  {kind:'tiles',text:'',tiles:[{label:'Income',value:'$1'}]},
  {kind:'text',text:'A note on the grey page.'},
  sankey(),
  {kind:'pageBreak',text:''},{kind:'pageBreak',text:''},
  {kind:'title',text:'Tax prep'},
  {kind:'heading',text:'Assets'},{kind:'subheading',text:'Cash'},
  {kind:'table',text:'',headers:['Name','Value'],widths:[.6,.4],numeric:[1],rows:[['Wallet','$5'],['Notes',tall],...Array.from({length:60},(_,i)=>[`Row ${i}`,'$1'])]},
  {kind:'table',text:'',headers:['Only'],widths:[1],rows:[['x']]},
  {kind:'heading',text:'Empty'},
 ];
 const pages=layoutReport(blocks,fonts,'Personal financial report'),all=pages.flatMap(page=>texts(page.ops));
 assert.ok(pages.length>=4);
 assert.ok(all.includes('h.')&&all.includes('Hoggish')&&all.includes('Tax prep')&&all.includes('Row 59'));
 assert.equal(all.filter(text=>/^line \d+$/.test(text)).length,120,'no line of a tall row is lost');
 assert.ok(all.filter(text=>text==='Name').length>2,'the header repeats on each page of a table');
 assert.ok(pages.every(page=>page.back[0].fill===kit.colors.page));
 assert.ok(pages.every(page=>page.ops.every(op=>op.op!=='text'||op.y<=kit.pageHeight-40)),'nothing is drawn over the footer');
 // A table with no open card opens one.
 assert.ok(layoutReport([{kind:'table',text:'',headers:['A'],widths:[1],rows:[['b']]}],fonts,'R')[0].back.some(op=>op.fill===kit.colors.card));
});

test('category looks follow Settings: an added category\'s name, a chosen icon and colour, else the defaults',()=>{
 const looks=categoryLooks({t:key=>`t:${key}`,tables:{transaction_categories:[{id:'c1',name:' Snacks '},{id:'c2',name:''}],workspace_preferences:[{key:'category_icons',data:{icons:{c1:'🍕'},colors:{c1:'blue'}}}]}});
 assert.equal(looks.label('c1'),'Snacks');assert.equal(looks.label('c2'),'t:c2');assert.equal(looks.label('Salary'),'t:Salary');assert.equal(looks.label('\u0000other'),'t:Other');
 assert.equal(looks.icon('c1').emoji,'🍕');assert.equal(looks.icon('Salary').emoji,'💰');assert.equal(looks.icon('\u0000other').emoji,'🏷️');
 assert.notEqual(looks.icon('c1').hue,looks.icon('c2').hue);
 assert.equal(categoryLooks({t:key=>key,tables:{}}).icon('Groceries').emoji,'🥦');
});

test('axis steps are round and reach past the largest bar',()=>{
 assert.deepEqual(axisTicks(0),[]);assert.deepEqual(axisTicks(Number.NaN),[]);
 assert.deepEqual(axisTicks(900),[0,500,1000]);assert.deepEqual(axisTicks(15800),[0,10000,20000]);assert.deepEqual(axisTicks(70),[0,25,50,75]);
});

test('the report opens with key figures and charts in the reporting currency, every figure through the formatters',()=>{
 const f=structuredClone(reportFixture);
 f.tables.finance_records.push(entry('Groceries run','Living expense',120.4,{custom_category_id:'leisure'}),entry('Old salary','Salary',800,{date:'2026-05-03'}));
 const r=buildFinancialReport(f,'en','',reportMarket,{currency:'USD'}),kinds=r.blocks.map(block=>block.kind);
 assert.deepEqual(kinds.slice(0,4),['cover','tiles','text','sankey']);
 assert.ok(kinds.includes('bars')&&kinds.filter(kind=>kind==='sankey').length===2&&kinds.filter(kind=>kind==='shares').length===2);
 assert.ok(kinds.indexOf('pageBreak')<kinds.indexOf('heading'));
 const tiles=r.blocks[1].tiles;
 assert.deepEqual(tiles.map(tile=>tile.label),['Net worth','Income','Spending','Savings rate']);
 assert.equal(tiles[1].value,'$500');assert.equal(tiles[1].tone,'positive');
 assert.ok(tiles.every(tile=>!/\d\.\d/.test(tile.value)),'whole amounts');
 const month=r.blocks[3];
 assert.match(month.text,/^Where your money went · September 2026$/);
 assert.ok(month.nodes.every(node=>node.kind==='total'||node.icon));
 assert.ok(month.nodes.some(node=>node.label==='Leisure custom'));
 const bars=r.blocks.find(block=>block.kind==='bars');assert.equal(bars.bars.length,12);assert.equal(bars.bars[7].label,'May');assert.equal(bars.ticks[0].label,'$0');
 const allocation=r.blocks.findLast(block=>block.kind==='shares');assert.equal(allocation.text,'Asset allocation');assert.ok(allocation.stacked);
 assert.ok(Math.abs(allocation.rows.reduce((sum,row)=>sum+row.fraction,0)-1)<1e-9);
});

test('without a usable rate the report says so instead of drawing a figure that is too low',()=>{
 const f=structuredClone(reportFixture);
 f.tables.finance_records.push(entry('Som pay','Salary',5000000,{currency:'UZS'}),entry('Som shop','Living expense',100000,{currency:'UZS'}),entry('May pay','Salary',700,{date:'2026-05-04'}));
 const r=buildFinancialReport(f,'en','',null,{currency:'USD'}),tiles=r.blocks[1].tiles;
 assert.equal(tiles[0].value,'Not available');assert.equal(tiles[0].detail,'Exchange rate unavailable.');
 assert.equal(tiles[1].value,'Not available');assert.equal(tiles[3].value,'Not available');
 assert.ok(!r.blocks.some(block=>block.kind==='sankey'||block.kind==='shares'));
 assert.ok(r.blocks.filter(block=>block.kind==='text'&&block.text==='Exchange rate unavailable.').length>=3);
 assert.ok(r.blocks.find(block=>block.kind==='bars').missing);
 // No income and no spending at all: no Sankey, no bars, no shares.
 const empty=buildFinancialReport({...reportFixture,tables:{...reportFixture.tables,finance_records:[]}},'en','',reportMarket);
 assert.ok(!empty.blocks.some(block=>['sankey','bars','shares'].includes(block.kind)));
});

test('the sample workspace reads as a backup, so its report is built exactly as an owner\'s',()=>{
 const today='2026-10-21',w=demoWorkspace(today);
 const backup=sampleBackup({...w,activity:[]},[],{icons:{},colors:{}},`${today}T09:00:00Z`);
 assert.equal(parseFinanceBackup(backup),backup);
 const r=buildFinancialReport(backup,'en','',demoMarket,{currency:'USD'});
 const month=r.blocks.find(block=>block.kind==='sankey');
 assert.ok(month.nodes.some(node=>node.kind==='savings'));
 assert.ok(!month.nodes.some((node,index)=>month.nodes.findIndex(other=>other.label===node.label)!==index),'no two nodes share a name');
 assert.ok(typeof sampleBackup({records:[],goals:[],categories:[],occurrences:[],activity:[]},[],{icons:{},colors:{}}).exported_at==='string');
});

test('the PDF embeds each emoji once, falls back to the letter, and drops emoji the text font cannot draw',async()=>{
 const {PDFDocument}=await import('pdf-lib');
 const today='2026-10-21',w=demoWorkspace(today);
 const r=buildFinancialReport(sampleBackup({...w,activity:[]},[],{icons:{},colors:{}},`${today}T09:00:00Z`),'en','',demoMarket,{currency:'USD'});
 const asked=[];
 const bytes=await renderFinancialReportPdf(r,font,{emojiImage:async emoji=>{asked.push(emoji);if(emoji==='🐷')throw Error('no canvas');return emoji==='💵'?null:png;}});
 assert.equal(asked.length,new Set(asked).size);assert.ok(asked.includes('🐷')&&asked.includes('🥦'));
 const doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()>=5);assert.equal(doc.getTitle(),'Personal financial report');assert.equal(doc.getCreator(),'Hoggish');
 // Without an emoji painter every icon shows its letter.
 assert.ok((await renderFinancialReportPdf(r,font)).length>1000);
 const clean=fontText(new Set([...'Snacks ?'].map(char=>char.codePointAt(0))));
 assert.equal(clean('🍕 Snacks'),'Snacks');assert.equal(clean('Snacks\t'),'Snacks  ');assert.equal(clean('Snacks ж'),'Snacks ?');assert.equal(clean('a\u0001'),'a');assert.equal(clean('ж'),'?');
});

test('emoji are drawn by the browser\'s emoji font, and missing canvases or blank drawings fall back to the letter',async()=>{
 const {canvasEmojiImage}=loadTS('lib/emoji-image.ts');
 const original=globalThis.document;
 const canvas=(context,blob=new Blob([png]))=>({width:0,height:0,getContext:()=>context,toBlob:done=>done(blob)});
 const context=alpha=>({fillText(){},getImageData:(x,y,w,h)=>({data:Uint8ClampedArray.from({length:w*h*4},(_,i)=>i===7?alpha:0)})});
 try{
  delete globalThis.document;assert.equal(await canvasEmojiImage()('🥦'),null);
  globalThis.document={createElement:()=>canvas(null)};assert.equal(await canvasEmojiImage()('🥦'),null);
  globalThis.document={createElement:()=>canvas(context(0))};assert.equal(await canvasEmojiImage(8)('🥦'),null);
  globalThis.document={createElement:()=>canvas(context(255),null)};assert.equal(await canvasEmojiImage(8)('🥦'),null);
  globalThis.document={createElement:()=>canvas(context(255))};assert.deepEqual(await canvasEmojiImage(8)('🥦'),png);
 }finally{globalThis.document=original;}
});
