// The morning Telegram digest, in the owner's language: a greeting with one
// line of encouragement, this month's income and expenses so far against the
// same days of last month, how net worth moved, where the money went, and what
// is overdue or due soon. Pure.
// It is sent as a picture (digestCard); the text is for languages the card's
// font cannot draw.
import {categoryColor} from './category-colors';
import type {MoneyDestination} from './digest-flow';
import {income} from './finance';
import {shiftDay} from './calendar-days';
import {formatDate,formatMonthYear,formatNumber,formatPercent} from './format';
import type {Language} from './i18n';
import type {RateTable} from './money';
import type {DueItem} from './planning';
import type {CardChart,CardRow,CardSection,CardTile,FlowNode,ReportCard} from './report-card';
import {escapeHtml} from './telegram';
import {messageKit} from './telegram-kit';
const motivation=['Small steps add up to big results.','A clear view of your money is the first step to calm.','Every record you add makes tomorrow easier to plan.','Progress beats perfection. Keep going.'];
export type DigestExtras={
 name?:string;currency?:string;
 /** Units of each currency per US dollar (the latest snapshot's rates), to show every payment in `currency`. */
 rates?:RateTable|null;
 /** Net worth in `currency` today, and at the last snapshot before this month began, for how it moved this month. */
 netWorth?:{amount:number;start?:number};
 /** Income and expenses from the 1st of this month to today, with expenses by category, largest first; `previous` is the
  * same days of last month, left out when it is incomplete. `missing` when an amount had no rate, so no total is complete. */
 cashflow?:{income:number;spending:number;missing?:boolean;categories:{key:string;label:string;amount:number}[];previous?:{income:number;spending:number;categories:{key:string;amount:number}[]};
  /** Income by source, largest first, named like the categories; and the cash moved this month into investments, a
   * mortgage's principal, other debts and money lent (lib/digest-flow.ts). Both left out when a rate was missing. */
  sources?:{key:string;label:string;amount:number}[];moved?:Partial<Record<MoneyDestination,number>>};
};
/** The days the digest covers: this month from the 1st to `today`, and the same days of last month, cut at its end. */
export function digestPeriods(today:string){
 const from=today.slice(0,8)+'01',previousTo=shiftDay(from,-1),previousFrom=previousTo.slice(0,8)+'01';
 const sameDay=previousFrom.slice(0,8)+today.slice(8);
 return {from,to:today,previousFrom,previousTo:sameDay<previousTo?sameDay:previousTo};
}
/** Snapshots the digest reads: enough to reach back past the 1st of any month. */
export const digestSnapshots=33;
/** Categories drawn as their own flow; the rest are one "Other" flow. */
const flowsShown=5;
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
/** Net worth's change this month; null without a value from before it began. */
const grown=(netWorth:DigestExtras['netWorth'])=>netWorth&&netWorth.start!==undefined?netWorth.amount-netWorth.start:null;
export function digestMessage(items:DueItem[],language:Language,today:string,extras:DigestExtras={}):string{
 const kit=messageKit(language),{t}=kit;
 const currency=extras.currency??'USD',money=(value:number)=>kit.money(value,currency);
 const signed=(value:number)=>(value<0?'−':'+')+money(Math.abs(value));
 const {title,note}=greetingOf(kit,extras.name?.trim()&&escapeHtml(extras.name.trim()),today);
 const greeting=`☀️ <b>${title}</b>\n<i>${note}</i>`;
 const payments=paymentsSection(items,language,today)??t('Nothing is due soon.');
 const facts:string[]=[];
 // An incomplete total is never shown as if it were the whole month.
 if(extras.cashflow?.missing)facts.push(`🧾 ${t('This month')}: ${t('Exchange rate unavailable.')}`);
 else if(extras.cashflow)facts.push(`🧾 ${t('This month: income {income}, expenses {expenses}.',{income:money(extras.cashflow.income),expenses:money(extras.cashflow.spending)})}`);
 if(extras.netWorth){
  const change=grown(extras.netWorth);
  facts.push(`📈 ${t('Net worth')}: ${money(extras.netWorth.amount)}${change!==null&&Math.round(change)!==0?' · '+t('{change} this month',{change:signed(change)}):''}`);
 }
 return [greeting,facts.join('\n'),payments].filter(Boolean).join('\n\n');
}
/** This month so far: what was spent, large, against the same days of last month in plain words; then income, what was
 * saved and net worth as quiet figures. */
