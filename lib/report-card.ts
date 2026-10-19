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
export type ReportCard={
 title:string;subtitle?:string;note?:string;
 tiles?:CardTile[];sections?:CardSection[];
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
  text(draw,left,y+22,section.title.toLocaleUpperCase(),{size:21,fill:tone(section.tone,color.muted),bold:true,spacing:1.2});
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
 if(card.tiles?.length)y=tiles(draw,card.tiles,y)+36;
 if(card.sections?.length)y=sections(draw,card.sections.filter(section=>section.rows.length),y)+18;
 for(const sentence of card.lines??[])for(const [number,line] of wrapText(sentence,content-28,26,measure,{limit:4}).entries()){
  if(!number)draw.svg.push(`<circle cx="${left+7}" cy="${y+22}" r="6" fill="${color.brand}"/>`);
  text(draw,left+28,y+30,line,{size:26,fill:color.ink});y+=38;
 }
 if(card.lines?.length)y+=18;
 if(card.footer){text(draw,left,y+24,card.footer,{size:22,fill:color.muted});y+=44;}
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
