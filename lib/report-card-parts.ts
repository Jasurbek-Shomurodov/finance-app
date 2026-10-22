// The blocks of the report picture below its greeting: one large figure, figure cards with icons, a budget bar, the
// Sankey of where money went, and small cards such as a savings goal or the month-end forecast. Each draws itself
// from `top` and returns where it ends; every text arrives translated and formatted.
import {at,badge,box,color,content,fitted,icon,left,oneLine,progress,right,text,tone,wrapText,type CardTone,type Draw} from './report-card-kit';
import type {CardIcon} from './report-card-icons';
export type CardTile={label:string;value:string;detail?:string;tone?:CardTone;icon?:CardIcon};
/** One large figure; `direction` puts an arrow before its detail, such as spending up or down on last month. */
export type CardHero={label:string;value:string;detail?:string;direction?:'up'|'down'};
/** A bar filled to `share` of a whole, such as the month's budget spent: `total` on the left, `remaining` on the right. */
export type CardMeter={title:string;total:string;remaining:string;share:number;tone?:CardTone};
/** A Sankey of where money went: the sources on the left (each income, and what came from savings), each target on the
 * right with a ribbon as wide as its amount. Every target names itself and its amount, so colour is never the only key. */
export type FlowNode={label:string;value:string;amount:number;color:string;detail?:string;icon?:CardIcon};
export type CardFlow={kind:'flow';title:string;sources:FlowNode[];targets:FlowNode[]};
/** A small card with a title and an icon: a status in large type (`lead`), a figure, a bar and a note, each when given. */
export type CardPanel={title:string;icon:CardIcon;lead?:string;leadTone?:CardTone;label?:string;value?:string;detail?:string;share?:number;note?:string;noteTone?:CardTone};
const gap=16,cardTitle=25;

export function hero(draw:Draw,item:CardHero,top:number){
 text(draw,left,top+24,item.label,{size:24,fill:color.muted});
 text(draw,left,top+122,item.value,{size:fitted(draw,item.value,96,content),fill:color.ink,bold:true});
 if(!item.detail)return top+142;
 let x=left;
 if(item.direction){
  // Spending more or less is stated plainly, never coloured as good or bad news: the arrow only says which way.
  draw.svg.push(`<circle cx="${x+17}" cy="${top+170}" r="17" fill="${color.tint}"/>`);
  icon(draw,item.direction==='up'?'arrowUp':'arrowDown',{x:x+17,y:top+170},20,color.iconInk);
  x+=46;
 }
 text(draw,x,top+179,oneLine(draw,item.detail,right-x,24),{size:24,fill:color.muted});
 return top+196;
}

/** Figure cards, three to a row: an icon, the label beside it and the figure under the label. */
export function figureCards(draw:Draw,items:CardTile[],top:number){
 let y=top;
 for(let index=0;index<items.length;index+=3){
  const row=items.slice(index,index+3),width=(content-gap*(row.length-1))/row.length,height=row.some(tile=>tile.detail)?150:120;
  row.forEach((tile,column)=>{
   const x=left+column*(width+gap),textX=x+22+52+16,room=x+width-18-textX;
   box(draw,{x,y,width,height});
   badge(draw,tile.icon??'wallet',{x:x+22+26,y:y+22+26},26);
   text(draw,textX,y+46,oneLine(draw,tile.label,room,21),{size:21,fill:color.muted});
   text(draw,textX,y+92,tile.value,{size:fitted(draw,tile.value,36,room),fill:color.ink,bold:true});
   if(tile.detail)text(draw,textX,y+126,oneLine(draw,tile.detail,room,19),{size:19,fill:tone(tile.tone,color.muted)});
  });
  y+=height+gap;
 }
 return y-gap;
}

export function meter(draw:Draw,item:CardMeter,top:number){
 const inner=left+28,width=content-56;
 box(draw,{x:left,y:top,width:content,height:156});
 text(draw,inner,top+50,item.title,{size:cardTitle,fill:color.ink,bold:true});
 text(draw,inner,top+96,item.total,{size:22,fill:color.muted});
 text(draw,inner+width,top+96,item.remaining,{size:22,fill:tone(item.tone,color.good),bold:true,anchor:'end'});
 progress(draw,{x:inner,y:top+114,width,height:16},item.share,tone(item.tone,color.good));
 return top+156;
}

