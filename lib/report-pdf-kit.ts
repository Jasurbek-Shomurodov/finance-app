// The page model of the financial report PDF: A4 pages of drawing operations in points, measured from the top left,
// with white cards on the app's warm grey page. Pure: lib/financial-report-pdf.ts paints the operations with pdf-lib,
// and tests lay pages out with an estimated font.

/** Text (`y` is its baseline), a rectangle, a hairline, a filled SVG path, or a category icon tile. */
export type Op=
 |{op:'text';x:number;y:number;text:string;size:number;color:string;medium?:boolean}
 |{op:'rect';x:number;y:number;w:number;h:number;fill?:string;stroke?:string;radius?:number;opacity?:number}
 |{op:'line';x1:number;y1:number;x2:number;y2:number;color:string;width:number}
 |{op:'path';d:string;fill:string;opacity?:number}
 /** An emoji on a tile in its hue; `letter` is drawn instead when the emoji cannot be. */
 |{op:'icon';x:number;y:number;size:number;emoji:string;hue:number;letter:string};
/** `back` is painted first (page, cards), then `ops`. */
export type PdfPage={back:Op[];ops:Op[]};
/** How wide text is drawn, and the text as the font can draw it. */
export type Fonts={width:(text:string,size:number,medium?:boolean)=>number;clean:(text:string)=>string};

export const pageWidth=595.28,pageHeight=841.89,margin=34,contentWidth=pageWidth-margin*2;
/** Room below the last line for the page footer. */
export const pageBottom=pageHeight-46;
export const cardPadding=18,cardGap=12;
/** The app's light theme: warm grey page, white cards with a hairline, ink and muted greys, the positive/negative tones. */
export const colors={page:'#f6f5f3',card:'#ffffff',border:'#e6e4e0',ink:'#1c1b19',muted:'#76726c',rule:'#eeece9',track:'#efeeeb',positive:'#1d7a52',negative:'#c4262c',mark:'#0f766e',markInk:'#ffffff',spending:'#a29e97'};
export const toneColor=(tone:string|undefined)=>tone==='positive'?colors.positive:tone==='negative'?colors.negative:colors.ink;

/** A hue at the app's category saturation and lightness (`hueColor`), or lighter for tile backgrounds, as hex. */
export function hueHex(hue:number,saturation=60,lightness=48){
 const s=saturation/100,l=lightness/100,a=s*Math.min(l,1-l);
 const channel=(n:number)=>{const k=(n+hue/30)%12;return Math.round((l-a*Math.max(-1,Math.min(k-3,9-k,1)))*255).toString(16).padStart(2,'0');};
 return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** `text` broken into lines no wider than `width`; a word wider than a line is cut where it fills it. */
export function wrap(fonts:Fonts,text:string,size:number,width:number,medium=false):string[]{
 const result:string[]=[];
 for(const paragraph of fonts.clean(text).split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   const candidate=line?line+' '+word:word;
   if(fonts.width(candidate,size,medium)<=width){line=candidate;continue;}
   if(line)result.push(line);
   line='';
   for(const char of word){if(line&&fonts.width(line+char,size,medium)>width){result.push(line);line='';}line+=char;}
  }
  result.push(line);
 }
 return result;
}

/** A rectangle with rounded corners as an SVG path. */
export function roundedRect(x:number,y:number,w:number,h:number,radius:number){
 const r=Math.max(0,Math.min(radius,w/2,h/2)),f=(n:number)=>Math.round(n*100)/100;
 return `M${f(x+r)} ${f(y)}H${f(x+w-r)}Q${f(x+w)} ${f(y)} ${f(x+w)} ${f(y+r)}V${f(y+h-r)}Q${f(x+w)} ${f(y+h)} ${f(x+w-r)} ${f(y+h)}H${f(x+r)}Q${f(x)} ${f(y+h)} ${f(x)} ${f(y+h-r)}V${f(y+r)}Q${f(x)} ${f(y)} ${f(x+r)} ${f(y)}Z`;
}

/** The first letter a tile shows when its emoji cannot be drawn. */
export const initial=(fonts:Fonts,label:string)=>Array.from(fonts.clean(label).trim())[0]?.toLocaleUpperCase()??'';

/** Pages filled from the top, with the open card (if any) closed at a page break and continued on the next page. */
export type Flow={
 pages:PdfPage[];fonts:Fonts;y:number;
 /** The left edge and width of the content: inside the open card, else the page's content column. */
 x:()=>number;width:()=>number;
 page:()=>PdfPage;inCard:()=>boolean;fresh:()=>boolean;
 newPage:()=>void;openCard:()=>void;closeCard:()=>void;
 /** Starts a new page (closing and continuing the card) unless `height` more fits on this one. */
 ensure:(height:number)=>void;
 text:(text:string,x:number,y:number,size:number,options?:{color?:string;medium?:boolean})=>void;
};

export function createFlow(fonts:Fonts,header:string):Flow{
 let card:{top:number}|null=null,top=margin;
 const flow:Flow={pages:[],fonts,y:margin,
  x:()=>card?margin+cardPadding:margin,width:()=>card?contentWidth-cardPadding*2:contentWidth,
  page:()=>flow.pages[flow.pages.length-1],inCard:()=>!!card,fresh:()=>flow.y<=top+(card?cardPadding:0),
  newPage(){
   const page:PdfPage={back:[{op:'rect',x:0,y:0,w:pageWidth,h:pageHeight,fill:colors.page}],ops:[]};
   // Every page after the first carries the report's name, so a loose page still says what it is.
   if(flow.pages.length){page.ops.push({op:'text',x:margin,y:26,text:fonts.clean(header),size:7.5,color:colors.muted});top=44;}
   flow.pages.push(page);flow.y=top;
  },
  openCard(){if(card)return;card={top:flow.y};flow.y+=cardPadding;},
  closeCard(){
   if(!card)return;
   flow.y+=cardPadding;
   flow.page().back.push({op:'rect',x:margin,y:card.top,w:contentWidth,h:flow.y-card.top,fill:colors.card,stroke:colors.border,radius:12});
   card=null;flow.y+=cardGap;
  },
  ensure(height){
   if(flow.y+height+(card?cardPadding:0)<=pageBottom||flow.fresh())return;
   const continued=!!card;
   if(continued)flow.closeCard();
   flow.newPage();
   if(continued)flow.openCard();
  },
  text(text,x,y,size,{color=colors.ink,medium=false}={}){if(text)flow.page().ops.push({op:'text',x,y,text,size,color,medium});},
 };
 flow.newPage();
 return flow;
}
