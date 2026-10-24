// What the background Telegram messages need to know about an owner: language,
// the name to greet them by, and the currency to show amounts in.
import {forEachLimited} from './bounded-concurrency';
import {runFailure} from './cron-runs';
import {reportError} from './monitoring';
import {expenses,type Entry} from './finance';
import {isLanguage,translate,type Language} from './i18n';
import {ownerRows,pagePath,readAllPages,readIdPages} from './owner-rows';
import type {BudgetSource} from './budget-forecast';
import type {BudgetState} from './budget';
import type {MonthOperations} from './digest-flow';
import type {Category,Goal} from './planning';
import {cashflowKinds,standingRecords} from './planning-reads';
import type {PortfolioSnapshot} from './portfolio-snapshots';
import type {ServiceDatabase} from './service-role';
import type {SendOutcome} from './telegram';
import type {CashFlowExtras,SpendingLink} from './spending';
import {normalizeSplits,type TransactionSplit} from './transaction-tools';
export type OwnerProfile={language:Language;name:string;currency:string};
/** The name is the one saved in the app's Settings. An empty name means "greet without one"; the Telegram profile name is deliberately not used. */
export async function ownerProfile(db:ServiceDatabase,owner:string):Promise<OwnerProfile>{
 const [row]=await db.read<Array<{language?:string;display_name?:string;currencies?:string[]}>>('/rest/v1/user_preferences?select=language,display_name,currencies&user_id=eq.'+owner);
 return {language:isLanguage(row?.language)?row.language:'en',name:(row?.display_name??'').trim(),currency:row?.currencies?.[0]||'USD'};
}
/** The owner's added categories, to name them in the scheduled reports and to find their budgets. */
export const ownerCategories=(db:ServiceDatabase,owner:string)=>db.read<Category[]>('/rest/v1/transaction_categories?select=id,name,direction&user_id=eq.'+owner);
/** The owner's Budget as the Budget screen reads it (app/api/budget), with the categories it names and the built-in
 * kinds the workspace removed. A failed read throws. */
export async function ownerBudget(db:ServiceDatabase,owner:string,categories:readonly Category[]):Promise<BudgetSource>{
 const [settings,rows,amounts,removed]=await Promise.all([
  db.read<Array<{mode:BudgetState['mode'];apply_forward:boolean}>>(`/rest/v1/budget_settings?select=mode,apply_forward&user_id=eq.${owner}`),
  readAllPages<BudgetState['categories'][number]>(range=>db.read(`/rest/v1/budget_categories?select=category_key,budget_type,rollover,rollover_start,excluded&user_id=eq.${owner}&order=category_key.asc&${range}`)),
  readAllPages<BudgetState['amounts'][number]>(range=>db.read(`/rest/v1/budget_amounts?select=category_key,month,amount,currency,applies_forward&user_id=eq.${owner}&order=category_key.asc,month.asc&${range}`)),
  db.read<Array<{data?:{kinds?:string[]}}>>(`/rest/v1/workspace_preferences?select=data&key=eq.removed_categories&user_id=eq.${owner}`),
 ]);
 return {categories,removed:removed[0]?.data?.kinds??[],state:{mode:settings[0]?.mode??'category',applyForward:settings[0]?.apply_forward??false,
  categories:rows.map(row=>({...row,rollover_start:row.rollover_start?.slice(0,7)??null})),
  amounts:amounts.map(row=>({category_key:row.category_key,month:row.month.slice(0,7),amount:Number(row.amount),currency:row.currency,applies_forward:row.applies_forward}))}};
}
/** The owner's savings goals, for the one the digest shows. */
export const ownerGoals=(db:ServiceDatabase,owner:string)=>ownerRows<Goal>(db,'savings_goals',owner,'id,name,kind,target,allocated,currency,account_id,archived,completed_on,funding_priority');
/** Spending by category (keys from lib/period-summary.ts), largest first, named in `language`: a built-in category is
 * translated, an added one shows the owner's own name, and one since deleted counts as `deleted` (Other expense, or
 * Other income for income). `key` is the
 * kind or the added category's id, which picks its colour. */
