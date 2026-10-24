"use client";
import type { MarketData } from '@/lib/market';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { pdfUnsupportedLanguages } from '@/lib/languages';
import { canvasEmojiImage } from '@/lib/emoji-image';
import { refreshRead } from '@/lib/refresh-read';

/** The owner's report from their backup; in the sample workspace `sample` builds the backup from the sample data instead. */
export function FinancialReportExport({demo,market=null,currency,sample}:{demo:boolean;market?:MarketData|null;currency?:string;sample?:()=>unknown}){
 const {t,language}=useLanguage();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);const downloading=useRef(false);
 const unavailable=demo&&!sample;
 async function ownerBackup(model:typeof import('@/lib/financial-report')){
  const response=await refreshRead('/api/backup');
  if(!response.ok)throw Error('Could not export all data. No incomplete backup was created.');
  const backup=await response.json();
  // Combined figures add each transaction at the official rates of its own day.
  const {days,currencies}=model.reportRateDays(backup,currency);
  const dayRates:Record<string,Record<string,number>>={};
  // A day without rates leaves the combined figures "Not available"; it never stops the report.
  for(let index=0;index<days.length;index+=300){
   try{
    const answer=await refreshRead(`/api/exchange-rate?days=${days.slice(index,index+300).join(',')}&currencies=${currencies.join(',')}`);
    if(answer.ok)Object.assign(dayRates,(await answer.json() as {days:Record<string,Record<string,number>>}).days);
   }catch{/* Left missing. */}
  }
  return {backup,dayRates};
 }
 async function download(){
  if(unavailable||downloading.current)return;
  downloading.current=true;setBusy(true);setError('');setDone(false);
  try{
   const [fontResponse,model,pdf]=await Promise.all([fetch('/fonts/NotoSans-Regular.ttf'),import('@/lib/financial-report'),import('@/lib/financial-report-pdf')]);
   // The sample workspace has no saved rates of its own days; its figures use the sample market's rates.
   const {backup,dayRates}=sample?{backup:sample(),dayRates:undefined}:await ownerBackup(model);
   if(!fontResponse.ok)throw Error('Could not create the PDF. Please try again.');
   const report=model.buildFinancialReport(backup,pdfUnsupportedLanguages.includes(language)?'en':language,'',market,{currency,...(dayRates?{dayRates}:{})});
   const bytes=await pdf.renderFinancialReportPdf(report,new Uint8Array(await fontResponse.arrayBuffer()),{emojiImage:canvasEmojiImage()});
   const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
   const link=document.createElement('a');link.href=url;link.download='personal-financial-report.pdf';document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);setDone(true);
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not create the PDF. Please try again.');}finally{downloading.current=false;setBusy(false);}
 }
 return <div>
 <Button variant="outline" disabled={unavailable||busy} aria-busy={busy} onClick={()=>void download()}><FileText size={18} aria-hidden="true"/>{t(busy?'Preparing PDF…':'Download financial report (PDF)')}</Button>
 <ErrorPopup message={error}/>
 {done&&<p role="status">{t('Your PDF is ready. Upload it to your agent when you want feedback.')}</p>}
 </div>;
}
