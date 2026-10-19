// The morning Telegram digest, in the owner's language: a greeting with one
// line of encouragement, the last 30 days' income and expenses, how net worth
// grew over them, where the money went, and what is overdue or due soon. Pure.
// It is sent as a picture (digestCard); the text is for languages the card's
// font cannot draw.
import {categoryColor} from './category-colors';
import {income} from './finance';
import {formatDate,formatNumber,formatPercent} from './format';
import type {Language} from './i18n';
import type {RateTable} from './money';
import type {DueItem} from './planning';
import type {CardChart,CardRow,CardSection,CardTile,ReportCard} from './report-card';
import {escapeHtml} from './telegram';
import {messageKit} from './telegram-kit';
const motivation=['Small steps add up to big results.','A clear view of your money is the first step to calm.','Every record you add makes tomorrow easier to plan.','Progress beats perfection. Keep going.'];
export type DigestExtras={
 name?:string;currency?:string;
 /** Units of each currency per US dollar (the latest snapshot's rates), to show every payment in `currency`. */
 rates?:RateTable|null;
 /** Net worth in `currency` today, and the daily values of the last 30 days, oldest first, for its growth. */
 netWorth?:{amount:number;history:{date:string;net:number}[]};
 /** Income and expenses over the last 30 days, the expenses of the 30 before, and the expenses by category, largest
  * first; `missing` when an amount had no rate, so no total is complete. */
 cashflow?:{income:number;spending:number;previousSpending:number;missing?:boolean;categories:{key:string;label:string;amount:number}[]};
};
/** Days the digest's figures cover. */
export const digestDays=30;
/** Categories drawn as bars; the rest are one "Other" bar. */
const barsShown=5;
/** Characters of payment lines one message can hold beside the digest's greeting and figures. */
const paymentsSectionBudget=3200;
const overdueShown=10;
/** Payment rows one card shows, so the list stays a glance; a longer one ends with how many were left out. */
const cardRows=6;
/** Overdue rows the card shows at most, so a backlog still leaves room for what is due next. */
const cardOverdue=3;
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
/** Net worth's change over the 30 days, from the first value in them; null with fewer than two. */
const grown=(netWorth:DigestExtras['netWorth'])=>netWorth&&netWorth.history.length>1?netWorth.amount-netWorth.history[0].net:null;
export function digestMessage(items:DueItem[],language:Language,today:string,extras:DigestExtras={}):string{
 const kit=messageKit(language),{t}=kit;
 const currency=extras.currency??'USD',money=(value:number)=>kit.money(value,currency);
 const signed=(value:number)=>(value<0?'−':'+')+money(Math.abs(value));
 const {title,note}=greetingOf(kit,extras.name?.trim()&&escapeHtml(extras.name.trim()),today);
 const greeting=`☀️ <b>${title}</b>\n<i>${note}</i>`;
 const payments=paymentsSection(items,language,today)??t('Nothing is due soon.');
 const facts:string[]=[];
 // An incomplete total is never shown as if it were the whole month.
 if(extras.cashflow?.missing)facts.push(`🧾 ${t('Last 30 days')}: ${t('Exchange rate unavailable.')}`);
 else if(extras.cashflow)facts.push(`🧾 ${t('Last 30 days: income {income}, expenses {expenses}.',{income:money(extras.cashflow.income),expenses:money(extras.cashflow.spending)})}`);
 if(extras.netWorth){
  const change=grown(extras.netWorth);
  facts.push(`📈 ${t('Net worth')}: ${money(extras.netWorth.amount)}${change!==null&&Math.round(change)!==0?' · '+t('{change} in 30 days',{change:signed(change)}):''}`);
 }
 return [greeting,facts.join('\n'),payments].filter(Boolean).join('\n\n');
}
/** The last 30 days as tiles: income, expenses against the 30 before, what was saved and how net worth grew. */
function digestTiles(kit:Kit,extras:DigestExtras):CardTile[]{
 const {t,locale}=kit,currency=extras.currency??'USD',money=(value:number)=>kit.money(value,currency);
 const tiles:CardTile[]=[];
 const flow=extras.cashflow;
 if(flow?.missing)tiles.push({label:t('Expenses'),value:'—',detail:t('Exchange rate unavailable.')});
 else if(flow){
  const {spending,previousSpending}=flow,difference=Math.abs(spending-previousSpending),net=flow.income-spending;
  // Spending more or less is stated plainly, never coloured as good or bad news.
  const compared=Math.round(difference)!==0&&previousSpending>0;
  tiles.push(
   {label:t('Income'),value:money(flow.income)},
   {label:t('Expenses'),value:money(spending),...(compared?{detail:t(spending<previousSpending?'{change} less than the 30 days before':'{change} more than the 30 days before',{change:money(difference)})}:{})},
   {label:t('Saved'),value:(net<0?'−':'')+money(Math.abs(net)),...(net>0&&flow.income>0?{detail:t('{percent} of income',{percent:formatPercent(net/flow.income*100,locale,0)}),tone:'good' as const}:{})},
  );
 }
 if(extras.netWorth){
  const change=grown(extras.netWorth),moved=change!==null&&Math.round(change)!==0;
  tiles.push({label:t('Net worth'),value:money(extras.netWorth.amount),...(moved?{detail:t('{change} in 30 days',{change:(change<0?'−':'+')+money(Math.abs(change))}),tone:change<0?'bad' as const:'good' as const}:{})});
 }
 return tiles;
}
/** Net worth's line over the 30 days and the expenses by category as bars, each when there is something to draw. */
function digestCharts(kit:Kit,extras:DigestExtras,today:string):CardChart[]{
 const {t,locale}=kit,currency=extras.currency??'USD',money=(value:number)=>kit.money(value,currency);
 const charts:CardChart[]=[];
 const history=extras.netWorth?.history??[];
 if(history.length>1){
  const first=history[0],last=history[history.length-1];
  charts.push({kind:'line',title:t('Net worth, last 30 days'),values:history.map(point=>point.net),from:{label:formatDate(first.date,locale),value:money(first.net)},to:{label:last.date===today?t('Today'):formatDate(last.date,locale),value:money(last.net)},...(last.net<first.net?{tone:'bad' as const}:{})});
 }
 const flow=extras.cashflow;
 if(flow&&!flow.missing&&flow.spending>0&&flow.categories.length){
  const shown=flow.categories.slice(0,barsShown),rest=flow.categories.slice(barsShown).reduce((sum,category)=>sum+category.amount,0);
  const bar=(label:string,amount:number,color:string)=>({label,amount,color,value:money(amount),share:formatPercent(amount/flow.spending*100,locale,0)});
  // Each category keeps its own colour from the app, whatever its rank; the tail folds into one grey bar.
  charts.push({kind:'bars',title:t('Expenses by category'),bars:[...shown.map(category=>bar(category.label,category.amount,categoryColor(category.key))),...(rest>0?[bar(t('Other'),rest,'#9aa38f')]:[])]});
 }
 return charts;
}
/** The digest as a picture: the greeting, the last 30 days as tiles, net worth's line and the expenses by category,
 * then the next payments as they were entered, grouped as in the text. The caption is the greeting, so the chat list shows who it is for. */
