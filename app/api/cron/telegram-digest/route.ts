import { cronAuthorized } from '@/lib/cron-auth';
import { recordCronRun, runFailure } from '@/lib/cron-runs';
import { reportError } from '@/lib/monitoring';
import { dueReminders, type ReminderSettings } from '@/lib/daily-finance';
import { depositToday } from '@/lib/deposit-interest';
import { digestCard, digestMessage, digestPeriods, digestSnapshots } from '@/lib/digest-message';
import { debtPaymentsFrom, type Occurrence } from '@/lib/planning';
import { ownerRows } from '@/lib/owner-rows';
import { periodTotals, shiftDay } from '@/lib/period-summary';
import { snapshotPoints } from '@/lib/portfolio-snapshots';
import { serviceDatabase } from '@/lib/service-role';
import { telegramConfig } from '@/lib/telegram';
import { deliverReport } from '@/lib/telegram-report';
import { deliverToSubscribers, namedCategories, ownerCategories, ownerDebtPayments, ownerOperations, ownerProfile, ownerRecordsSince, ownerSpendingExtras, recentSnapshots } from '@/lib/telegram-owner';
import { monthMoves } from '@/lib/digest-flow';
import { keepDayRates, withDayRates } from '@/lib/day-rate-tables';
export const maxDuration=60;
const defaultReminders:ReminderSettings={enabled:true,days_ahead:7,snoozed:[]};
/** Sends each linked owner their digest as a picture: a greeting, this month's income and expenses against the same days of last month, net worth, where the money went, and what is due. One owner's failure never blocks the others; the response says how many were reached. */
export async function GET(req:Request){
 if(!cronAuthorized(req))return new Response(null,{status:401});
 const config=telegramConfig(),db=serviceDatabase();
 if(!config||!db)return Response.json({error:'Telegram digest is not configured.'},{status:503});
 const today=depositToday();
 // Each run is recorded with its outcome, since Vercel keeps a Hobby project's logs for about an hour.
 return recordCronRun(db,'telegram-digest',async()=>{
 try{
  // One digest per owner and day: a retried or overlapping run skips the owners already sent today.
  // This month from the 1st to today, and the same days of last month for the comparison.
  // Today's official rates are kept every morning, so whatever saves a transaction today saves it with them.
  await keepDayRates([today],{today,db});
  const {from,previousFrom:before,previousTo}=digestPeriods(today);
  const counts=await deliverToSubscribers(db,{kind:'digest',period:today},async({user_id,chat_id})=>{
    const [stored,occurrences,profile,snapshots,reminders,[activity,mortgagePayments],categories,operations]=await Promise.all([
     // Schedules and holdings in full; actual cash flow only for the two periods compared.
     ownerRecordsSince(db,user_id,before),
     ownerRows<Occurrence>(db,'payment_occurrences',user_id,'id,record_id,due_on,status'),
     ownerProfile(db,user_id),
     // One snapshot a day: enough to reach back past the 1st.
     recentSnapshots(db,user_id,digestSnapshots),
     db.read<Array<{data:ReminderSettings}>>('/rest/v1/workspace_preferences?select=data&key=eq.reminders&user_id=eq.'+user_id),
     // Only repayments mark a loan installment as paid.
     ownerDebtPayments(db,user_id),
     ownerCategories(db,user_id),
     // Transfers, buys and repayments this month, for where the money went besides spending.
     ownerOperations(db,user_id,from),
    ]);
    // Each transaction counts in the owner's currency at the official rates of its own day.
    const records=await withDayRates(stored,[profile.currency],{today:depositToday(),db});
    // The digest has its own switch, so the in-app reminder toggle only lends its window and snoozes.
    const settings={...defaultReminders,...reminders[0]?.data,enabled:true};
    const points=snapshotPoints(snapshots,profile.currency),latest=points[points.length-1];
    // Net worth counts only while its latest snapshot is recent; it moved this month from the last snapshot before the 1st.
    const start=points.filter(point=>point.date<from).pop();
    const netWorth=latest&&latest.date>=shiftDay(today,-3)?{amount:latest.net,...(start?{start:start.net}:{})}:undefined;
    const rates={...snapshots[snapshots.length-1]?.rates};
    // Splits and Tracker expenses count as they do in the app.
    const flows={records,...await ownerSpendingExtras(db,user_id,before,records)};
    const current=periodTotals(flows,from,today,profile.currency,rates),previous=periodTotals(flows,before,previousTo,profile.currency,rates);
    // An incomplete earlier period only drops the comparison.
    // Income by source and what moved into investments and debts, left out whole when a rate was missing.
    const moves=monthMoves(records,operations,flows.splits,{from,to:today,currency:profile.currency,rates});
    const moved=moves.missing?{}:{sources:namedCategories(moves.income,categories,profile.language,'Other income'),moved:moves.moved};
    const cashflow={income:current.income,spending:current.spending,missing:current.missing>0,categories:namedCategories(current.byCategory,categories,profile.language),...(previous.missing?{}:{previous:{income:previous.income,spending:previous.spending,categories:namedCategories(previous.byCategory,categories,profile.language)}}),...moved};
    const due=dueReminders({records,occurrences,categories:[],goals:[],activity:[],debtPayments:debtPaymentsFrom(activity,mortgagePayments)},settings,today),digest={name:profile.name,currency:profile.currency,rates,netWorth,cashflow};
    // A picture, or the text where the picture's font cannot draw the language.
    return deliverReport({chat_id,language:profile.language,text:digestMessage(due,profile.language,today,digest),picture:{...digestCard(due,profile.language,today,digest),filename:`hoggish-${today}.png`}},config);
  });
  if(counts.failed)await reportError('cron:telegram-digest','Some Telegram digests were not delivered.',{route:'/api/cron/telegram-digest',status:503,counts:{sent:counts.sent,failed:counts.failed,blocked:counts.blocked}},{alert:true});
  return Response.json(counts,{status:counts.failed?503:200,headers:{'Cache-Control':'no-store'}});
 }catch(error){await reportError('cron:telegram-digest',error,{route:'/api/cron/telegram-digest',status:503},{alert:true});return Response.json({cause:runFailure(error),error:'Telegram digest failed. Digests already sent are not repeated on retry.',sent:0,failed:0,blocked:0},{status:503});}
 });
}
