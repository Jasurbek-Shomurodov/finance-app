// The financial report's charts, laid out as drawing operations: key figure tiles, the Sankey of where the money went,
// monthly income and spending bars, and shares with category icons. Each returns its height and a draw function, so
// the page flow can keep a chart whole on one page.
import { colors, hueHex, initial, toneColor, wrap, type Fonts, type Op } from './report-pdf-kit';
import type { ReportBlock, ReportFlowNode, ReportIcon, ReportTile } from './financial-report-context';

export type Chart={height:number;draw:(x:number,y:number)=>Op[]};
type Of<K extends ReportBlock['kind']>=Extract<ReportBlock,{kind:K}>;

const icon=(fonts:Fonts,look:ReportIcon,label:string,at:{x:number;y:number},size:number):Op=>({op:'icon',...at,size,emoji:look.emoji,hue:look.hue,letter:initial(fonts,label)});
const text=(x:number,y:number,value:string,size:number,options:{color?:string;medium?:boolean}={}):Op=>({op:'text',x,y,text:value,size,color:options.color??colors.ink,medium:options.medium});
type Style={size:number;color?:string;medium?:boolean};
const right=(fonts:Fonts,at:{x:number;y:number},value:string,style:Style)=>text(at.x-fonts.width(value,style.size,style.medium),at.y,value,style.size,style);

/** Key figures side by side on white tiles: caption, figure (shrunk to fit), and a toned second line. */
export function tilesChart(fonts:Fonts,tiles:ReportTile[],width:number):Chart{
 const gap=10,count=Math.max(1,tiles.length),w=(width-gap*(count-1))/count,pad=12;
 const laid=tiles.map(tile=>{const value=fonts.clean(tile.value),size=Math.min(17,17*(w-pad*2)/Math.max(1,fonts.width(value,17,true)));return {tile,value,size,label:wrap(fonts,tile.label,7.5,w-pad*2)[0]??''};});
 const height=pad*2+9+8+17+(tiles.some(tile=>tile.detail)?13:0);
 return {height,draw:(x,y)=>laid.flatMap(({tile,value,size,label},index)=>{
  const left=x+index*(w+gap);
  return [{op:'rect',x:left,y,w,h:height,fill:colors.card,stroke:colors.border,radius:12} as Op,
   text(left+pad,y+pad+7,label,7.5,{color:colors.muted}),
   text(left+pad,y+pad+9+8+size*.8,value,size,{color:toneColor(tile.tone),medium:true}),
   ...(tile.detail?[text(left+pad,y+pad+9+8+17+10,wrap(fonts,tile.detail,7.5,w-pad*2)[0]??'',7.5,{color:tile.tone&&tile.tone!=='plain'?toneColor(tile.tone):colors.muted})]:[])];
 })};
}

const nodeFill=(node:ReportFlowNode)=>node.kind==='total'?colors.mark:node.kind==='savings'?colors.positive:hueHex(node.icon?.hue??0);
/** A ribbon between two vertical spans, curving halfway across. */
const ribbon=(x1:number,top1:number,x2:number,top2:number,h:number)=>{const c=(x1+x2)/2,f=(n:number)=>Math.round(n*100)/100;return `M${f(x1)} ${f(top1)}C${f(c)} ${f(top1)} ${f(c)} ${f(top2)} ${f(x2)} ${f(top2)}L${f(x2)} ${f(top2+h)}C${f(c)} ${f(top2+h)} ${f(c)} ${f(top1+h)} ${f(x1)} ${f(top1+h)}Z`;};

type Side={nodes:Array<{index:number;node:ReportFlowNode;name:string[];slot:number;h:number;top:number}>;height:number};
/** Income sources on the left into one total, out to spending and savings on the right; each side node is labelled
 * beside its bar with its icon, name and amount, and given at least the room its label needs. */
