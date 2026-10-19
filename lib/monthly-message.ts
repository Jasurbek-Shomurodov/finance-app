// The monthly Telegram report, sent on the 1st for the month that just ended: what was earned, spent and saved, the
// spending set against the month before, where the most went, and how net worth moved. Pure. It is sent as a picture
// (monthlyCard); the text is for languages the card's font cannot draw.
import {formatMonthYear,formatPercent} from './format';
import type {Language} from './i18n';
import type {CardTile,ReportCard} from './report-card';
import {escapeHtml} from './telegram';
import {messageKit} from './telegram-kit';
export type MonthlyInput={
 name?:string;currency:string;
 /** The first day of the month reported. */
 month:string;
 income:number;spending:number;
 /** Amounts left out of the month's totals because no rate converts them: the totals are then not shown. */
 missing?:number;
 /** The month before, for the spending comparison; left out when it is incomplete too. */
 previous?:{spending:number;missing?:number};
 /** The largest spending categories, largest first, already named in the owner's language. */
 categories:{label:string;amount:number}[];
 /** Net worth at the month's last snapshot and its change since the month before ended, when both exist. */
 netWorth?:{amount:number;change:number|null};
};
/** Categories the report lists. */
export const monthlyCategories=5;
function parts(input:MonthlyInput,language:Language){
 const kit=messageKit(language),{t}=kit;
 const money=(value:number)=>kit.money(value,input.currency),name=input.name?.trim();
 const missing=(input.missing??0)>0,net=input.income-input.spending;
 const quiet=!input.income&&!input.spending&&!missing;
 const previous=input.previous&&!(input.previous.missing??0)&&input.previous.spending>0?input.previous.spending:null;
 const difference=previous===null?0:Math.abs(input.spending-previous);
 // As in the digest, spending more or less is stated plainly, never as good or bad news.
 const compared=previous!==null&&Math.round(difference)!==0?t(input.spending<previous?'{change} less than the month before':'{change} more than the month before',{change:money(difference)}):null;
 const worth=input.netWorth&&{value:money(input.netWorth.amount),change:input.netWorth.change!==null&&Math.round(input.netWorth.change)!==0?input.netWorth.change:null};
 const changed=(change:number)=>t('{change} this month',{change:(change<0?'−':'+')+money(Math.abs(change))});
 return {kit,t,money,name,missing,net,quiet,compared,worth,changed};
}
export function monthlyMessage(input:MonthlyInput,language:Language):string{
 const {kit,t,money,name,missing,net,quiet,compared,worth,changed}=parts(input,language);
 const title=`📅 <b>${name?t('Your month, {name}',{name:escapeHtml(name)}):t('Your month')}</b>\n${formatMonthYear(input.month,kit.locale)}`;
 const lines:string[]=[];
 if(quiet)lines.push(t("A quiet month. Add this month's records to see your report."));
 else if(missing)lines.push(`💰 ${t('Saved')}: ${t('Exchange rate unavailable.')}`);
 else{
  lines.push(`💰 ${net>=0?t('You saved {amount} this month.',{amount:money(net)}):t('You spent {amount} more than you earned this month.',{amount:money(-net)})}`);
  lines.push(`🧾 ${t('Spending')}: ${money(input.spending)}${compared?' · '+compared:''}`);
  // An incomplete month has no reliable categories either.
  for(const category of input.categories.slice(0,3))lines.push(`🏷 ${t('Top spending: {category} · {amount}',{category:escapeHtml(category.label),amount:money(category.amount)})}`);
 }
 if(worth)lines.push(`📈 ${t('Net worth')}: ${worth.value}${worth.change!==null?' · '+changed(worth.change):''}`);
 return `${title}\n\n${lines.join('\n')}`;
}
/** The report as a picture: saved, earned, spent and net worth as tiles, then the top categories with their share of
 * the month's spending. */
export function monthlyCard(input:MonthlyInput,language:Language):{card:ReportCard;caption:string}{
 const {kit,t,money,name,missing,net,quiet,compared,worth,changed}=parts(input,language);
 const tiles:CardTile[]=[];
 if(missing)tiles.push({label:t('Saved'),value:'—',detail:t('Exchange rate unavailable.')});
 else if(!quiet)tiles.push(
  {label:t('Saved'),value:(net<0?'−':'')+money(Math.abs(net)),tone:net<0?'bad':'good'},
  {label:t('Income'),value:money(input.income)},
  {label:t('Spending'),value:money(input.spending),...(compared?{detail:compared}:{})},
 );
 if(worth)tiles.push({label:t('Net worth'),value:worth.value,...(worth.change!==null?{detail:changed(worth.change),tone:worth.change<0?'bad' as const:'good' as const}:{})});
 const shown=missing?[]:input.categories.slice(0,monthlyCategories);
 const card:ReportCard={
  title:name?t('Your month, {name}',{name}):t('Your month'),
  subtitle:formatMonthYear(input.month,kit.locale),
  tiles,
  ...(shown.length?{sections:[{title:t('Top spending'),rows:shown.map(category=>({label:category.label,value:money(category.amount),...(input.spending>0?{detail:formatPercent(category.amount/input.spending*100,kit.locale,0)}:{})}))}]}:{}),
  ...(quiet?{lines:[t("A quiet month. Add this month's records to see your report.")]}:{}),
 };
 return {card,caption:`📅 <b>${name?t('Your month, {name}',{name:escapeHtml(name)}):t('Your month')}</b> · ${escapeHtml(formatMonthYear(input.month,kit.locale))}`};
}
