"use client";
import type { MarketData } from '@/lib/market';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { pdfUnsupportedLanguages } from '@/lib/languages';

export function FinancialReportExport({demo,market=null,currency}:{demo:boolean;market?:MarketData|null;currency?:string}){
 const {t,language}=useLanguage();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);const downloading=useRef(false);
 async function download(){
  if(demo||downloading.current)return;
  downloading.current=true;setBusy(true);setError('');setDone(false);
  try{
   const [response,fontResponse,model,pdf]=await Promise.all([fetch('/api/backup',{cache:'no-store'}),fetch('/fonts/NotoSans-Regular.ttf'),import('@/lib/financial-report'),import('@/lib/financial-report-pdf')]);
   if(!response.ok)throw Error('Could not export all data. No incomplete backup was created.');
   if(!fontResponse.ok)throw Error('Could not create the PDF. Please try again.');
   const backup=await response.json();
   // Combined figures add each transaction at the official rates of its own day.
   const {days,currencies}=model.reportRateDays(backup,currency);
   const dayRates:Record<string,Record<string,number>>={};
   // A day without rates leaves the combined figures "Not available"; it never stops the report.
   for(let index=0;index<days.length;index+=300){
    try{
     const answer=await fetch(`/api/exchange-rate?days=${days.slice(index,index+300).join(',')}&currencies=${currencies.join(',')}`,{cache:'no-store'});
     if(answer.ok)Object.assign(dayRates,(await answer.json() as {days:Record<string,Record<string,number>>}).days);
    }catch{/* Left missing. */}
   }
   const report=model.buildFinancialReport(backup,pdfUnsupportedLanguages.includes(language)?'en':language,'',market,{currency,dayRates});
   const bytes=await pdf.renderFinancialReportPdf(report,new Uint8Array(await fontResponse.arrayBuffer()));
   const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
   const link=document.createElement('a');link.href=url;link.download='personal-financial-report.pdf';document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);setDone(true);
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not create the PDF. Please try again.');}finally{downloading.current=false;setBusy(false);}
 }
 return <div>
 <Button variant="outline" disabled={demo||busy} aria-busy={busy} onClick={()=>void download()}><FileText size={18} aria-hidden="true"/>{t(busy?'Preparing PDF…':'Download financial report (PDF)')}</Button>
 <ErrorPopup message={error}/>
 {done&&<p role="status">{t('Your PDF is ready. Upload it to your agent when you want feedback.')}</p>}
 </div>;
}