export function namedCategories(byCategory:Record<string,number>,categories:readonly {id:string;name:string}[],language:Language,deleted='Other expense'){
 return Object.entries(byCategory).filter(([,amount])=>amount>0).sort((a,b)=>b[1]-a[1]).map(([key,amount])=>{
  const own=key.startsWith('c:')?categories.find(category=>category.id===key.slice(2)):undefined;
  return {key:key.slice(2),label:own?.name??translate(language,key.startsWith('c:')?deleted:key.slice(2)),amount};
 });
}
/** The owner's newest daily snapshots, oldest first. */
export async function recentSnapshots(db:ServiceDatabase,owner:string,limit:number){
 const rows=await db.read<PortfolioSnapshot[]>(`/rest/v1/portfolio_snapshots?select=occurred_on,assets,debt,rates,updated_at&user_id=eq.${owner}&order=occurred_on.desc&limit=${limit}`);
 return rows.reverse();
}
/** The owner's last daily snapshot on or before `day`, or null when there is none. */
export async function snapshotOnOrBefore(db:ServiceDatabase,owner:string,day:string):Promise<PortfolioSnapshot|null>{
 const [row]=await db.read<PortfolioSnapshot[]>(`/rest/v1/portfolio_snapshots?select=occurred_on,assets,debt,rates,updated_at&user_id=eq.${owner}&occurred_on=lte.${day}&order=occurred_on.desc&limit=1`);
 return row??null;
}
/** The columns of one-time income and expenses that the bot and its messages use: totals, categories, the account last
 * used for a name, the Tracker expense a record copies, and the older way a salary settled its schedule. */
const cashflowColumns='id,name,kind,amount,currency,date,frequency,custom_category_id,account_id,business_id,history_event_id,mortgage_payment_id,payment_principal,payment_interest,income_source_id,income_due_on';
const recordPages=(db:ServiceDatabase,owner:string,filter:string,select:string)=>readIdPages<Entry>(range=>db.read<Entry[]>(`/rest/v1/finance_records?select=${select}&user_id=eq.${owner}&${filter}&order=id.asc&${range}`));
/** An owner's one-time income and expenses dated `from` on, with `cashflowColumns`, paged by id. */
export function ownerCashflowSince(db:ServiceDatabase,owner:string,from:string){
 return recordPages(db,owner,`frequency=eq.Once&kind=in.(${encodeURIComponent(cashflowKinds)})&date=gte.${from}`,cashflowColumns);
}
/** An owner's records as background Telegram work needs them, mirroring planningReadFilters: every holding and schedule
 * in full, and one-time income and expenses only from `from` on. A salary that settled a schedule the older way
 * (income_source_id) is kept whatever its date, because it still marks that due date as paid. A failed page throws. */
export async function ownerRecordsSince(db:ServiceDatabase,owner:string,from:string):Promise<Entry[]>{
 const standing=encodeURIComponent(`(${standingRecords},and(kind.eq.Salary,frequency.eq.Once,income_source_id.not.is.null,date.lt.${from}))`);
 const [kept,recent]=await Promise.all([recordPages(db,owner,'or='+standing,'*'),ownerCashflowSince(db,owner,from)]);
 return [...kept,...recent];
}
/** What marks a loan installment or mortgage payment as paid, for debtPaymentsFrom: repayments in the activity log and
 * the mortgage payments, both paged in full. A failed page throws. */
export function ownerDebtPayments(db:ServiceDatabase,owner:string){
 return Promise.all([
  readAllPages<{action:string;target_id:string|null;occurred_on:string}>(range=>db.read(`/rest/v1/account_activity?select=action,target_id,occurred_on&action=in.(repayment,mortgage)&user_id=eq.${owner}&order=id.asc&${range}`)),
  ownerRows<{mortgage_id:string;paid_on:string}>(db,'mortgage_payments',owner,'mortgage_id,paid_on'),
 ]);
}
/** The account operations dated `from` on that move money between accounts, for where the month's money went
 * (lib/digest-flow.ts): transfers, repayments and mortgage payments, buys and sales, and cash moved in or out of the
 * Tracker's holdings (its expenses are spending, read by ownerSpendingExtras). Paged; a failed page throws. */