export function digestCard(items:DueItem[],language:Language,today:string,extras:DigestExtras={}):{card:ReportCard;caption:string}{
 const kit=messageKit(language),{locale,t}=kit;
 const name=extras.name?.trim(),{title,note}=greetingOf(kit,name,today);
 const groups=paymentGroups(items,today,kit,(item,overdue):CardRow=>{
  const incoming=income.includes(item.record.kind),kind=paymentKind(item,t);
  const detail=[kind,overdue?formatDate(item.date,locale):null].filter(Boolean).join(' · ');
  return {label:item.record.name,value:(incoming?'+':'')+kit.money(item.amount,item.record.currency),...(detail?{detail}:{}),...(incoming?{tone:'good' as const}:{})};
 });
 const sections:CardSection[]=[];let shown=0;
 for(const group of groups){
  const rows=group.lines.slice(0,Math.min(cardRows-shown,group.overdue?cardOverdue:cardRows));
  if(!rows.length)break;
  sections.push({title:group.title,...(group.overdue?{tone:'bad' as const}:{}),rows});shown+=rows.length;
 }
 const hidden=items.length-shown;
 const card:ReportCard={
  title,note,
  subtitle:formatDate(today,locale),sectionsTitle:t('Upcoming payments'),
  ...(extras.cashflow||extras.netWorth?{tilesTitle:t('Last 30 days')}:{}),
  tiles:digestTiles(kit,extras),charts:digestCharts(kit,extras,today),sections,
  ...(items.length?{}:{lines:[t('Nothing is due soon.')]}),
  ...(hidden>0?{footer:t('{count} more',{count:formatNumber(hidden,locale,0)})}:{}),
 };
 return {card,caption:`☀️ <b>${name?t('Good morning, {name}',{name:escapeHtml(name)}):t('Good morning')}</b>`};
}
