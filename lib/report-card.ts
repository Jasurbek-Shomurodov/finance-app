// The picture the scheduled Telegram messages are sent as: a dark Hoggish header, figure tiles, grouped rows and plain
// lines on one white card, drawn as SVG. Pure; lib/report-card-render.ts turns it into a PNG. Every text arrives
// already translated and formatted, so the card only lays it out.
import {pdfUnsupportedLanguages} from './languages';
import type {Language} from './i18n';
/** good is money in or a fall in spending, bad is overdue or money out beyond plan; plain states a figure without judging it. */
export type CardTone='good'|'bad'|'plain';
export type CardTile={label:string;value:string;detail?:string;tone?:CardTone};
export type CardRow={label:string;value:string;detail?:string;tone?:CardTone};
export type CardSection={title:string;tone?:CardTone;rows:CardRow[]};
/** A Sankey of where money went: the sources stacked on the left (income, and what came from savings), each target
 * on the right (a category, or what was saved) with a ribbon as wide as its amount. Every target names itself and its
 * amount, so colour is never the only key. */
export type FlowNode={label:string;value:string;amount:number;color:string;detail?:string};
export type CardFlow={kind:'flow';title:string;sources:FlowNode[];targets:FlowNode[]};
export type CardChart=CardFlow;
export type ReportCard={
 title:string;subtitle?:string;note?:string;
 /** A heading over the tiles, such as the period they cover. */
 tilesTitle?:string;
 /** One large figure under the tiles' heading, such as what was spent this month. */
 hero?:CardTile;
 /** Figures in open columns, three to a row, with no box around them. */
 figures?:CardTile[];
 tiles?:CardTile[];charts?:CardChart[];
 /** A heading over the sections, such as "Upcoming payments". */
 sectionsTitle?:string;sections?:CardSection[];
 /** Sentences under the figures, such as "Nothing is due soon." */
 lines?:string[];
 footer?:string;
};
/** How wide `text` is drawn at `size` pixels. The renderer measures with the font itself; this estimate keeps tests pure. */
export type Measure=(text:string,size:number,bold?:boolean)=>number;
export const estimateWidth:Measure=(text,size,bold)=>[...text].length*size*(bold?0.6:0.56);
/** The card is drawn with the app's bundled Noto Sans (public/fonts), the same font as the PDF reports, so it covers the
 * same scripts; the other languages keep the text message. */
