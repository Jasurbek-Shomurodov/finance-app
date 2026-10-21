// Lays the financial report's blocks out on A4 pages: the cover and key figures on the grey page, each section and
// chart on its own white card, tables with repeated headers that break between rows (and inside a row only when the
// row is taller than a page). Pure; lib/financial-report-pdf.ts paints the result.
import { barsChart, sankeyChart, sharesChart, tilesChart, type Chart } from './report-pdf-charts';
import { colors, contentWidth, createFlow, margin, pageBottom, wrap, type Flow, type Fonts, type PdfPage } from './report-pdf-kit';
import type { ReportBlock } from './financial-report-context';

type Of<K extends ReportBlock['kind']>=Extract<ReportBlock,{kind:K}>;
const tableSize=8,tableLeading=11,cellPad=4;

function cover(flow:Flow,block:Of<'cover'>){
 const {fonts}=flow,page=flow.page();
 page.ops.push({op:'rect',x:margin,y:flow.y,w:28,h:28,fill:colors.mark,radius:8});
 flow.text('h.',margin+14-fonts.width('h.',16,true)/2,flow.y+19.5,16,{color:colors.markInk,medium:true});
 flow.text(fonts.clean(block.brand),margin+36,flow.y+18.5,12,{medium:true});
 flow.y+=54;
 for(const line of wrap(fonts,block.text,25,contentWidth,true)){flow.y+=25;flow.text(line,margin,flow.y,25,{medium:true});}
 flow.y+=8;
 for(const line of block.lines.flatMap(text=>wrap(fonts,text,9,contentWidth))){flow.y+=13;flow.text(line,margin,flow.y,9,{color:colors.muted});}
 flow.y+=20;
}

/** A chart on its own card under a one-line title, kept whole on one page. */
function chartCard(flow:Flow,title:string,chart:(width:number)=>Chart){
 flow.closeCard();
 const lines=title?wrap(flow.fonts,title,11,contentWidth-36,true):[],head=lines.length*15+(lines.length?10:0);
 const drawn=chart(contentWidth-36);
 flow.ensure(head+drawn.height+36);
 flow.openCard();
 for(const line of lines){flow.y+=13;flow.text(line,flow.x(),flow.y,11,{medium:true});flow.y+=2;}
 if(lines.length)flow.y+=10;
 flow.page().ops.push(...drawn.draw(flow.x(),flow.y));
 flow.y+=drawn.height;
 flow.closeCard();
}

function heading(flow:Flow,text:string,next:ReportBlock|undefined){
 flow.closeCard();
 // A heading never ends a page alone: it keeps the start of what follows with it.
 flow.ensure(18+(next?.kind==='table'?60:40)+36);
 flow.openCard();
 for(const line of wrap(flow.fonts,text,13,flow.width(),true)){flow.y+=14;flow.text(line,flow.x(),flow.y,13,{medium:true});}
 flow.y+=10;
}

/** A title (a report without a cover, such as the tax prep sheet), a subheading, or a muted note. */
function paragraph(flow:Flow,block:{kind:string;text:string}){
 const style=block.kind==='title'?{size:22,leading:26,color:colors.ink,medium:true,before:4,keep:60}:block.kind==='subheading'?{size:9.5,leading:13,color:colors.ink,medium:true,before:8,keep:75}:{size:7.8,leading:10.5,color:colors.muted,medium:false,before:2,keep:0};
 const lines=wrap(flow.fonts,block.text,style.size,flow.width(),style.medium);
 flow.ensure(Math.min(lines.length,3)*style.leading+style.keep);
 flow.y+=style.before;
 for(const line of lines){flow.ensure(style.leading);flow.y+=style.leading;flow.text(line,flow.x(),flow.y,style.size,{color:style.color,medium:style.medium});}
 flow.y+=block.kind==='title'?12:4;
}

/** A table: a muted header over a hairline, rows divided by hairlines, figures right-aligned in medium weight. */
function table(flow:Flow,block:Of<'table'>){
 if(!flow.inCard())flow.openCard();
 const {fonts}=flow,widths=block.widths.map(share=>share*flow.width());
 const cells=(row:string[],medium:(column:number)=>boolean)=>row.map((cell,column)=>wrap(fonts,cell,tableSize,widths[column]-cellPad*2,medium(column)));
 const figure=(column:number)=>!!block.numeric?.includes(column);
 const header=cells(block.headers,()=>false),heightOf=(laid:string[][])=>Math.max(1,...laid.map(cell=>cell.length))*tableLeading+cellPad*2;
 const draw=(laid:string[][],isHeader:boolean)=>{
  const h=heightOf(laid);let x=flow.x();
  laid.forEach((cell,column)=>{
   cell.forEach((line,index)=>{const medium=!isHeader&&figure(column),at=figure(column)?x+widths[column]-cellPad-fonts.width(line,tableSize,medium):x+cellPad;flow.text(line,at,flow.y+cellPad+tableSize+index*tableLeading,tableSize,{color:isHeader?colors.muted:colors.ink,medium});});
   x+=widths[column];
  });
  flow.y+=h;
  flow.page().ops.push({op:'line',x1:flow.x(),y1:flow.y,x2:flow.x()+flow.width(),y2:flow.y,color:isHeader?colors.border:colors.rule,width:isHeader?.8:.5});
 };
 const startPage=()=>{const before=flow.pages.length;return ()=>{if(flow.pages.length!==before)draw(header,true);};};
 const rows=block.rows.map(row=>cells(row,figure));
 flow.y+=4;
 flow.ensure(heightOf(header)+Math.min(rows.length?heightOf(rows[0]):0,120));
 draw(header,true);
 for(let laid of rows){
  const repeat=startPage();
  if(heightOf(laid)<pageBottom-140)flow.ensure(heightOf(laid));
  repeat();
  // A row taller than the room left continues on the next page line by line, never clipped.
  while(laid.some(cell=>cell.length)){
   let room=Math.floor((pageBottom-flow.y-cellPad*2-18)/tableLeading);
   if(room<1){const again=startPage();flow.ensure(pageBottom);again();room=Math.floor((pageBottom-flow.y-cellPad*2-18)/tableLeading);}
   draw(laid.map(cell=>cell.slice(0,room)),false);
   laid=laid.map(cell=>cell.slice(room));
  }
 }
 flow.y+=6;
}

/** The report's pages: every block in order, nothing truncated. `header` is printed at the top of later pages. */
export function layoutReport(blocks:readonly ReportBlock[],fonts:Fonts,header:string):PdfPage[]{
 const flow=createFlow(fonts,header);
 blocks.forEach((block,index)=>{
  switch(block.kind){
   case 'cover':cover(flow,block);break;
   case 'tiles':{const chart=tilesChart(fonts,block.tiles,contentWidth);flow.closeCard();flow.ensure(chart.height);flow.page().ops.push(...chart.draw(margin,flow.y));flow.y+=chart.height+14;break;}
   case 'sankey':chartCard(flow,block.text,width=>sankeyChart(fonts,block,width));break;
   case 'bars':chartCard(flow,block.text,width=>barsChart(fonts,block,width));break;
   case 'shares':chartCard(flow,block.text,width=>sharesChart(fonts,block,width));break;
   case 'pageBreak':flow.closeCard();if(!flow.fresh())flow.newPage();break;
   case 'heading':heading(flow,block.text,blocks[index+1]);break;
   case 'table':table(flow,block);break;
   default:paragraph(flow,block);
  }
 });
 flow.closeCard();
 return flow.pages;
}
