// The Sunday Telegram recap: what was saved, where the most went, and which
// goals moved forward. Pure. The share button carries no amounts, so what a
// friend sees is an invitation, not the owner's finances. It is sent as a picture
// (recapCard) with the same button; the text is for languages the card's font
// cannot draw.
import {formatDate,formatNumber} from './format';
import type {Language} from './i18n';
import type {CardTile,ReportCard} from './report-card';
import {escapeHtml,type TelegramKeyboard,type TelegramMessage} from './telegram';
import {messageKit} from './telegram-kit';
export type RecapInput={
 name?:string;currency:string;from:string;to:string;
 income:number;spending:number;
 /** Amounts left out of `income` and `spending` because no rate converts them: the totals are then not shown. */
 missing?:number;
 top:{label:string;amount:number}|null;
 goalsMoved:number;
 /** The app's address; without it the message has no share button. */
 shareOrigin:string|null;
};
export const shareLink=(origin:string,text:string)=>`https://t.me/share/url?url=${encodeURIComponent(origin)}&text=${encodeURIComponent(text)}`;
const shareKeyboard=(input:RecapInput,t:ReturnType<typeof messageKit>['t']):TelegramKeyboard|undefined=>input.shareOrigin?{inline:[[{text:t('Share my week'),url:shareLink(input.shareOrigin,t('I check in on my money every week with Hoggish 💪'))}]]}:undefined;
export function recapMessage(input:RecapInput,language:Language):Omit<TelegramMessage,'chat_id'>{
 const kit=messageKit(language),{locale,t}=kit;
 const money=(value:number)=>kit.money(value,input.currency),name=input.name?.trim();
 const title=`📊 <b>${name?t('Your week, {name}',{name:escapeHtml(name)}):t('Your week')}</b>\n${formatDate(input.from,locale)} – ${formatDate(input.to,locale)}`;
 const missing=(input.missing??0)>0;
 if(!input.income&&!input.spending&&!input.goalsMoved&&!missing)return {text:`${title}\n\n${t("A quiet week. Add this week's records to see your recap.")}`};
 const net=input.income-input.spending,lines=[missing?`💰 ${t('Saved')}: ${t('Exchange rate unavailable.')}`:`💰 ${net>=0?t('You saved {amount} this week.',{amount:money(net)}):t('You spent {amount} more than you earned this week.',{amount:money(-net)})}`];
 // An incomplete week has no reliable top category either.
 if(input.top&&!missing)lines.push(`🏷 ${t('Top spending: {category} · {amount}',{category:escapeHtml(input.top.label),amount:money(input.top.amount)})}`);
 if(input.goalsMoved>0)lines.push(`🎯 ${t('Goals moved forward: {count}',{count:formatNumber(input.goalsMoved,locale,0)})}`);
 const text=`${title}\n\n${lines.join('\n')}`;
 const keyboard=shareKeyboard(input,t);
 return keyboard?{text,keyboard}:{text};
}
/** The recap as a picture: what was saved, earned and spent as tiles, the top category, and the goals that moved. A
 * quiet week sends the plain text instead, with nothing to draw. */
export function recapCard(input:RecapInput,language:Language):{card:ReportCard;caption:string;keyboard?:TelegramKeyboard}|null{
 const kit=messageKit(language),{locale,t}=kit;
 const money=(value:number)=>kit.money(value,input.currency),name=input.name?.trim();
 const missing=(input.missing??0)>0;
 if(!input.income&&!input.spending&&!input.goalsMoved&&!missing)return null;
 const net=input.income-input.spending;
 const tiles:CardTile[]=missing
  ?[{label:t('Saved'),value:'—',detail:t('Exchange rate unavailable.')}]
  :[{label:t('Saved'),value:(net<0?'−':'')+money(Math.abs(net)),tone:net<0?'bad':'good'},{label:t('Income'),value:money(input.income)},{label:t('Spending'),value:money(input.spending)}];
 // An incomplete week has no reliable top category either.
 if(input.top&&!missing)tiles.push({label:t('Top spending'),value:money(input.top.amount),detail:input.top.label});
 const card:ReportCard={
  title:name?t('Your week, {name}',{name}):t('Your week'),
  subtitle:`${formatDate(input.from,locale)} – ${formatDate(input.to,locale)}`,
  tiles,
  ...(input.goalsMoved>0?{lines:[t('Goals moved forward: {count}',{count:formatNumber(input.goalsMoved,locale,0)})]}:{}),
 };
 const keyboard=shareKeyboard(input,t);
 return {card,caption:`📊 <b>${name?t('Your week, {name}',{name:escapeHtml(name)}):t('Your week')}</b>`,...(keyboard?{keyboard}:{})};
}