export const cardLanguage=(language:Language)=>!pdfUnsupportedLanguages.includes(language);
export const cardWidth=1080;
const margin=36,padding=52,content=cardWidth-margin*2-padding*2,tileGap=20,tilePadding=28;
const flowHeight=360,flowNode=16,flowRow=92,flowGap=26;
/** A coordinate to a tenth of a pixel, which keeps the SVG short. */
const at=(value:number)=>Math.round(value*10)/10;
const color={page:'#eef2e6',card:'#ffffff',header:'#11150e',brand:'#c4f36b',brandInk:'#18240d',title:'#ffffff',subtitle:'#d3dec0',note:'#a7b592',ink:'#18200f',muted:'#6b7560',tile:'#f4f7ee',rule:'#e4e9db',good:'#2f7d32',bad:'#c0392b'};
const tone=(value:CardTone|undefined,fallback:string)=>value==='good'?color.good:value==='bad'?color.bad:fallback;
/** The bundled font has no minus sign (U+2212), which the app's signed amounts use; an en dash is drawn in its place. */
export const drawable=(text:string)=>text.replace(/\u2212/g,'\u2013');
export const escapeXml=(text:string)=>text.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[character]!);
/** `text` broken into lines no wider than `width`, at most `limit` of them; what does not fit ends in an ellipsis. */
export function wrapText(text:string,width:number,size:number,measure:Measure,{limit=3,bold=false}:{limit?:number;bold?:boolean}={}):string[]{
 const fits=(value:string)=>measure(value,size,bold)<=width;
 const lines:string[]=[];let line='';
 for(const word of text.split(/\s+/).filter(Boolean)){
  const candidate=line?line+' '+word:word;
  if(fits(candidate)){line=candidate;continue;}
  if(line)lines.push(line);
  // A word wider than the line, such as a long name without spaces, is cut where it fills the line.
  line='';for(const character of word){if(line&&!fits(line+character)){lines.push(line);line='';}line+=character;}
 }
 if(line)lines.push(line);
 if(lines.length<=limit)return lines;
 const kept=lines.slice(0,limit);let last=kept[limit-1];
 while(last&&!fits(last+'…'))last=[...last].slice(0,-1).join('');
 kept[limit-1]=last.trimEnd()+'…';
 return kept;
}
type Draw={svg:string[];measure:Measure};
type Style={size:number;fill:string;bold?:boolean;anchor?:'end';spacing?:number};
const text=(draw:Draw,x:number,y:number,value:string,{size,fill,bold,anchor,spacing}:Style)=>draw.svg.push(`<text x="${x}" y="${y}" font-size="${size}"${bold?' font-weight="700"':''}${anchor?` text-anchor="${anchor}"`:''}${spacing?` letter-spacing="${spacing}"`:''} fill="${fill}">${escapeXml(drawable(value))}</text>`);
const heading=(draw:Draw,y:number,title:string,fill=color.muted)=>text(draw,margin+padding,y+22,title.toLocaleUpperCase(),{size:21,fill,bold:true,spacing:1.2});
function tiles(draw:Draw,items:CardTile[],top:number){
 let y=top;
 for(let index=0;index<items.length;index+=2){
  // A tile left alone on its row takes the whole width.
  const row=items.slice(index,index+2),width=row.length===2?(content-tileGap)/2:content;
  const laid=row.map(tile=>({tile,details:tile.detail?wrapText(tile.detail,width-tilePadding*2,23,draw.measure):[]}));
  const height=tilePadding+30+60+Math.max(...laid.map(item=>item.details.length))*32+tilePadding-(laid.some(item=>item.details.length)?0:8);
  laid.forEach(({tile,details},column)=>{
   const x=margin+padding+column*(width+tileGap);
   draw.svg.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="22" fill="${color.tile}"/>`);
   text(draw,x+tilePadding,y+tilePadding+20,tile.label.toLocaleUpperCase(),{size:20,fill:color.muted,bold:true,spacing:1.2});
   text(draw,x+tilePadding,y+tilePadding+80,tile.value,{size:44,fill:color.ink,bold:true});
   details.forEach((line,number)=>text(draw,x+tilePadding,y+tilePadding+120+number*32,line,{size:23,fill:tone(tile.tone,color.muted)}));
  });
  y+=height+tileGap;
 }
 return y-tileGap;
}
function sections(draw:Draw,items:CardSection[],top:number){
 let y=top;const left=margin+padding,right=margin+padding+content;
 items.forEach((section,sectionIndex)=>{
  if(sectionIndex)y+=34;
  heading(draw,y,section.title,tone(section.tone,color.muted));
  y+=40;
  section.rows.forEach((row,rowIndex)=>{
   const valueWidth=draw.measure(row.value,28,true);
   const labels=wrapText(row.label,content-valueWidth-28,28,draw.measure,{limit:2});
   const details=row.detail?wrapText(row.detail,content-valueWidth-28,22,draw.measure,{limit:2}):[];
   if(rowIndex)draw.svg.push(`<rect x="${left}" y="${y}" width="${content}" height="1.5" fill="${color.rule}"/>`);
   y+=18;
   labels.forEach((line,number)=>text(draw,left,y+30+number*38,line,{size:28,fill:color.ink}));
   text(draw,right,y+30,row.value,{size:28,fill:tone(row.tone,color.ink),bold:true,anchor:'end'});
   y+=labels.length*38;
   details.forEach((line,number)=>text(draw,left,y+22+number*30,line,{size:22,fill:color.muted}));
   y+=details.length*30+18;
  });
 });
 return y;
}
/** The largest size up to `size` at which `value` fits `width`, so a long amount shrinks instead of overflowing. */
const fitted=(draw:Draw,value:string,size:number,width:number)=>{
 let fit=size;while(fit>size*0.55&&draw.measure(value,fit,true)>width)fit-=2;
 return fit;
};
function hero(draw:Draw,tile:CardTile,top:number){
 const left=margin+padding;
 text(draw,left,top+22,tile.label.toLocaleUpperCase(),{size:20,fill:color.muted,bold:true,spacing:1.2});
 text(draw,left,top+108,tile.value,{size:fitted(draw,tile.value,76,content),fill:color.ink,bold:true});
 const details=tile.detail?wrapText(tile.detail,content,26,draw.measure,{limit:2}):[];
 details.forEach((line,number)=>text(draw,left,top+156+number*36,line,{size:26,fill:tone(tile.tone,color.muted)}));
 return top+120+details.length*36+(details.length?24:0);
}
function figures(draw:Draw,items:CardTile[],top:number){
 let y=top;const gap=40;
 for(let index=0;index<items.length;index+=3){
  const row=items.slice(index,index+3),width=(content-gap*(row.length-1))/row.length;
  const laid=row.map(tile=>({tile,details:tile.detail?wrapText(tile.detail,width-24,22,draw.measure,{limit:2}):[]}));
  const height=96+Math.max(...laid.map(item=>item.details.length))*30;
  laid.forEach(({tile,details},column)=>{
   const x=margin+padding+column*(width+gap);
   // A hairline before each column after the first keeps the figures apart without boxing them in.
   if(column)draw.svg.push(`<rect x="${at(x-gap/2)}" y="${y+4}" width="1.5" height="${height-8}" fill="${color.rule}"/>`);
   const inset=column?12:0;
   text(draw,x+inset,y+20,tile.label.toLocaleUpperCase(),{size:19,fill:color.muted,bold:true,spacing:1.2});
   text(draw,x+inset,y+74,tile.value,{size:fitted(draw,tile.value,40,width-inset),fill:color.ink,bold:true});
   details.forEach((line,number)=>text(draw,x+inset,y+110+number*30,line,{size:22,fill:tone(tile.tone,color.muted)}));
  });
  y+=height+48;
 }
 return y-48;
}
const ribbon=(x0:number,y0:number,x1:number,y1:number,height:number)=>{
 const middle=at((x0+x1)/2);
 return `M${x0},${at(y0)} C${middle},${at(y0)} ${middle},${at(y1)} ${x1},${at(y1)} L${x1},${at(y1+height)} C${middle},${at(y1+height)} ${middle},${at(y0+height)} ${x0},${at(y0+height)} Z`;
};
function flow(draw:Draw,chart:CardFlow,top:number){
 const left=margin+padding,right=left+content,sourceX=left,targetX=left+300,labelX=targetX+flowNode+28;
 heading(draw,top,chart.title);
 const total=Math.max(chart.sources.reduce((sum,node)=>sum+node.amount,0),chart.targets.reduce((sum,node)=>sum+node.amount,0))||1;
 const scale=flowHeight/total,size=(amount:number)=>Math.max(4,amount*scale);
 // Each target gets a row tall enough for its two lines of label; its node sits in the middle of the row.
 const rows=chart.targets.map(node=>Math.max(flowRow,size(node.amount)+flowGap));
 const plotTop=top+108,plotHeight=rows.reduce((sum,row)=>sum+row,0);
 const stack=chart.targets.reduce((sum,node)=>sum+size(node.amount),0),stackTop=plotTop+(plotHeight-stack)/2;
 // The sources are one bar on the left, stacked in order.
 let y=stackTop;const sourceStack=chart.sources.reduce((sum,node)=>sum+size(node.amount),0),scaleSources=stack/(sourceStack||1);
 chart.sources.forEach((node,index)=>{
  const height=size(node.amount)*scaleSources;
  draw.svg.push(`<rect x="${sourceX}" y="${at(y)}" width="${flowNode}" height="${at(height)}" rx="4" fill="${node.color}"/>`);
  // Named outside the ribbons: the first over the whole flow, the second under it.
  const labelY=index?plotTop+plotHeight+44:plotTop-24;
  if(index<2){
   text(draw,sourceX,labelY,node.label,{size:24,fill:color.muted});
   text(draw,sourceX+draw.measure(node.label,24)+12,labelY,node.value,{size:24,fill:color.ink,bold:true});
  }
  y+=height;
 });
 let from=stackTop,row=plotTop;
 chart.targets.forEach((node,index)=>{
  const height=size(node.amount),middle=row+rows[index]/2,to=middle-height/2;
  draw.svg.push(`<path d="${ribbon(sourceX+flowNode,from,targetX,to,height)}" fill="${node.color}" fill-opacity="0.22"/>`);
  draw.svg.push(`<rect x="${targetX}" y="${at(to)}" width="${flowNode}" height="${at(height)}" rx="4" fill="${node.color}"/>`);
  const valueWidth=draw.measure(node.value,26,true);
  const [label]=wrapText(node.label,right-labelX-valueWidth-20,26,draw.measure,{limit:1});
  text(draw,labelX,middle-4,label,{size:26,fill:color.ink});
  text(draw,right,middle-4,node.value,{size:26,fill:color.ink,bold:true,anchor:'end'});
  if(node.detail){const [detail]=wrapText(node.detail,right-labelX,21,draw.measure,{limit:1});text(draw,labelX,middle+28,detail,{size:21,fill:color.muted});}
  from+=height;row+=rows[index];
 });
 return plotTop+plotHeight+(chart.sources.length>1?56:0);
}
/** The figures under their heading: a large one, open columns and boxed tiles, each when given; returns where they end. */
function drawFigures(draw:Draw,card:ReportCard,top:number){
 let y=top;
 if(card.tilesTitle&&(card.hero||card.figures?.length||card.tiles?.length)){heading(draw,y,card.tilesTitle);y+=56;}
 if(card.hero)y=hero(draw,card.hero,y)+40;
 if(card.figures?.length)y=figures(draw,card.figures,y)+80;
 if(card.tiles?.length)y=tiles(draw,card.tiles,y)+40;
 return y;
}
/** Everything under the header, top to bottom; returns where it ends. */
function drawBody(draw:Draw,card:ReportCard,top:number){
 let y=drawFigures(draw,card,top);const left=margin+padding,measure=draw.measure;
 for(const chart of card.charts??[])y=flow(draw,chart,y)+72;
 if(card.sectionsTitle){heading(draw,y,card.sectionsTitle,color.ink);y+=56;}
 if(card.sections?.length)y=sections(draw,card.sections.filter(section=>section.rows.length),y)+18;
 for(const sentence of card.lines??[])for(const [number,line] of wrapText(sentence,content-28,26,measure,{limit:4}).entries()){
  if(!number)draw.svg.push(`<circle cx="${left+7}" cy="${y+22}" r="6" fill="${color.brand}"/>`);
  text(draw,left+28,y+30,line,{size:26,fill:color.ink});y+=38;
 }
 if(card.lines?.length)y+=18;
 if(card.footer){text(draw,left,y+24,card.footer,{size:22,fill:color.muted});y+=44;}
 return y;
}
/** The card as an SVG document, `cardWidth` pixels wide and as tall as its content. */
export function reportCardSvg(card:ReportCard,measureWith:Measure=estimateWidth):string{
 const measure:Measure=(value,size,bold)=>measureWith(drawable(value),size,bold);
 const draw:Draw={svg:[],measure};
 const left=margin+padding,headerWidth=cardWidth-margin*2;
 // The header: the Hoggish mark, the title and the period it covers.
 const titles=wrapText(card.title,content,50,measure,{limit:2,bold:true});
 const subtitles=card.subtitle?wrapText(card.subtitle,content,26,measure,{limit:2}):[];
 const notes=card.note?wrapText(card.note,content,24,measure,{limit:2}):[];
 let y=margin+118;
 const header:string[]=[];const headerDraw:Draw={svg:header,measure};
 titles.forEach((line,number)=>text(headerDraw,left,y+number*60,line,{size:50,fill:color.title,bold:true}));
 y+=(titles.length-1)*60+46;
 subtitles.forEach((line,number)=>text(headerDraw,left,y+number*36,line,{size:26,fill:color.subtitle}));
 if(subtitles.length)y+=subtitles.length*36;
 notes.forEach((line,number)=>text(headerDraw,left,y+number*34,line,{size:24,fill:color.note}));
 if(notes.length)y+=notes.length*34;
 const headerBottom=y+6;
 y=headerBottom+40;
 y=drawBody(draw,card,y);
 const bottom=y+28,height=bottom+margin;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${height}" viewBox="0 0 ${cardWidth} ${height}">
<rect width="${cardWidth}" height="${height}" fill="${color.page}"/>
<g font-family="Noto Sans">
<rect x="${margin}" y="${margin}" width="${headerWidth}" height="${bottom-margin}" rx="32" fill="${color.card}"/>
<path d="M${margin} ${headerBottom}V${margin+32}a32 32 0 0 1 32 -32H${margin+headerWidth-32}a32 32 0 0 1 32 32V${headerBottom}Z" fill="${color.header}"/>
<rect x="${left}" y="${margin+30}" width="40" height="40" rx="11" fill="${color.brand}"/>
<text x="${left+20}" y="${margin+61}" font-size="30" font-weight="700" text-anchor="middle" fill="${color.brandInk}">h</text>
<text x="${left+56}" y="${margin+59}" font-size="22" font-weight="700" letter-spacing="3" fill="${color.brand}">HOGGISH</text>
${header.join('\n')}
${draw.svg.join('\n')}
</g></svg>`;
}
