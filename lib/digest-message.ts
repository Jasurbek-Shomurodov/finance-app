// The morning Telegram digest, in the owner's language: a greeting with one
// line of encouragement, what is overdue or due soon, how net worth moved
// yesterday, and spending against the week before. Pure. It is sent as a picture
// (digestCard); the text is for languages the card's font cannot draw.
import {income} from './finance';
import {formatDate,formatNumber} from './format';
import type {Language} from './i18n';
import type {RateTable} from './money';
import type {DueItem} from './planning';
import type {CardRow,CardSection,CardTile,ReportCard} from './report-card';
import {escapeHtml} from './telegram';
import {messageKit} from './telegram-kit';
const motivation=['Small steps add up to big results.','A clear view of your money is the first step to calm.','Every record you add makes tomorrow easier to plan.','Progress beats perfection. Keep going.'];
export type DigestExtras={
 name?:string;currency?:string;
 /** Units of each currency per US dollar (the latest snapshot's rates), to show every payment in `currency`. */
 rates?:RateTable|null;
 /** Net worth in `currency` and its change over the latest day, when two snapshots exist. */
 netWorth?:{amount:number;change:number|null};
 /** Spending over the last seven days and over the seven before; `missing` when an amount had no rate, so neither figure is complete. */
 spending?:{current:number;previous:number;missing?:boolean};
};
/** Characters of payment lines one message can hold beside the digest's greeting and figures. */
const paymentsSectionBudget=3200;
const overdueShown=10;
/** Payment rows one card shows; a longer list ends with how many were left out. */
const cardRows=24;
type Kit=ReturnType<typeof messageKit>;
/** What kind of payment an item is, when it is not a plain bill: a repayment, a maturity or income. */
function paymentKind(item:DueItem,t:Kit['t']){
 return item.type==='repayment'||item.type==='installment'?t('repayment'):item.type==='maturity'?t(item.record.kind==='Treasury bill'?'Treasury bill maturity':item.record.kind==='Bond'?'bond maturity':'deposit maturity'):income.includes(item.record.kind)?t('income'):null;
}
/** The overdue items, the most recent ten, newest first, so a long backlog never hides what is due next; then each day. */
function paymentGroups<T>(items:DueItem[],today:string,{t,locale}:Kit,line:(item:DueItem,overdue:boolean)=>T){
 const groups:{title:string;overdue:boolean;lines:T[]}[]=[];
 const overdue=items.filter(item=>item.overdue);
 if(overdue.length)groups.push({title:t('Overdue'),overdue:true,lines:[...overdue].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,overdueShown).map(item=>line(item,true))});
 const byDay=new Map<string,DueItem[]>();
 for(const item of items.filter(item=>!item.overdue))byDay.set(item.date,[...(byDay.get(item.date)??[]),item]);
 for(const [date,dayItems] of byDay)groups.push({title:date===today?t('Today'):formatDate(date,locale),overdue:false,lines:dayItems.map(item=>line(item,false))});
 return groups;
}
const greetingOf=({t}:Kit,name:string|undefined,today:string)=>({title:name?t('Good morning, {name}',{name}):t('Good morning'),note:t(motivation[Math.floor(Date.parse(today)/86400000)%motivation.length])});
/** The currency every amount of a message is shown in, and the rates (units per US dollar) that convert into it. */
export type MessageDisplay={currency:string;rates?:RateTable|null};
/** The overdue and upcoming payments, grouped by day, each as it was entered (its own amount and currency, so no rate is
 * needed); null when there are none. Also the bot's Upcoming payments answer. */
