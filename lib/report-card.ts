// The picture the scheduled Telegram messages are sent as: a dark green Hoggish header over one cream card holding the
// greeting and its period, a large figure, figure cards, a budget bar, the Sankey of where money went, small cards and
// grouped rows, drawn as SVG. Pure; lib/report-card-render.ts turns it into a PNG. Every text arrives already
// translated and formatted, so the card only lays it out.
import {pdfUnsupportedLanguages} from './languages';
import type {Language} from './i18n';
import {box,cardWidth,color,content,drawable,estimateWidth,icon,left,margin,oneLine,right,text,tone,wrapText,type CardTone,type Draw,type Measure} from './report-card-kit';
import {figureCards,flowCard,hero,meter,panels,type CardFlow,type CardHero,type CardMeter,type CardPanel,type CardTile} from './report-card-parts';
export {cardWidth,drawable,escapeXml,estimateWidth,wrapText,type CardTone,type Measure} from './report-card-kit';
export type {CardFlow,CardHero,CardMeter,CardPanel,CardTile,FlowNode} from './report-card-parts';
export type CardRow={label:string;value:string;detail?:string;tone?:CardTone};
export type CardSection={title:string;tone?:CardTone;rows:CardRow[]};
export type CardChart=CardFlow;
export type ReportCard={
 /** The greeting at the top of the card, with what follows it in smaller type. */
 title:string;subtitle?:string;note?:string;
 /** The period the card covers, beside the greeting, such as "October 2026". */
 period?:string;
 /** A heading over the tiles. */
 tilesTitle?:string;
 hero?:CardHero;
 /** Figures in cards with an icon, three to a row. */
 figures?:CardTile[];
 /** Figures in larger cards, two to a row. */
 tiles?:CardTile[];
 meter?:CardMeter;charts?:CardChart[];panels?:CardPanel[];
 /** A heading over the sections, such as "Upcoming payments"; the sections share one card with it. */
 sectionsTitle?:string;sections?:CardSection[];
 /** Sentences under the figures, such as "Nothing is due soon." */
 lines?:string[];
 footer?:string;
};
/** The card is drawn with the app's bundled Noto Sans (public/fonts), the same font as the PDF reports, so it covers the
 * same scripts; the other languages keep the text message. */