export function sankeyChart(fonts:Fonts,block:Of<'sankey'>,width:number):Chart{
 const nodeWidth=7,iconSize=15,gap=7,labelWidth=Math.min(128,width*.27),lineHeight=10,headroom=30,target=230;
 const value=(index:number)=>block.links.reduce((sum,link)=>link.source===index||link.target===index?sum+link.value:sum,0);
 const total=block.nodes.findIndex(node=>node.kind==='total');
 const sides=[block.nodes.flatMap((node,index)=>node.kind==='income'?[index]:[]),block.nodes.flatMap((node,index)=>node.kind!=='income'&&node.kind!=='total'?[index]:[])];
 const sums=sides.map(side=>side.reduce((sum,index)=>sum+value(index),0)),most=Math.max(...sums,1);
 const scale=(target-(Math.max(...sides.map(side=>side.length))-1)*gap)/most;
 const laid:Side[]=sides.map(side=>{
  let y=0;
  const nodes=side.map(index=>{const node=block.nodes[index],name=wrap(fonts,node.label,8,labelWidth-iconSize-5).slice(0,2),h=Math.max(1.5,value(index)*scale),slot=Math.max(h,(name.length+1)*lineHeight+6),top=y;y+=slot+gap;return {index,node,name,slot,h,top};});
  return {nodes,height:Math.max(0,y-gap)};
 });
 const body=Math.max(most*scale,...laid.map(side=>side.height));
 // The total's name and amount sit above its bar; they need their own room only when the bar starts near the top.
 const above=Math.max(0,headroom-(body-most*scale)/2);
 return {height:above+body,draw:(x,y)=>{
  const ops:Op[]=[],top=y+above,mid=x+width/2-nodeWidth/2,edges=[x+labelWidth+6,x+width-labelWidth-6-nodeWidth];
  const midHeight=most*scale,midTop=top+(body-midHeight)/2;
  laid.forEach((side,column)=>{
   const offset=top+(body-side.height)/2,left=column===0;
   // Flows meet the total stacked in order, centred on it when this side carries less than the other.
   let at=midTop+(midHeight-sums[column]*scale)/2;
   for(const item of side.nodes){
    const slotTop=offset+item.top,barTop=slotTop+(item.slot-item.h)/2,fill=nodeFill(item.node),bar=edges[column],h=value(item.index)*scale;
    ops.push(left?{op:'path',d:ribbon(bar+nodeWidth,barTop,mid,at,h),fill,opacity:.24}:{op:'path',d:ribbon(mid+nodeWidth,at,bar,barTop,h),fill,opacity:.24});
    ops.push({op:'rect',x:bar,y:barTop,w:nodeWidth,h:item.h,fill,radius:2});
    at+=h;
    const labelX=left?x:bar+nodeWidth+6,textX=labelX+iconSize+5,lines=item.name.length+1,textTop=slotTop+item.slot/2-lines*lineHeight/2;
    if(item.node.icon)ops.push(icon(fonts,item.node.icon,item.node.label,{x:labelX,y:slotTop+item.slot/2-iconSize/2},iconSize));
    item.name.forEach((line,number)=>ops.push(text(textX,textTop+(number+1)*lineHeight-2,line,8)));
    ops.push(text(textX,textTop+lines*lineHeight-2,fonts.clean(item.node.value),8,{color:colors.muted,medium:true}));
   }
  });
  const center=block.nodes[total];
  if(center){
   ops.push({op:'rect',x:mid,y:midTop,w:nodeWidth,h:Math.max(1.5,midHeight),fill:colors.mark,radius:2});
   const name=fonts.clean(center.label),amount=fonts.clean(center.value),cx=mid+nodeWidth/2;
   ops.push(text(cx-fonts.width(name,7.5)/2,midTop-16,name,7.5,{color:colors.muted}),text(cx-fonts.width(amount,9.5,true)/2,midTop-5,amount,9.5,{medium:true}));
  }
  // Labels go over the flows, so the flows are drawn first.
  return [...ops.filter(op=>op.op==='path'),...ops.filter(op=>op.op!=='path')];
 }};
}

/** Income and spending side by side for each month, on round axis steps; a month that could not be converted shows a dash. */
export function barsChart(fonts:Fonts,block:Of<'bars'>,width:number):Chart{
 const legend=14,plot=130,labels=16,axis=Math.max(...block.ticks.map(tick=>fonts.width(tick.label,7)))+8,max=block.ticks[block.ticks.length-1].value;
 const note=block.missing?12:0;
 return {height:legend+plot+labels+note,draw:(x,y)=>{
  const ops:Op[]=[],top=y+legend+6,bottom=top+plot-6,left=x+axis,w=width-axis,group=w/block.bars.length,bar=Math.min(9,group*.3);
  const heightOf=(value:number)=>(bottom-top)*value/max;
  let lx=x;
  block.legend.forEach((name,index)=>{ops.push({op:'rect',x:lx,y:y+2,w:8,h:8,fill:index?colors.spending:colors.positive,radius:2},text(lx+12,y+9,name,7.5,{color:colors.muted}));lx+=12+fonts.width(name,7.5)+14;});
  for(const tick of block.ticks){const ty=bottom-heightOf(tick.value);ops.push({op:'line',x1:left,y1:ty,x2:x+width,y2:ty,color:tick.value?colors.rule:colors.border,width:tick.value?.5:.8},right(fonts,{x:left-6,y:ty+2.5},tick.label,{size:7,color:colors.muted}));}
  block.bars.forEach((item,index)=>{
   const center=left+group*index+group/2;
   if(item.income===null||item.spending===null)ops.push(text(center-fonts.width('—',8)/2,bottom-3,'—',8,{color:colors.muted}));
   else for(const [offset,amount,fill] of [[-bar-1,item.income,colors.positive],[1,item.spending,colors.spending]] as const){const h=heightOf(amount);if(h>0)ops.push({op:'rect',x:center+offset,y:bottom-h,w:bar,h,fill,radius:Math.min(2,h/2)});}
   const label=fonts.clean(item.label);ops.push(text(center-fonts.width(label,7)/2,bottom+12,label,7,{color:colors.muted}));
  });
  if(block.missing)ops.push(text(x,bottom+labels+8,fonts.clean(block.missing),7.5,{color:colors.muted}));
  return ops;
 }};
}

