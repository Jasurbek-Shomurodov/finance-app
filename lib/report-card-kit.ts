// The drawing pieces the report picture is made of: its colours, text that wraps and shrinks to fit, line icons in
// tinted circles, boxes and progress bars. Pure SVG strings, measured by the caller's font.
import {iconShapes,type CardIcon} from './report-card-icons';
/** How wide `text` is drawn at `size` pixels. The renderer measures with the font itself; this estimate keeps tests pure. */
export type Measure=(text:string,size:number,bold?:boolean)=>number;
export const estimateWidth:Measure=(text,size,bold)=>[...text].length*size*(bold?0.6:0.56);
export const cardWidth=1080;
/** The page's margin around the card, the card's padding, and the width inside it. */
export const margin=36,padding=40,left=margin+padding,content=cardWidth-margin*2-padding*2,right=left+content;
export const color={page:'#e9ece3',header:'#1f3a2b',brand:'#d8b87c',profile:'#e9e4d2',card:'#fbfaf4',panel:'#fefdf9',border:'#e4e0d0',ink:'#1c2a20',muted:'#6d7468',rule:'#ebe8dc',track:'#ebe8dc',tint:'#e6ecdd',iconInk:'#4a6b45',good:'#3f7d3a',bad:'#c0392b'};
/** good is money in or on track, bad is overdue or money out beyond plan; plain states a figure without judging it. */
export type CardTone='good'|'bad'|'plain';
export const tone=(value:CardTone|undefined,fallback:string)=>value==='good'?color.good:value==='bad'?color.bad:fallback;
/** A coordinate to a tenth of a pixel, which keeps the SVG short. */
export const at=(value:number)=>Math.round(value*10)/10;
/** The bundled font has no minus sign (U+2212), which the app's signed amounts use; an en dash is drawn in its place. */
export const drawable=(text:string)=>text.replace(/−/g,'–');
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
export type Draw={svg:string[];measure:Measure};
type Style={size:number;fill:string;bold?:boolean;anchor?:'end'|'middle';spacing?:number};
export const text=(draw:Draw,x:number,y:number,value:string,{size,fill,bold,anchor,spacing}:Style)=>draw.svg.push(`<text x="${at(x)}" y="${at(y)}" font-size="${size}"${bold?' font-weight="700"':''}${anchor?` text-anchor="${anchor}"`:''}${spacing?` letter-spacing="${spacing}"`:''} fill="${fill}">${escapeXml(drawable(value))}</text>`);
/** The first line of `value` that fits `width`, ending in an ellipsis when it is cut. */
export const oneLine=(draw:Draw,value:string,width:number,size:number,bold=false)=>wrapText(value,width,size,draw.measure,{limit:1,bold})[0]??'';
/** The largest size up to `size` at which `value` fits `width`, so a long amount shrinks instead of overflowing. */
export const fitted=(draw:Draw,value:string,size:number,width:number)=>{
 let fit=size;while(fit>size*0.55&&draw.measure(value,fit,true)>width)fit-=2;
 return fit;
};
/** A bordered, rounded box, such as a figure's card. */
/** A rectangle by its top-left corner and size. */
export type Area={x:number;y:number;width:number;height:number};
export const box=(draw:Draw,{x,y,width,height}:Area,{fill=color.panel,radius=20}:{fill?:string;radius?:number}={})=>draw.svg.push(`<rect x="${at(x)}" y="${at(y)}" width="${at(width)}" height="${at(height)}" rx="${radius}" fill="${fill}" stroke="${color.border}" stroke-width="2"/>`);
/** A line icon centred on (x, y), `size` pixels across, in `stroke`. */
export const icon=(draw:Draw,name:CardIcon,{x,y}:{x:number;y:number},size:number,stroke:string)=>draw.svg.push(`<g transform="translate(${at(x-size/2)} ${at(y-size/2)}) scale(${at(size/24*100)/100})" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconShapes(name)}</g>`);
/** A line icon in a tinted circle of radius `radius`: in `ink` on a pale wash of it, or the card's own green. */
export function badge(draw:Draw,name:CardIcon,{x,y}:{x:number;y:number},radius:number,ink?:string){
 draw.svg.push(ink?`<circle cx="${at(x)}" cy="${at(y)}" r="${radius}" fill="${ink}" fill-opacity="0.16"/>`:`<circle cx="${at(x)}" cy="${at(y)}" r="${radius}" fill="${color.tint}"/>`);
 icon(draw,name,{x,y},radius*1.05,ink??color.iconInk);
}
/** A rounded bar filled to `share` (0 to 1) of its width; a share above zero is always at least a dot. */
export function progress(draw:Draw,{x,y,width,height=14}:Omit<Area,'height'>&{height?:number},share:number,fill:string){
 draw.svg.push(`<rect x="${at(x)}" y="${at(y)}" width="${at(width)}" height="${height}" rx="${height/2}" fill="${color.track}"/>`);
 const filled=Math.min(1,Math.max(0,share));
 if(filled>0)draw.svg.push(`<rect x="${at(x)}" y="${at(y)}" width="${at(Math.max(height,filled*width))}" height="${height}" rx="${height/2}" fill="${fill}"/>`);
}
