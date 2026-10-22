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
/** A Sankey of where money went: the sources on the left (each income, and what came from savings) into one total, out
 * to each target on the right, with bars and flows as wide as their amounts. Every node names itself and its amount, so
 * colour is never the only key; `total` names the middle bar. */
export type FlowNode={label:string;value:string;amount:number;color:string;detail?:string;icon?:CardIcon};
export type CardFlow={kind:'flow';title:string;sources:FlowNode[];targets:FlowNode[];total?:{label:string;value:string}};
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
// The app's own Sankey: income sources as bars on the left flowing into one total bar, and out of it to a bar for each
// target on the right, every bar as tall as its amount. Sources are named to the left of their bars, targets to the right.
const bar=14,flowGap=12,flowHeight=420,sourceLabel=170,sourceSlot=64,targetSlot=(node:FlowNode)=>node.detail?64:44,totalHead=58;
type Slot={node:FlowNode;top:number;slot:number;h:number};
/** One side's bars down the plot, each in a slot at least as tall as its label, the side centred on `body`. */
function side(nodes:FlowNode[],scale:number,least:(node:FlowNode)=>number){
 let y=0;
 const slots=nodes.map(node=>{const h=Math.max(3,node.amount*scale),slot:Slot={node,top:y,slot:Math.max(h,least(node)),h};y+=slot.slot+flowGap;return slot;});
 return {slots,height:Math.max(0,y-flowGap)};
}
function sourceLabels(draw:Draw,{node,top,slot}:Slot,x:number){
 const middle=top+slot/2;
 text(draw,x,middle-6,oneLine(draw,node.label,sourceLabel,20),{size:20,fill:color.muted,anchor:'end'});
 text(draw,x,middle+22,node.value,{size:fitted(draw,node.value,24,sourceLabel),fill:color.ink,bold:true,anchor:'end'});
}
function targetLabels(draw:Draw,{node,top,slot}:Slot,x:number,width:number){
 const middle=top+slot/2,textX=x+48,room=x+width-textX,valueWidth=draw.measure(node.value,21,true),line=middle+(node.detail?-4:8);
 badge(draw,node.icon??'tag',{x:x+20,y:middle},20,node.color);
 text(draw,textX,line,oneLine(draw,node.label,room-valueWidth-12,21),{size:21,fill:color.ink});
 text(draw,x+width,line,node.value,{size:21,fill:color.ink,bold:true,anchor:'end'});
 if(node.detail)text(draw,textX,middle+22,oneLine(draw,node.detail,room,17),{size:17,fill:color.muted});
}
export function flowCard(draw:Draw,chart:CardFlow,top:number){
 const inner=left+28,innerRight=right-28,leftBar=inner+sourceLabel+12,rightBar=left+content*0.6,mid=(leftBar+bar+rightBar)/2-bar/2;
 const sums=[chart.sources,chart.targets].map(nodes=>nodes.reduce((sum,node)=>sum+node.amount,0)),most=Math.max(...sums,1);
 const count=Math.max(chart.sources.length,chart.targets.length),scale=(flowHeight-(count-1)*flowGap)/most;
 const sides=[side(chart.sources,scale,()=>sourceSlot),side(chart.targets,scale,targetSlot)];
 const body=Math.max(most*scale,...sides.map(item=>item.height)),midHeight=most*scale;
 // The total's name and amount sit above its bar, and need their own room only when the bar starts near the top.
 const plotTop=top+92+Math.max(0,totalHead-(body-midHeight)/2),midTop=plotTop+(body-midHeight)/2,bottom=plotTop+body+32;
 box(draw,{x:left,y:top,width:content,height:bottom-top});
 text(draw,inner,top+52,chart.title,{size:cardTitle,fill:color.ink,bold:true});
 // Flows first, so the bars and labels lie over them; each meets the total stacked in order, centred on it.
 const bars:string[]=[];
 sides.forEach(({slots,height},column)=>{
  const offset=plotTop+(body-height)/2;let stack=midTop+(midHeight-sums[column]*scale)/2;
  for(const item of slots){
   const barTop=offset+item.top+(item.slot-item.h)/2,h=item.node.amount*scale,x=column?rightBar:leftBar;
   const path=column?ribbon(mid+bar,stack,rightBar,barTop,h):ribbon(leftBar+bar,barTop,mid,stack,h);
   draw.svg.push(`<path d="${path}" fill="${item.node.color}" fill-opacity="0.3"/>`);
   bars.push(`<rect x="${at(x)}" y="${at(barTop)}" width="${bar}" height="${at(item.h)}" rx="4" fill="${item.node.color}"/>`);
   stack+=h;
  }
 });
 draw.svg.push(...bars,`<rect x="${at(mid)}" y="${at(midTop)}" width="${bar}" height="${at(Math.max(3,midHeight))}" rx="4" fill="${color.header}"/>`);
 if(chart.total){
  text(draw,mid+bar/2,midTop-34,chart.total.label,{size:19,fill:color.muted,anchor:'middle'});
  text(draw,mid+bar/2,midTop-10,chart.total.value,{size:23,fill:color.ink,bold:true,anchor:'middle'});
 }
 for(const slot of sides[0].slots)sourceLabels(draw,{...slot,top:plotTop+(body-sides[0].height)/2+slot.top},leftBar-12);
 for(const slot of sides[1].slots)targetLabels(draw,{...slot,top:plotTop+(body-sides[1].height)/2+slot.top},rightBar+bar+10,innerRight-rightBar-bar-10);
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
