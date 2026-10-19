import { cronAuthorized } from '@/lib/cron-auth';
import { reportError } from '@/lib/monitoring';
import { dueReminders, type ReminderSettings } from '@/lib/daily-finance';
import { depositToday } from '@/lib/deposit-interest';
import { digestCard, digestDays, digestMessage } from '@/lib/digest-message';
import { debtPaymentsFrom, type Occurrence } from '@/lib/planning';
import { ownerRows } from '@/lib/owner-rows';
import { periodTotals, shiftDay } from '@/lib/period-summary';
import { snapshotPoints } from '@/lib/portfolio-snapshots';
import { serviceDatabase } from '@/lib/service-role';
import { telegramConfig } from '@/lib/telegram';
import { deliverReport } from '@/lib/telegram-report';
import { deliverToSubscribers, namedCategories, ownerCategories, ownerDebtPayments, ownerProfile, ownerRecordsSince, ownerSpendingExtras, recentSnapshots } from '@/lib/telegram-owner';
export const maxDuration=60;
const defaultReminders:ReminderSettings={enabled:true,days_ahead:7,snoozed:[]};
/** Sends each linked owner their digest as a picture: a greeting, the last 30 days' income, expenses and net-worth growth, where the money went, and what is due. One owner's failure never blocks the others; the response says how many were reached. */
export async function GET(req:Request){
 if(!cronAuthorized(req))return new Response(null,{status:401});
 const config=telegramConfig(),db=serviceDatabase();
 if(!config||!db)return Response.json({error:'Telegram digest is not configured.'},{status:503});
 const today=depositToday();
 try{
  // One digest per owner and day: a retried or overlapping run skips the owners already sent today.
  // The 30 days ending today, and the 30 before them for the comparison.
  const from=shiftDay(today,1-digestDays),before=shiftDay(from,-digestDays);
  const {sent,failed,blocked}=await deliverToSubscribers(db,{kind:'digest',period:today},async({user_id,chat_id})=>{
    const [records,occurrences,profile,snapshots,reminders,[activity,mortgagePayments],categories]=await Promise.all([
     // Schedules and holdings in full; actual cash flow only for the two periods compared.
     ownerRecordsSince(db,user_id,before),
     ownerRows<Occurrence>(db,'payment_occurrences',user_id,'id,record_id,due_on,status'),
     ownerProfile(db,user_id),
     // One snapshot a day: enough for the whole period's line.
     recentSnapshots(db,user_id,digestDays+1),
     db.read<Array<{data:ReminderSettings}>>('/rest/v1/workspace_preferences?select=data&key=eq.reminders&user_id=eq.'+user_id),
     // Only repayments mark a loan installment as paid.
     ownerDebtPayments(db,user_id),
     ownerCategories(db,user_id),
    ]);
    // The digest has its own switch, so the in-app reminder toggle only lends its window and snoozes.
    const settings={...defaultReminders,...reminders[0]?.data,enabled:true};
    const points=snapshotPoints(snapshots,profile.currency),latest=points[points.length-1];
    // Net worth counts only while its latest snapshot is recent; its line keeps the days inside the period.
    const netWorth=latest&&latest.date>=shiftDay(today,-3)?{amount:latest.net,history:points.filter(point=>point.date>=shiftDay(today,-digestDays)).map(({date,net})=>({date,net}))}:undefined;
    const rates={...snapshots[snapshots.length-1]?.rates};
    // Splits and Tracker expenses count as they do in the app.
    const flows={records,...await ownerSpendingExtras(db,user_id,before,records)};
    const current=periodTotals(flows,from,today,profile.currency,rates),previous=periodTotals(flows,before,shiftDay(from,-1),profile.currency,rates);
    // An incomplete earlier period only drops the comparison.
    const cashflow={income:current.income,spending:current.spending,previousSpending:previous.missing?0:previous.spending,missing:current.missing>0,categories:namedCategories(current.byCategory,categories,profile.language)};
    const due=dueReminders({records,occurrences,categories:[],goals:[],activity:[],debtPayments:debtPaymentsFrom(activity,mortgagePayments)},settings,today),digest={name:profile.name,currency:profile.currency,rates,netWorth,cashflow};
    // A picture, or the text where the picture's font cannot draw the language.
    return deliverReport({chat_id,language:profile.language,text:digestMessage(due,profile.language,today,digest),picture:{...digestCard(due,profile.language,today,digest),filename:`hoggish-${today}.png`}},config);
  });
  if(failed)await reportError('cron:telegram-digest','Some Telegram digests were not delivered.',{route:'/api/cron/telegram-digest',status:503,counts:{sent,failed,blocked}},{alert:true});
  return Response.json({sent,failed,blocked},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});
 }catch(error){await reportError('cron:telegram-digest',error,{route:'/api/cron/telegram-digest',status:503},{alert:true});return Response.json({error:'Telegram digest failed. Digests already sent are not repeated on retry.',sent:0,failed:0,blocked:0},{status:503});}
}