export function paymentsSection(items:DueItem[],language:Language,today:string):string|null{
 if(!items.length)return null;
 const kit=messageKit(language),{locale,t,money}=kit;
 const line=(item:DueItem,overdue:boolean)=>{
  // One payment: its amount as entered, in its own currency (AGENTS.md, entered or converted).
  const kind=paymentKind(item,t);
  return `• ${escapeHtml(item.record.name)} · ${income.includes(item.record.kind)?'+':''}${money(item.amount,item.record.currency)}${kind?' · '+kind:''}${overdue?' · '+formatDate(item.date,locale):''}`;
 };
 const groups=paymentGroups(items,today,kit,line);
 // Telegram refuses messages over 4,096 characters, so a long list stops early and says how many items are left.
 const sections:string[]=[];let length=0,shown=0;
 for(const group of groups){
  const lines:string[]=[];
  for(const text of group.lines){if(length+text.length+group.title.length>paymentsSectionBudget)break;lines.push(text);length+=text.length+1;shown++;}
  if(!lines.length)break;
  sections.push(`<b>${group.title}</b>\n${lines.join('\n')}`);length+=group.title.length+2;
 }
 const hidden=items.length-shown;
 return `<b>${t('Upcoming payments')}</b> · ${formatDate(today,locale)}\n\n${sections.join('\n\n')}${hidden?`\n• ${t('{count} more',{count:formatNumber(hidden,locale,0)})}`:''}`;
}
export function digestMessage(items:DueItem[],language:Language,today:string,extras:DigestExtras={}):string{
 const kit=messageKit(language),{t}=kit;
 const currency=extras.currency??'USD',money=(value:number)=>kit.money(value,currency);
 const signed=(value:number)=>(value<0?'−':'+')+money(Math.abs(value));
 const {title,note}=greetingOf(kit,extras.name?.trim()&&escapeHtml(extras.name.trim()),today);
 const greeting=`☀️ <b>${title}</b>\n<i>${note}</i>`;
 const payments=paymentsSection(items,language,today)??t('Nothing is due soon.');
 const facts:string[]=[];
 if(extras.netWorth){
  const {amount,change}=extras.netWorth;
  facts.push(`📈 ${t('Net worth')}: ${money(amount)}${change!==null&&Math.round(change)!==0?' · '+t('{change} since yesterday',{change:signed(change)}):''}`);
 }
 // An incomplete total is never shown as if it were the whole week.
 if(extras.spending?.missing)facts.push(`🧾 ${t('Spending')}: ${t('Exchange rate unavailable.')}`);
 else if(extras.spending){
  const {current,previous}=extras.spending,difference=Math.abs(current-previous);
  // Spending is not good or bad news, so the comparison is stated plainly either way.
  if(current>0||previous>0)facts.push(`🧾 ${Math.round(difference)===0||previous<=0?t('Last 7 days you spent {amount}.',{amount:money(current)}):t(current<previous?'Last 7 days you spent {amount}, {change} less than the week before.':'Last 7 days you spent {amount}, {change} more than the week before.',{amount:money(current),change:money(difference)})}`);
 }
 return [greeting,payments,facts.join('\n')].filter(Boolean).join('\n\n');
}
/** Net worth and the week's spending as the card's tiles, each only when it is known. */
function digestTiles(kit:Kit,extras:DigestExtras):CardTile[]{
 const {t}=kit,currency=extras.currency??'USD',money=(value:number)=>kit.money(value,currency);
 const tiles:CardTile[]=[];
 if(extras.netWorth){
  const {amount,change}=extras.netWorth,moved=change!==null&&Math.round(change)!==0;
  tiles.push({label:t('Net worth'),value:money(amount),...(moved?{detail:t('{change} since yesterday',{change:(change<0?'−':'+')+money(Math.abs(change))}),tone:change<0?'bad' as const:'good' as const}:{})});
 }
 if(extras.spending?.missing)tiles.push({label:t('Spending'),value:'—',detail:t('Exchange rate unavailable.')});
 else if(extras.spending&&(extras.spending.current>0||extras.spending.previous>0)){
  const {current,previous}=extras.spending,difference=Math.abs(current-previous);
  // As in the text, spending more or less is stated plainly, never coloured as good or bad news.
  const compared=Math.round(difference)!==0&&previous>0;
  tiles.push({label:t('Spending'),value:money(current),detail:compared?t(current<previous?'{change} less than the week before':'{change} more than the week before',{change:money(difference)}):t('Last 7 days')});
 }
 return tiles;
}
/** The digest as a picture: the greeting, net worth and the week's spending as tiles, then each payment as it was
 * entered, grouped as in the text. The caption is the greeting, so the chat list shows who it is for. */
export function digestCard(items:DueItem[],language:Language,today:string,extras:DigestExtras={}):{card:ReportCard;caption:string}{
 const kit=messageKit(language),{locale,t}=kit;
 const name=extras.name?.trim(),{title,note}=greetingOf(kit,name,today);
 const tiles=digestTiles(kit,extras);
 const groups=paymentGroups(items,today,kit,(item,overdue):CardRow=>{
  const incoming=income.includes(item.record.kind),kind=paymentKind(item,t);
  const detail=[kind,overdue?formatDate(item.date,locale):null].filter(Boolean).join(' · ');
  return {label:item.record.name,value:(incoming?'+':'')+kit.money(item.amount,item.record.currency),...(detail?{detail}:{}),...(incoming?{tone:'good' as const}:{})};
 });
 const sections:CardSection[]=[];let shown=0;
 for(const group of groups){
  const rows=group.lines.slice(0,cardRows-shown);
  if(!rows.length)break;
  sections.push({title:group.title,...(group.overdue?{tone:'bad' as const}:{}),rows});shown+=rows.length;
 }
 const hidden=items.length-shown;
 const card:ReportCard={
  title,note,
  subtitle:items.length?`${t('Upcoming payments')} · ${formatDate(today,locale)}`:formatDate(today,locale),
  tiles,sections,
  ...(items.length?{}:{lines:[t('Nothing is due soon.')]}),
  ...(hidden>0?{footer:t('{count} more',{count:formatNumber(hidden,locale,0)})}:{}),
 };
 return {card,caption:`☀️ <b>${name?t('Good morning, {name}',{name:escapeHtml(name)}):t('Good morning')}</b>`};
}