export async function ownerOperations(db:ServiceDatabase,owner:string,from:string):Promise<MonthOperations>{
 const [activity,movements,links]=await Promise.all([
  readIdPages<Activity>(range=>db.read<Activity[]>(`/rest/v1/account_activity?select=id,action,account_id,target_id,amount,received,fee,occurred_on&action=in.(transfer,repayment,mortgage)&occurred_on=gte.${from}&user_id=eq.${owner}&order=id.asc&${range}`)),
  readIdPages<Movement>(range=>db.read<Movement[]>(`/rest/v1/asset_movements?select=id,kind,source_id,target_id,source_value,target_value,occurred_on&kind=neq.interest&occurred_on=gte.${from}&user_id=eq.${owner}&order=id.asc&${range}`)),
  readIdPages<InvestmentLink>(range=>db.read<InvestmentLink[]>(`/rest/v1/investment_account_links?select=id,account_id,account_currency,amount,investment_history!inner(occurred_on,record_id,event_type)&user_id=eq.${owner}&investment_history.event_type=neq.expense&investment_history.occurred_on=gte.${from}&order=id.asc&${range}`)),
 ]);
 return {activity,movements,investmentLinks:links};
}
type Activity=MonthOperations['activity'][number];
type Movement=NonNullable<MonthOperations['movements']>[number];
type InvestmentLink=NonNullable<MonthOperations['investmentLinks']>[number];
/** Records whose splits one request asks for, so the address stays short. */
const splitBatch=100;
type SplitRow=Parameters<typeof normalizeSplits>[0][number];
type LinkRow=Omit<SpendingLink,'investment_history'>&{account?:{currency?:string|null}|null;investment_history:SpendingLink['investment_history']};
/** What lib/spending.ts adds to `records` for spending dated `from` on: the splits of those expense records and the
 * Tracker's expenses on investments, with their account's currency. Narrow columns, bounded by date, paged; a failed page throws. */
export async function ownerSpendingExtras(db:ServiceDatabase,owner:string,from:string,records:readonly Pick<Entry,'id'|'kind'|'frequency'|'date'>[]):Promise<Required<CashFlowExtras>&{splits:TransactionSplit[]}>{
 const ids=records.filter(record=>record.id&&record.frequency==='Once'&&record.date>=from&&expenses.includes(record.kind)).map(record=>record.id);
 const batches=Array.from({length:Math.ceil(ids.length/splitBatch)},(_,index)=>ids.slice(index*splitBatch,(index+1)*splitBatch));
 const [splitPages,links]=await Promise.all([
  Promise.all(batches.map(batch=>readAllPages<SplitRow>(range=>db.read<SplitRow[]>(`/rest/v1/transaction_splits?select=record_id,position,category_id,amount&user_id=eq.${owner}&record_id=in.(${batch.join(',')})&order=record_id.asc,position.asc&${range}`)))),
  readIdPages<LinkRow>(range=>db.read<LinkRow[]>(`/rest/v1/investment_account_links?select=id,account_id,account_currency,amount,account:finance_records!account_id(currency),investment_history!inner(occurred_on,record_id,event_type)&user_id=eq.${owner}&amount=lt.0&investment_history.event_type=eq.expense&investment_history.occurred_on=gte.${from}&order=id.asc&${range}`)),
 ]);
 return {splits:normalizeSplits(splitPages.flat()),investmentLinks:links.map(({account,...link})=>({...link,account_currency:link.account_currency??account?.currency??null}))};
}
/** An owner whose linked chat takes the digest, the weekly recap and the monthly report. */
export type DigestSubscriber={user_id:string;chat_id:number};
/** Owners with a linked private chat and the digest switch on. Private chat ids are positive; a group's are negative and never receive anything. */
export const digestSubscribersPath='/rest/v1/telegram_subscriptions?select=user_id,chat_id&chat_id=not.is.null&digest_enabled=is.true&chat_id=gt.0&order=user_id.asc';
/** A scheduled message: the morning digest of a day, the weekly recap keyed by the week's last day, or the monthly
 * report keyed by the month's first day. */
export type Delivery={kind:'digest'|'recap'|'monthly';period:string};
const deliveries='/rest/v1/telegram_deliveries';
/** Claims an owner's message for the period (migrations 129, 147 and 153). False when it was delivered or another run
 * is sending it; a claim a cut-off run left undelivered for five minutes is taken over, so the owner is not skipped. */
