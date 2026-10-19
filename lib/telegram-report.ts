// Sends one scheduled report (the digest, the weekly recap or the monthly report) as a picture, the way the reports
// read best on a phone, or as its text when the picture cannot be drawn: a language the card's font does not cover, or
// a render that failed. Only a failed render falls back; a failed upload is left to the next run, because Telegram may
// have shown the picture already and a text after it would be a second copy.
import type {Language} from './i18n';
import {reportError} from './monitoring';
import {cardLanguage,type ReportCard} from './report-card';
import {renderReportCard} from './report-card-render';
import {deliverTelegramMessage,deliverTelegramPhoto,type SendOutcome,type TelegramConfig,type TelegramKeyboard} from './telegram';
export type ScheduledReport={
 chat_id:number;language:Language;
 /** The message for languages without the picture, and for a render that failed. */
 text:string;keyboard?:TelegramKeyboard;
 /** The picture, its HTML caption and its file name; null when there is nothing to draw. */
 picture?:{card:ReportCard;caption:string;filename:string;keyboard?:TelegramKeyboard}|null;
};
export async function deliverReport(report:ScheduledReport,config:TelegramConfig|null,render:(card:ReportCard)=>Promise<Uint8Array<ArrayBuffer>>=renderReportCard):Promise<SendOutcome>{
 const {chat_id,picture}=report;
 if(picture&&cardLanguage(report.language)){
  let photo:Uint8Array<ArrayBuffer>|null=null;
  try{photo=await render(picture.card);}catch(error){await reportError('telegram-report',error,{route:'telegram-report'});}
  if(photo)return deliverTelegramPhoto({chat_id,photo,filename:picture.filename,caption:picture.caption,keyboard:picture.keyboard},config);
 }
 return deliverTelegramMessage({chat_id,text:report.text,keyboard:report.keyboard},config);
}