function digestFigures(kit:Kit,extras:DigestExtras):{hero?:CardTile;figures:CardTile[]}{
 const {t,locale}=kit,currency=extras.currency??'USD',money=(value:number)=>kit.money(value,currency);
 const signed=(value:number)=>(value<0?'−':'+')+money(Math.abs(value));
 const figures:CardTile[]=[];let hero:CardTile|undefined;
 const flow=extras.cashflow;
 if(flow?.missing)hero={label:t('Spent'),value:'—',detail:t('Exchange rate unavailable.')};
 else if(flow){
  const {spending,previous}=flow,net=flow.income-spending,difference=previous?Math.abs(spending-previous.spending):0;
  // Spending more or less is stated plainly, never coloured as good or bad news.
  const detail=!previous||!previous.spending?undefined:Math.round(difference)===0?t('Same as last month by this day'):t(spending<previous.spending?'{amount} less than last month by this day':'{amount} more than last month by this day',{amount:money(difference)});
  hero={label:t('Spent'),value:money(spending),...(detail?{detail}:{})};
  figures.push(
   {label:t('Income'),value:money(flow.income),...(previous?{detail:`${t('Last month')}: ${money(previous.income)}`}:{})},
   {label:t('Saved'),value:(net<0?'−':'')+money(Math.abs(net)),...(net>0&&flow.income>0?{detail:t('{percent} of income',{percent:formatPercent(net/flow.income*100,locale,0)}),tone:'good' as const}:{})},
  );
 }
 if(extras.netWorth){
  const change=grown(extras.netWorth),moved=change!==null&&Math.round(change)!==0;
  figures.push({label:t('Net worth'),value:money(extras.netWorth.amount),...(moved?{detail:t('{change} this month',{change:signed(change)}),tone:change<0?'bad' as const:'good' as const}:{})});
 }
 return {...(hero?{hero}:{}),figures};
}
/** Where money went besides spending, in the order the Sankey lists them, with the label and colour of each. */
const destinations:{key:MoneyDestination;label:string;detail?:string;color:string}[]=[
 {key:'invested',label:'Investments',color:'#3567c9'},
 {key:'mortgage',label:'Mortgage',detail:'Principal',color:'#9a6a3a'},
 {key:'debt',label:'Debt principal paid',color:'#b4583c'},
 {key:'lent',label:'Money lent',color:'#7a62c2'},
];
/** Where this month's money went, as a Sankey: each income source (and what came out of savings when more went out than
 * came in) flowing into each spending category, what was invested, paid off a mortgage or another debt, or lent, and
 * what stayed in the accounts. A category shows last month's amount by the same day beside it. */
function digestFlow(kit:Kit,extras:DigestExtras):CardChart[]{
 const {t,locale}=kit,currency=extras.currency??'USD',money=(value:number)=>kit.money(value,currency);
 const flow=extras.cashflow;
 if(!flow||flow.missing||(!flow.income&&!flow.spending))return [];
 const moved=destinations.map(item=>({...item,amount:Math.max(0,flow.moved?.[item.key]??0)})).filter(item=>Math.round(item.amount)>0);
 const kept=flow.income-flow.spending-moved.reduce((sum,item)=>sum+item.amount,0);
 const base=Math.max(flow.income,flow.income-kept),share=(amount:number)=>formatPercent(amount/base*100,locale,0);
 const before=new Map(flow.previous?.categories.map(category=>[category.key,category.amount]));
 const node=(label:string,amount:number,color:string,detail?:string):FlowNode=>({label,amount,color,value:money(amount),detail:[share(amount),detail].filter(Boolean).join(' · ')});
 const lastMonth=(amount:number|undefined)=>amount?`${t('Last month')}: ${money(amount)}`:undefined;
 const shown=flow.categories.slice(0,flowsShown),rest=flow.categories.slice(flowsShown);
 const restAmount=rest.reduce((sum,category)=>sum+category.amount,0),restBefore=rest.reduce((sum,category)=>sum+(before.get(category.key)??0),0);
 // Each category keeps its own colour from the app and the tail folds into one grey flow; what stayed is green.
 const targets=[
  ...shown.map(category=>node(category.label,category.amount,categoryColor(category.key),lastMonth(before.get(category.key)))),
  ...(restAmount>0?[node(t('Other'),restAmount,'#9aa38f',lastMonth(restBefore))]:[]),
  ...moved.map(item=>node(t(item.label),item.amount,item.color,item.detail&&t(item.detail))),
  ...(Math.round(kept)>0?[node(t('Kept in accounts'),kept,'#4d7c0f')]:[]),
 ];
 // Income by source when it is known and adds up; otherwise one Income source.
 const named=flow.sources?.filter(source=>source.amount>0)??[],known=named.reduce((sum,source)=>sum+source.amount,0);
 const incomes=named.length&&Math.abs(known-flow.income)<1?named.map(source=>({label:source.label,amount:source.amount,value:money(source.amount),color:categoryColor(source.key)})):flow.income>0?[{label:t('Income'),amount:flow.income,value:money(flow.income),color:'#2f7d32'}]:[];
 const sources=[...incomes,...(Math.round(kept)<0?[{label:t('From savings'),amount:-kept,value:money(-kept),color:'#9aa38f'}]:[])];
 return targets.length?[{kind:'flow',title:t('Where the money went'),sources,targets}]:[];
}
/** The digest as a picture: the greeting, this month's figures against last month, where the money went as a Sankey,
 * then the next payments as they were entered, grouped as in the text. The caption is the greeting, so the chat list shows who it is for. */
export function digestCard(items:DueItem[],language:Language,today:string,extras:DigestExtras={}):{card:ReportCard;caption:string}{
 const kit=messageKit(language),{locale,t}=kit;
 const name=extras.name?.trim(),{title}=greetingOf(kit,name,today);
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
  // The header is the greeting alone: Telegram already dates the message.
  title,sectionsTitle:t('Upcoming payments'),
  ...(extras.cashflow||extras.netWorth?{tilesTitle:formatMonthYear(today,locale)}:{}),
  ...digestFigures(kit,extras),charts:digestFlow(kit,extras),sections,
  ...(items.length?{}:{lines:[t('Nothing is due soon.')]}),
  ...(hidden>0?{footer:t('{count} more',{count:formatNumber(hidden,locale,0)})}:{}),
 };
 return {card,caption:`☀️ <b>${name?t('Good morning, {name}',{name:escapeHtml(name)}):t('Good morning')}</b>`};
}
