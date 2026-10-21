import { PDFDocument, popGraphicsState, pushGraphicsState, rgb, setLineWidth, setStrokingColor, setTextRenderingMode, TextRenderingMode, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { formatNumber } from './format';
import type { FinancialReport } from './financial-report';
import { layoutReport } from './report-pdf-layout';
import { colors, hueHex, margin, pageHeight, pageWidth, roundedRect, type Fonts, type Op } from './report-pdf-kit';

/** Draws an emoji as a PNG (the browser's emoji font on a canvas); null when it cannot, and the icon shows its letter. */
export type EmojiImage=(emoji:string)=>Promise<Uint8Array|null>;

const color=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
/** Emoji and their joiners and variation selectors: the icons draw them, the text font cannot. */
const pictographs=/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣]/gu;
/** The bundled font has one weight; medium figures are filled and lightly stroked, as fontconfig emboldens the report cards. */
const mediumStroke=.28;

/** Text as the bundled font can draw it: emoji removed (the icon beside it shows them), other missing characters as "?". */
export function fontText(supported:ReadonlySet<number>){
 return (text:string)=>Array.from(text.normalize('NFC').replace(pictographs,'').replace(/\t/g,'  ')).filter(char=>char==='\n'||char.charCodeAt(0)>=32).map(char=>char==='\n'||supported.has(char.codePointAt(0)!)?char:'?').join('').replace(/^ +/,'');
}

function paint(page:PDFPage,op:Op,font:PDFFont,images:ReadonlyMap<string,PDFImage|null>){
 const flip=(y:number)=>pageHeight-y;
 switch(op.op){
  case 'text':
   if(op.medium)page.pushOperators(pushGraphicsState(),setTextRenderingMode(TextRenderingMode.FillAndOutline),setLineWidth(mediumStroke*op.size/10),setStrokingColor(color(op.color)));
   page.drawText(op.text,{x:op.x,y:flip(op.y),size:op.size,font,color:color(op.color)});
   if(op.medium)page.pushOperators(popGraphicsState());
   return;
  case 'rect':
   page.drawSvgPath(roundedRect(op.x,op.y,op.w,op.h,op.radius??0),{x:0,y:pageHeight,...(op.fill?{color:color(op.fill)}:{}),...(op.stroke?{borderColor:color(op.stroke),borderWidth:.6}:{}),opacity:op.opacity??1});
   return;
  case 'line':page.drawLine({start:{x:op.x1,y:flip(op.y1)},end:{x:op.x2,y:flip(op.y2)},thickness:op.width,color:color(op.color)});return;
  case 'path':page.drawSvgPath(op.d,{x:0,y:pageHeight,color:color(op.fill),opacity:op.opacity??1});return;
  default:{
   // The tile is the light tint of the category's hue, as CategoryIcon shows it in the light theme.
   page.drawSvgPath(roundedRect(op.x,op.y,op.size,op.size,op.size*.27),{x:0,y:pageHeight,color:color(hueHex(op.hue,70,92))});
   const image=images.get(op.emoji),inner=op.size*.66;
   if(image)page.drawImage(image,{x:op.x+(op.size-inner)/2,y:flip(op.y+(op.size+inner)/2),width:inner,height:inner});
   else if(op.letter){const size=op.size*.5;page.drawText(op.letter,{x:op.x+(op.size-font.widthOfTextAtSize(op.letter,size))/2,y:flip(op.y+op.size/2+size*.36),size,font,color:color(hueHex(op.hue,60,32))});}
  }
 }
}

/** Searchable Unicode PDF on the app's warm grey page: cover, key figures and charts, then every section on white cards,
 * with measured cells, repeated table headers and untruncated rows. */
export async function renderFinancialReportPdf(report:FinancialReport,fontBytes:Uint8Array,{emojiImage}:{emojiImage?:EmojiImage}={}):Promise<Uint8Array>{
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(fontBytes,{subset:true});
 doc.setTitle(report.title);doc.setSubject('Personal financial data for review');doc.setCreator('Hoggish');doc.setLanguage(report.locale);
 const fonts:Fonts={width:(text,size,medium)=>font.widthOfTextAtSize(text,size)+(medium?mediumStroke*size/10*Math.max(1,Array.from(text).length)/4:0),clean:fontText(new Set(font.getCharacterSet()))};
 const pages=layoutReport(report.blocks,fonts,report.title);
 const images=new Map<string,PDFImage|null>();
 for(const emoji of new Set(pages.flatMap(page=>page.ops.flatMap(op=>op.op==='icon'?[op.emoji]:[])))){
  const png=await emojiImage?.(emoji).catch(()=>null);
  images.set(emoji,png?await doc.embedPng(png).catch(()=>null):null);
 }
 pages.forEach((laid,index)=>{
  const page=doc.addPage([pageWidth,pageHeight]);
  for(const op of [...laid.back,...laid.ops])paint(page,op,font,images);
  const footer=`${formatNumber(index+1,report.locale,0)} / ${formatNumber(pages.length,report.locale,0)}`,generated=fonts.clean(report.generated);
  page.drawText(footer,{x:pageWidth-margin-font.widthOfTextAtSize(footer,7.5),y:22,size:7.5,font,color:color(colors.muted)});
  page.drawText(generated,{x:margin,y:22,size:7.5,font,color:color(colors.muted)});
 });
 return doc.save();
}