export const cardLanguage=(language:Language)=>!pdfUnsupportedLanguages.includes(language);
const blockGap=24,headerHeight=150,overlap=28;
const heading=(draw:Draw,x:number,y:number,title:string,fill=color.muted)=>text(draw,x,y,title.toLocaleUpperCase(),{size:19,fill,bold:true,spacing:1.2});
function tiles(draw:Draw,items:CardTile[],top:number){
 let y=top;
 for(let index=0;index<items.length;index+=2){
  // A tile left alone on its row takes the whole width.
  const row=items.slice(index,index+2),width=row.length===2?(content-16)/2:content;
  const laid=row.map(tile=>({tile,details:tile.detail?wrapText(tile.detail,width-52,22,draw.measure):[]}));
  const height=118+Math.max(...laid.map(item=>item.details.length))*30;
  laid.forEach(({tile,details},column)=>{
   const x=left+column*(width+16);
   box(draw,{x,y,width,height});
   heading(draw,x+26,y+44,tile.label);
   text(draw,x+26,y+98,tile.value,{size:42,fill:color.ink,bold:true});
   details.forEach((line,number)=>text(draw,x+26,y+132+number*30,line,{size:22,fill:tone(tile.tone,color.muted)}));
  });
  y+=height+16;
 }
 return y-16;
}
/** The sections in one card under its title: each group's rows, a hairline between them. */
function sections(draw:Draw,title:string|undefined,items:CardSection[],top:number){
 const inner=left+28,width=content-56,rows:string[]=[],part:Draw={svg:rows,measure:draw.measure};
 let y=top+(title?84:28);
 if(title)text(part,inner,top+52,title,{size:25,fill:color.ink,bold:true});
 items.forEach((section,sectionIndex)=>{
  if(sectionIndex)y+=24;
  heading(part,inner,y+20,section.title,tone(section.tone,color.muted));
  y+=34;
  section.rows.forEach((row,rowIndex)=>{
   const valueWidth=draw.measure(row.value,25,true);
   const labels=wrapText(row.label,width-valueWidth-24,25,draw.measure,{limit:2});
   if(rowIndex)rows.push(`<rect x="${inner}" y="${y}" width="${width}" height="1.5" fill="${color.rule}"/>`);
   y+=16;
   labels.forEach((line,number)=>text(part,inner,y+28+number*34,line,{size:25,fill:color.ink}));
   text(part,inner+width,y+28,row.value,{size:25,fill:tone(row.tone,color.ink),bold:true,anchor:'end'});
   y+=labels.length*34;
   if(row.detail){text(part,inner,y+20,oneLine(part,row.detail,width-valueWidth-24,20),{size:20,fill:color.muted});y+=28;}
   y+=16;
  });
 });
 const bottom=y+12;
 box(draw,{x:left,y:top,width:content,height:bottom-top});
 draw.svg.push(...rows);
 return bottom;
}
/** The greeting, the period beside it, and its subtitle and note under it; returns where they end. */
function greeting(draw:Draw,card:ReportCard,top:number){
 let periodWidth=0;
 if(card.period){
  const label=card.period.toLocaleUpperCase();
  // Letter spacing widens the label beyond what the font measures.
  periodWidth=draw.measure(label,23,true)+[...label].length*1.2+44;
  text(draw,right,top+38,label,{size:23,fill:color.iconInk,bold:true,anchor:'end',spacing:1.2});
  icon(draw,'calendar',{x:right-periodWidth+13,y:top+30},26,color.iconInk);
 }
 const titles=wrapText(card.title,content-periodWidth-24,32,draw.measure,{limit:2,bold:true});
 titles.forEach((line,number)=>text(draw,left,top+40+number*42,line,{size:32,fill:color.ink,bold:true}));
 let y=top+40+(titles.length-1)*42;
 for(const [value,size] of [[card.subtitle,24],[card.note,22]] as const)if(value)for(const line of wrapText(value,content,size,draw.measure,{limit:2})){y+=size+12;text(draw,left,y,line,{size,fill:color.muted});}
 return y+16;
}
/** The figures and charts under the greeting, each block when given; returns where they end. */
function drawBlocks(draw:Draw,card:ReportCard,top:number){
 let y=top;
 if(card.tilesTitle&&(card.figures?.length||card.tiles?.length)){heading(draw,left,y+20,card.tilesTitle);y+=40;}
 if(card.hero)y=hero(draw,card.hero,y)+blockGap;
 if(card.figures?.length)y=figureCards(draw,card.figures,y)+blockGap;
 if(card.tiles?.length)y=tiles(draw,card.tiles,y)+blockGap;
 if(card.meter)y=meter(draw,card.meter,y)+blockGap;
 for(const chart of card.charts??[])y=flowCard(draw,chart,y)+blockGap;
 if(card.panels?.length)y=panels(draw,card.panels,y)+blockGap;
 return y;
}
/** The grouped rows, the sentences and the footer at the end of the card; returns where they end. */
function drawTail(draw:Draw,card:ReportCard,top:number){
 let y=top;
 const shown=card.sections?.filter(section=>section.rows.length)??[];
 if(shown.length)y=sections(draw,card.sectionsTitle,shown,y)+blockGap;
 else if(card.sectionsTitle){text(draw,left,y+30,card.sectionsTitle,{size:25,fill:color.ink,bold:true});y+=54;}
 for(const sentence of card.lines??[])for(const [number,line] of wrapText(sentence,content-28,25,draw.measure,{limit:4}).entries()){
  if(!number)draw.svg.push(`<circle cx="${left+7}" cy="${y+21}" r="6" fill="${color.good}"/>`);
  text(draw,left+28,y+30,line,{size:25,fill:color.ink});y+=38;
 }
 if(card.lines?.length)y+=blockGap;
 if(card.footer){text(draw,left,y+20,card.footer,{size:20,fill:color.muted});y+=40;}
 return y;
}
/** The card as an SVG document, `cardWidth` pixels wide and as tall as its content. */
export function reportCardSvg(card:ReportCard,measureWith:Measure=estimateWidth):string{
 const measure:Measure=(value,size,bold)=>measureWith(drawable(value),size,bold);
 const draw:Draw={svg:[],measure},header:Draw={svg:[],measure};
 const cardTop=margin+headerHeight-overlap,width=cardWidth-margin*2;
 // The header: the Hoggish mark, and a profile circle as in the app.
 header.svg.push(`<rect x="${left}" y="${margin+30}" width="48" height="48" rx="12" fill="none" stroke="${color.brand}" stroke-width="3"/>`);
 text(header,left+24,margin+66,'H',{size:32,fill:color.brand,bold:true,anchor:'middle'});
 text(header,left+66,margin+66,'HOGGISH',{size:32,fill:color.brand,bold:true,spacing:4});
 header.svg.push(`<circle cx="${right-26}" cy="${margin+54}" r="27" fill="none" stroke="${color.profile}" stroke-width="2.5"/>`);
 icon(header,'user',{x:right-26,y:margin+54},28,color.profile);
 const bottom=drawTail(draw,card,drawBlocks(draw,card,greeting(draw,card,cardTop+44)+blockGap))+12,height=bottom+margin;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${height}" viewBox="0 0 ${cardWidth} ${height}">
<rect width="${cardWidth}" height="${height}" fill="${color.page}"/>
<g font-family="Noto Sans">
<rect x="${margin}" y="${margin}" width="${width}" height="${headerHeight}" rx="28" fill="${color.header}"/>
${header.svg.join('\n')}
<rect x="${margin}" y="${cardTop}" width="${width}" height="${bottom-cardTop}" rx="28" fill="${color.card}"/>
${draw.svg.join('\n')}
</g></svg>`;
}