/** A figure month by month as a line over a light fill, on its axis ticks; a month without a value breaks the line. */
export function lineChart(fonts:Fonts,block:Of<'line'>,width:number):Chart{
 const plot=130,labels=16,axis=Math.max(...block.ticks.map(tick=>fonts.width(tick.label,7)))+8,note=block.note?12:0;
 const lo=block.ticks[0].value,hi=block.ticks[block.ticks.length-1].value;
 return {height:plot+labels+note,draw:(x,y)=>{
  const ops:Op[]=[],top=y+6,bottom=top+plot-6,left=x+axis,step=(width-axis)/block.points.length;
  const yOf=(value:number)=>bottom-(bottom-top)*(value-lo)/(hi-lo||1),xOf=(index:number)=>left+step*index+step/2;
  for(const tick of block.ticks){const ty=yOf(tick.value);ops.push({op:'line',x1:left,y1:ty,x2:x+width,y2:ty,color:tick.value?colors.rule:colors.border,width:tick.value?.5:.8},right(fonts,{x:left-6,y:ty+2.5},tick.label,{size:7,color:colors.muted}));}
  const base=yOf(Math.max(lo,Math.min(hi,0))),f=(n:number)=>Math.round(n*100)/100;
  block.points.forEach((point,index)=>{
   const next=block.points[index+1];
   if(point.value!==null&&next?.value!=null){
    const [x1,y1,x2,y2]=[xOf(index),yOf(point.value),xOf(index+1),yOf(next.value)];
    ops.push({op:'path',d:`M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}L${f(x2)} ${f(base)}L${f(x1)} ${f(base)}Z`,fill:colors.mark,opacity:.08},{op:'line',x1,y1,x2,y2,color:colors.mark,width:1.6});
   }
   const label=fonts.clean(point.label);ops.push(text(xOf(index)-fonts.width(label,7)/2,bottom+12,label,7,{color:colors.muted}));
  });
  for(const [index,point] of block.points.entries())if(point.value!==null)ops.push({op:'rect',x:xOf(index)-2.2,y:yOf(point.value)-2.2,w:4.4,h:4.4,fill:colors.mark,radius:2.2});
  if(block.note)ops.push(text(x,bottom+labels+8,wrap(fonts,block.note,7.5,width)[0]??'',7.5,{color:colors.muted}));
  return ops;
 }};
}

/** Short sentences, each after a dot in the brand colour, wrapped to the card. */
export function listChart(fonts:Fonts,block:Of<'list'>,width:number):Chart{
 const size=9,leading=13,indent=12,laid=block.items.map(item=>wrap(fonts,item,size,width-indent));
 return {height:laid.reduce((sum,lines)=>sum+lines.length*leading+5,0)-5,draw:(x,y)=>{
  const ops:Op[]=[];let at=y;
  for(const lines of laid){
   ops.push({op:'rect',x,y:at+4,w:4.5,h:4.5,fill:colors.mark,radius:2.25});
   lines.forEach((line,index)=>ops.push(text(x+indent,at+size+index*leading,line,size)));
   at+=lines.length*leading+5;
  }
  return ops;
 }};
}

/** Shares of a whole: optionally one stacked bar, then a row per share with its icon, name, a bar in its hue, the
 * percentage and the amount. */
export function sharesChart(fonts:Fonts,block:Of<'shares'>,width:number):Chart{
 const stack=block.stacked?22:0,row=27,iconSize=17,figures=118;
 return {height:stack+block.rows.length*row-5,draw:(x,y)=>{
  const ops:Op[]=[];
  if(block.stacked){
   let at=x;
   ops.push({op:'rect',x,y,w:width,h:10,fill:colors.track,radius:5});
   for(const share of block.rows){const w=width*share.fraction;if(w>0)ops.push({op:'rect',x:at,y,w:Math.max(.8,w-1),h:10,fill:hueHex(share.icon.hue),radius:Math.min(2,w/2)});at+=w;}
  }
  block.rows.forEach((share,index)=>{
   const top=y+stack+index*row,textX=x+iconSize+8,track=width-iconSize-8-figures;
   ops.push(icon(fonts,share.icon,share.label,{x,y:top},iconSize));
   ops.push(text(textX,top+8,wrap(fonts,share.label,8.5,track)[0]??'',8.5));
   ops.push({op:'rect',x:textX,y:top+13,w:track,h:3,fill:colors.track,radius:1.5},{op:'rect',x:textX,y:top+13,w:Math.max(1.5,track*share.fraction),h:3,fill:hueHex(share.icon.hue),radius:1.5});
   ops.push(right(fonts,{x:x+width-74,y:top+11},fonts.clean(share.share),{size:8,color:colors.muted}),right(fonts,{x:x+width,y:top+11},fonts.clean(share.value),{size:8.5,medium:true}));
  });
  return ops;
 }};
}
