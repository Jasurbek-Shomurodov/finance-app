// Draws a report card (lib/report-card.ts) as a PNG for Telegram, server-side only. The text is set in the app's bundled
// Noto Sans (public/fonts, traced into the cron routes by next.config.ts), so the picture looks the same wherever it is
// rendered; widths are measured with that font, so long names wrap where they really end.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import sharp from 'sharp';
import {reportCardSvg,type Measure,type ReportCard} from './report-card';
const fontFile=()=>join(process.cwd(),'public','fonts','NotoSans-Regular.ttf');
let fontsReady=false;
/** Points fontconfig at the bundled font before the first text is drawn. A server has no fonts of its own, and the one
 * weight shipped is made bold by fontconfig's synthetic emboldening. */
function configureFonts(){
 if(fontsReady)return;
 const folder=join(tmpdir(),'hoggish-fontconfig'),escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;');
 mkdirSync(folder,{recursive:true});
 writeFileSync(join(folder,'fonts.conf'),`<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
 <dir>${escape(dirname(fontFile()))}</dir>
 <cachedir>${escape(join(folder,'cache'))}</cachedir>
 <match target="font">
  <test name="weight" compare="less_eq"><const>medium</const></test>
  <test target="pattern" name="weight" compare="more_eq"><const>bold</const></test>
  <edit name="embolden" mode="assign"><bool>true</bool></edit>
  <edit name="weight" mode="assign"><const>bold</const></edit>
 </match>
</fontconfig>`);
 process.env.FONTCONFIG_FILE=join(folder,'fonts.conf');
 fontsReady=true;
}
let measureWith:Measure|null=null;
/** Advance widths from the font file itself; synthetic bold draws about 4% wider. */
function fontMeasure():Measure{
 if(measureWith)return measureWith;
 const font=fontkit.create(readFileSync(fontFile()));
 return measureWith=(text,size,bold)=>font.layout(text).advanceWidth/font.unitsPerEm*size*(bold?1.04:1);
}
/** The card as a PNG. Throws when the font is missing or the image cannot be drawn, so the caller can send the text instead. */
export async function renderReportCard(card:ReportCard):Promise<Uint8Array<ArrayBuffer>>{
 configureFonts();
 return new Uint8Array(await sharp(Buffer.from(reportCardSvg(card,fontMeasure()))).png({compressionLevel:9}).toBuffer());
}
