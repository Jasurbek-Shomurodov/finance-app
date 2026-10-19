import { cronAuthorized } from '@/lib/cron-auth';
import { reportError } from '@/lib/monitoring';
import { monthEnd, shiftMonth } from '@/lib/calendar-days';
import { depositToday } from '@/lib/deposit-interest';
import { translate } from '@/lib/i18n';
import { monthlyCard, monthlyCategories, monthlyMessage } from '@/lib/monthly-message';
import { periodTotals } from '@/lib/period-summary';
import { snapshotPoints } from '@/lib/portfolio-snapshots';
import { serviceDatabase } from '@/lib/service-role';
import { telegramConfig } from '@/lib/telegram';
import { deliverReport } from '@/lib/telegram-report';
import { deliverToSubscribers, ownerCashflowSince, ownerProfile, ownerSpendingExtras, snapshotOnOrBefore } from '@/lib/telegram-owner';
export const maxDuration=60;
/** Sends each linked owner, as a picture, the report of the month that ended before today (scheduled for the 1st). One owner's failure never blocks the others. */
export async function GET(req:Request){
 if(!cronAuthorized(req))return new Response(null,{status:401});
 const config=telegramConfig(),db=serviceDatabase();
 if(!config||!db)return Response.json({error:'Telegram monthly report is not configured.'},{status:503});
 // The month before today's, so a run retried on the 2nd still reports the same month.
 const month=shiftMonth(depositToday().slice(0,7),-1),from=month+'-01',to=monthEnd(month);
 const before=shiftMonth(month,-1),previousFrom=before+'-01',previousTo=monthEnd(before);
 try{
  // One report per owner and month, keyed by its first day: a retried or overlapping run skips the owners already sent.
  const {sent,failed,blocked}=await deliverToSubscribers(db,{kind:'monthly',period:from},async({user_id,chat_id})=>{
    const [records,categories,profile,closing,opening]=await Promise.all([
     // The month's cash flow and the month before's, for the spending comparison.
     ownerCashflowSince(db,user_id,previousFrom),
     db.read<Array<{id:string;name:string}>>('/rest/v1/custom_categories?select=id,name&user_id=eq.'+user_id),
     ownerProfile(db,user_id),
     snapshotOnOrBefore(db,user_id,to),
     snapshotOnOrBefore(db,user_id,previousTo),
    ]);
    // Both months are converted at the rates of the month's last snapshot, as the recap uses its latest.
    const rates={...closing?.rates},extras={records,...await ownerSpendingExtras(db,user_id,previousFrom,records)};
    const totals=periodTotals(extras,from,to,profile.currency,rates),previous=periodTotals(extras,previousFrom,previousTo,profile.currency,rates);
    // Built-in categories are translated; an added category shows the owner's own name.
    const named=Object.entries(totals.byCategory).filter(([,amount])=>amount>0).sort((a,b)=>b[1]-a[1]).slice(0,monthlyCategories)
     .map(([key,amount])=>({label:key.startsWith('c:')?categories.find(category=>category.id===key.slice(2))?.name??translate(profile.language,'Other expense'):translate(profile.language,key.slice(2)),amount}));
    // Net worth counts only when the month's last snapshot falls inside the month, and its change only against a
    // snapshot from the month before, so a long gap is never shown as one month's move.
    const [end]=closing&&closing.occurred_on>=from?snapshotPoints([closing],profile.currency):[],[start]=opening&&opening.occurred_on>=previousFrom?snapshotPoints([opening],profile.currency):[];
    const input={name:profile.name,currency:profile.currency,month:from,income:totals.income,spending:totals.spending,missing:totals.missing,previous:{spending:previous.spending,missing:previous.missing},categories:named,...(end?{netWorth:{amount:end.net,change:start?end.net-start.net:null}}:{})};
    return deliverReport({chat_id,language:profile.language,text:monthlyMessage(input,profile.language),picture:{...monthlyCard(input,profile.language),filename:`hoggish-${month}.png`}},config);
  });
  if(failed)await reportError('cron:telegram-monthly','Some Telegram monthly reports were not delivered.',{route:'/api/cron/telegram-monthly',status:503,counts:{sent,failed,blocked}},{alert:true});
  return Response.json({sent,failed,blocked},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});
 }catch(error){await reportError('cron:telegram-monthly',error,{route:'/api/cron/telegram-monthly',status:503},{alert:true});return Response.json({error:'Telegram monthly report failed. Reports already sent are not repeated on retry.',sent:0,failed:0,blocked:0},{status:503});}
}