async function claimDelivery(db:ServiceDatabase,owner:string,{kind,period}:Delivery){
 const response=await db.write('/rest/v1/rpc/claim_telegram_delivery',{method:'POST',body:JSON.stringify({p_user:owner,p_kind:kind,p_period:period})});
 if(!response.ok)throw Error('Database request failed.');
 return await response.json()===true;
}
const claimPath=(owner:string,{kind,period}:Delivery)=>`${deliveries}?user_id=eq.${owner}&kind=eq.${kind}&period=eq.${period}`;
/** Marks a claim delivered once Telegram took the message (or refused it for good), so no later run sends it again. A
 * mark that cannot be written is reported: after five minutes a retry could send that message a second time. */
async function confirmDelivery(db:ServiceDatabase,owner:string,delivery:Delivery){
 const response=await db.write(claimPath(owner,delivery),{method:'PATCH',body:JSON.stringify({delivered:true})}).catch(()=>null);
 if(!response?.ok)await reportError('telegram-delivery','A delivered Telegram message was not marked delivered, so a retry may send it again.',{counts:{status:response?.status??0}});
}
/** Gives a claim back after a failed send, so the next run sends it. A claim that stays would skip the owner for the
 * whole period, so a refused release is reported. */
async function releaseDelivery(db:ServiceDatabase,owner:string,{kind,period}:Delivery){
 const response=await db.write(claimPath(owner,{kind,period}),{method:'DELETE'}).catch(()=>null);
 if(!response?.ok)await reportError('telegram-delivery','A Telegram delivery claim was not released, so it is not retried this period.',{counts:{status:response?.status??0}});
}
/** Turns the scheduled messages off for a chat that refuses them for good (the person blocked the bot), so a blocked
 * chat is not retried and counted as a failure every run. The link stays: unblocking and switching the digest back on
 * in Settings restores it. */
async function muteSubscriber(db:ServiceDatabase,{user_id,chat_id}:DigestSubscriber){
 const response=await db.write(`/rest/v1/telegram_subscriptions?user_id=eq.${user_id}&chat_id=eq.${chat_id}`,{method:'PATCH',body:JSON.stringify({digest_enabled:false,updated_at:new Date().toISOString()})});
 if(!response.ok)throw Error('Database request failed.');
}
/** Subscribers handled at once: enough to finish a long list in time, few enough to stay gentle on the database and Telegram. */
const deliveryConcurrency=8;
/** How a scheduled message went for every subscriber, and the first failure's reason, so a run's record says why. */
export type DeliveryCounts={sent:number;failed:number;blocked:number;error?:string};
/** Runs `deliver` for each digest subscriber who has not had this `delivery` yet and counts the messages Telegram
 * accepted. Each owner's message is claimed before it is built and marked delivered once it arrives, so a retried or
 * overlapping run never repeats one; a failed one is given back, so a retry sends it. A chat that blocked the bot keeps
 * its claim, has its digest switched off and counts as `blocked`, not as a failure. One owner's failure never blocks the
 * others; only reading the subscribers can throw. `deliver` sends to the subscriber's own linked chat and resolves to
 * whether it arrived, or how the send ended. */
export async function deliverToSubscribers(db:ServiceDatabase,delivery:Delivery,deliver:(subscriber:DigestSubscriber)=>Promise<boolean|SendOutcome>):Promise<DeliveryCounts>{
 let sent=0,failed=0,blocked=0,error:string|undefined;
 const fail=(reason:unknown)=>{failed++;error??=runFailure(reason);};
 const subscribers=await readAllPages<DigestSubscriber>(range=>db.read<DigestSubscriber[]>(pagePath(digestSubscribersPath,range)));
 await forEachLimited(subscribers,deliveryConcurrency,async subscriber=>{
  try{
   if(!await claimDelivery(db,subscriber.user_id,delivery))return;
   let outcome:SendOutcome='failed';
   try{
    const result=await deliver(subscriber);
    outcome=result===true?'sent':result===false?'failed':result;
    if(outcome==='blocked')await muteSubscriber(db,subscriber);
   }catch(reason){outcome='failed';throw reason;}
   finally{if(outcome==='failed')await releaseDelivery(db,subscriber.user_id,delivery);}
   if(outcome==='failed')return fail('Telegram did not accept the message.');
   await confirmDelivery(db,subscriber.user_id,delivery);
   if(outcome==='sent')sent++;else blocked++;
  }catch(reason){fail(reason);}
 });
 return {sent,failed,blocked,...(error?{error}:{})};
}