const ribbon=(x0:number,y0:number,x1:number,y1:number,height:number)=>{
 const middle=at((x0+x1)/2);
 return `M${at(x0)},${at(y0)} C${middle},${at(y0)} ${middle},${at(y1)} ${at(x1)},${at(y1)} L${at(x1)},${at(y1+height)} C${middle},${at(y1+height)} ${middle},${at(y0+height)} ${at(x0)},${at(y0+height)} Z`;
};
const flowRow=78,sourceWidth=220;
/** Each source as a box, as tall as its share of the rows beside it but never too small for its two lines. */
function sourceBoxes(sources:FlowNode[],top:number,plot:number){
 const total=sources.reduce((sum,node)=>sum+node.amount,0)||1,room=plot-gap*(sources.length-1);
 const heights=sources.map(node=>Math.max(120,node.amount/total*room)),used=heights.reduce((sum,height)=>sum+height,0)+gap*(sources.length-1);
 let y=top+Math.max(0,(plot-used)/2);
 return sources.map((node,index)=>{const item={node,top:y,height:heights[index]};y+=heights[index]+gap;return item;});
}
export function flowCard(draw:Draw,chart:CardFlow,top:number){
 const inner=left+28,innerRight=right-28,boxRight=inner+sourceWidth,listX=left+440,plotTop=top+92;
 const plot=chart.targets.length*flowRow,boxes=sourceBoxes(chart.sources,plotTop,plot);
 const bottom=Math.max(plotTop+plot,...boxes.map(item=>item.top+item.height))+28;
 box(draw,{x:left,y:top,width:content,height:bottom-top});
 text(draw,inner,top+52,chart.title,{size:cardTitle,fill:color.ink,bold:true});
 // Ribbons as wide as their amounts, scaled so the widest fits its row and every source fits its box.
 const largest=Math.max(...chart.targets.map(node=>node.amount),1);
 const scale=Math.min((flowRow-26)/largest,...boxes.map(item=>(item.height-28)/(item.node.amount||1)));
 const thick=(amount:number)=>Math.max(4,amount*scale);
 // Money is one pool: sources and targets each lie along the same running total, and a ribbon joins every stretch a
 // source and a target share, so each source spreads over the targets in order.
 let running=0;const sources=boxes.map(item=>{const start=running;running+=item.node.amount;return {...item,start,edge:item.top+item.height/2-thick(item.node.amount)/2};});
 running=0;const targets=chart.targets.map((node,index)=>{const start=running;running+=node.amount;return {node,start,middle:plotTop+index*flowRow+flowRow/2};});
 for(const target of targets)for(const source of sources){
  const from=Math.max(source.start,target.start),to=Math.min(source.start+source.node.amount,target.start+target.node.amount);
  if(to<=from)continue;
  const y0=source.edge+(from-source.start)*scale,y1=target.middle-thick(target.node.amount)/2+(from-target.start)*scale;
  draw.svg.push(`<path d="${ribbon(boxRight,y0,listX,y1,Math.max(2,(to-from)*scale))}" fill="${target.node.color}" fill-opacity="0.3"/>`);
 }
 for(const {node,top:y,height} of sources){
  box(draw,{x:inner,y,width:sourceWidth,height},{fill:color.card,radius:16});
  const middle=y+height/2;
  text(draw,inner+20,middle-8,oneLine(draw,node.label,sourceWidth-40,21),{size:21,fill:color.muted});
  text(draw,inner+20,middle+30,node.value,{size:fitted(draw,node.value,32,sourceWidth-40),fill:color.ink,bold:true});
 }
 targets.forEach(({node,middle},index)=>{
  if(index)draw.svg.push(`<rect x="${listX+60}" y="${at(middle-flowRow/2)}" width="${at(innerRight-listX-60)}" height="1.5" fill="${color.rule}"/>`);
  badge(draw,node.icon??'tag',{x:listX+24,y:middle},23,node.color);
  const labelX=listX+62,valueWidth=draw.measure(node.value,23,true);
  text(draw,labelX,middle+(node.detail?-4:8),oneLine(draw,node.label,innerRight-labelX-valueWidth-16,23),{size:23,fill:color.ink});
  text(draw,innerRight,middle+(node.detail?-4:8),node.value,{size:23,fill:color.ink,bold:true,anchor:'end'});
  if(node.detail)text(draw,labelX,middle+24,oneLine(draw,node.detail,innerRight-labelX,18),{size:18,fill:color.muted});
 });
 return bottom;
}

/** The lines of one small card, top to bottom, at `x` with `width` to fill; returns where it ends. */
function panelBody(draw:Draw,panel:CardPanel,x:number,width:number,top:number){
 let y=top;
 if(panel.lead){text(draw,x,y+40,panel.lead,{size:fitted(draw,panel.lead,38,width),fill:tone(panel.leadTone,color.ink),bold:true});y+=60;}
 if(panel.label){text(draw,x,y+28,oneLine(draw,panel.label,width,22),{size:22,fill:color.muted});y+=40;}
 if(panel.value){text(draw,x,y+44,panel.value,{size:fitted(draw,panel.value,42,width),fill:color.ink,bold:true});y+=58;}
 if(panel.detail){text(draw,x,y+24,oneLine(draw,panel.detail,width,21),{size:21,fill:color.muted});y+=38;}
 if(panel.share!==undefined){progress(draw,{x,y:y+6,width},panel.share,tone(panel.noteTone,color.good));y+=34;}
 if(panel.note){text(draw,x,y+22,oneLine(draw,panel.note,width,21),{size:21,fill:tone(panel.noteTone,color.muted)});y+=34;}
 return y;
}
/** Small cards, two to a row, each as tall as the tallest beside it. */
export function panels(draw:Draw,items:CardPanel[],top:number){
 let y=top;
 for(let index=0;index<items.length;index+=2){
  const row=items.slice(index,index+2),width=(content-gap*(row.length-1))/row.length;
  // Measured once without drawing, to size the row.
  const height=Math.max(...row.map(panel=>panelBody({svg:[],measure:draw.measure},panel,0,width-52,y+76)))-y+20;
  row.forEach((panel,column)=>{
   const x=left+column*(width+gap);
   box(draw,{x,y,width,height});
   const titles=wrapText(panel.title,width-52-60,cardTitle,draw.measure,{limit:1,bold:true});
   text(draw,x+26,y+52,titles[0]??'',{size:cardTitle,fill:color.ink,bold:true});
   badge(draw,panel.icon,{x:x+width-26-24,y:y+26+22},24);
   panelBody(draw,panel,x+26,width-52,y+76);
  });
  y+=height+gap;
 }
 return y-gap;
}
