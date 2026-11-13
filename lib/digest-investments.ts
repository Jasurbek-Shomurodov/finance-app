// What the morning Telegram digest says about investments: this month's profit and loss, and the price alerts that were
// reached. Pure but for the three reads at the end, which use the server-only key for one owner.
import {formatDate,formatMoney} from './format';
import type {Entry} from './finance';
import type {Language} from './i18n';
import {newlyReached,type PriceAlert} from './investment-insights';
import type {HistoryEvent} from './investment-history';
import {investmentPnl} from './investment-pnl';
import {investmentReturns} from './investment-returns';
import {convertAmount,instrumentFor,instrumentKey,marketEntry,marketRates,type MarketData,type Quote} from './market';
import {ownerRows} from './owner-rows';
import type {ServiceDatabase} from './service-role';
import {escapeHtml} from './telegram';
import {messageKit} from './telegram-kit';

type InterestMovement={kind:'interest';target_id:string;occurred_on:string;target_value:number};
type Holdings={records:Entry[];events:HistoryEvent[];movements?:InterestMovement[];market:MarketData;currency:string;today:string};
/** The kept prices and rates as the market feed's shape, so holdings are valued as the app values them. */
export const keptMarket=(quotes:Record<string,Quote>,rates:Record<string,number>):MarketData=>({rates,quotes,errors:{},fx:null,stocksConfigured:false});

/** What the investments earned from the 1st of `today`'s month to `today`, in `currency`: the change in value without
 * the money put in or taken out, plus income, minus costs. Null without holdings, or when one of them has no rate. */
export function monthInvestmentPnl({records,events,movements,market,currency,today}:Holdings):number|null{
 const pnl=investmentPnl({records,events,movements,cashflows:records,market,currency,today});
 if(pnl.missing||!pnl.holdings.length)return null;
 const rates=marketRates(market);
 const {days}=investmentReturns(pnl,today,from=>convertAmount(1,from,currency,rates));
 return days.filter(day=>day.date.slice(0,7)===today.slice(0,7)).reduce((sum,day)=>sum+day.pnl,0);
}

/** A reached alert with the holding it is for and its price now, in the holding's own currency. */
export type ReachedAlert={alert:PriceAlert;name:string;currency:string;price:number};
export function reachedAlerts(alerts:readonly PriceAlert[],records:readonly Entry[],market:MarketData):ReachedAlert[]{
 const byId=new Map(records.map(record=>[record.id,record]));
 const priceOf=(id:string)=>{const record=byId.get(id);return record?marketEntry(record,record.currency,market)?.amount??null:null;};
 return newlyReached(alerts,priceOf).map(alert=>{const record=byId.get(alert.record_id)!;return {alert,name:record.name,currency:record.currency,price:priceOf(record.id)!};});
}

/** The message that announces reached alerts, one line each; a unit price keeps its decimals. */
export function priceAlertMessage(reached:readonly ReachedAlert[],language:Language,today:string):string{
 const {t,locale}=messageKit(language);
 const quote=(amount:number,currency:string)=>formatMoney(amount,currency,locale,true);
 const lines=reached.map(item=>`• ${escapeHtml(item.name)}: ${t(item.alert.direction==='above'?'rose to {price}':'fell to {price}',{price:quote(item.alert.price,item.currency)})} · ${t('now {price}',{price:quote(item.price,item.currency)})}`);
 return `🔔 <b>${t('Price alerts')}</b> · ${formatDate(today,locale)}\n\n${lines.join('\n')}`;
}
/** The saved alerts with today's announced ones marked, so each is announced once. */
export const markReached=(alerts:readonly PriceAlert[],reached:readonly ReachedAlert[],today:string):PriceAlert[]=>{
 const ids=new Set(reached.map(item=>item.alert.id));
 return alerts.map(alert=>ids.has(alert.id)?{...alert,reached_on:today}:alert);
};

const historyColumns='id,record_id,event_type,occurred_on,amount,balance,ownership_percentage,principal,interest,notes,created_at';
export const ownerHistory=(db:ServiceDatabase,owner:string)=>ownerRows<HistoryEvent>(db,'investment_history',owner,historyColumns);
/** Interest added to a balance, so the digest counts it once, as the app does. */
export const ownerInterest=(db:ServiceDatabase,owner:string)=>ownerRows<InterestMovement>(db,'asset_movements',owner,'kind,target_id,occurred_on,target_value&kind=eq.interest');
/** The kept price of each instrument the records hold (migration 156); an instrument nobody kept is simply absent. */
export async function ownerQuotes(db:ServiceDatabase,records:readonly Entry[]):Promise<Record<string,Quote>>{
 const keys=[...new Set(records.flatMap(record=>{const instrument=instrumentFor(record);return instrument?[instrumentKey(instrument)]:[];}))];
 if(!keys.length)return {};
 const rows=await db.read<Array<{key:string;data:Quote}>>(`/rest/v1/market_quotes?select=key,data&key=in.(${encodeURIComponent(keys.map(key=>`"${key}"`).join(','))})`);
 return Object.fromEntries(rows.map(row=>[row.key,row.data]));
}
const alertsPath=(owner:string)=>`/rest/v1/workspace_preferences?key=eq.price_alerts&user_id=eq.${owner}`;
export async function ownerPriceAlerts(db:ServiceDatabase,owner:string):Promise<PriceAlert[]>{
 const rows=await db.read<Array<{data:{items?:PriceAlert[]}}>>(alertsPath(owner)+'&select=data');
 return rows[0]?.data.items??[];
}
export async function savePriceAlerts(db:ServiceDatabase,owner:string,items:PriceAlert[]){
 const response=await db.write(alertsPath(owner),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({data:{items}})});
 if(!response.ok)throw Error('Price alerts were not marked as announced.');
}
