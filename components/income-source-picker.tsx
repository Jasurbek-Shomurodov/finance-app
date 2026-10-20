"use client";
import {frequencyLabels,type Frequency} from '@/lib/finance';
import { CategoryBadge } from '@/components/presentation-foundation/category-badge';
import { GroupedPicker } from '@/components/presentation-foundation/grouped-picker';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatDate } from '@/lib/format';
import { income } from '@/lib/finance';
type IncomeSourceOption={id:string;name:string;kind:string;categoryLabel?:string;disabled?:boolean;estimate?:number|null;currency?:string;frequency?:Frequency|null;payment?:{due:string;paid:boolean}|null};
/** Income source: sources and income categories grouped by kind, each with its estimate and next payment. */
export function IncomeSourcePicker({options,value,disabled,onChange}:{options:IncomeSourceOption[];value:string;disabled?:boolean;onChange:(id:string)=>void}){
 const {t,locale}=useLanguage();
 const categoryLabel=(kind:string)=>options.find(item=>item.kind===kind)?.categoryLabel??t(kind);
 // Built-in income kinds first, in their usual order, then added categories as they come.
 const groups=[...income,...new Set(options.map(item=>item.kind).filter(kind=>!income.includes(kind)))];
 return <GroupedPicker label={t('Income source')} placeholder={t('Choose an income source')} searchLabel={t('Income source or category')} allLabel={t('All income sources')} emptyText={t('No income sources found.')}
  groups={groups} groupLabel={categoryLabel} value={value} disabled={disabled} onChange={onChange}
  items={options.map(item=>({id:item.id,name:item.name,group:item.kind,disabled:item.disabled,badge:<CategoryBadge kind={item.kind} label={categoryLabel(item.kind)}/>,details:<>
   {item.currency&&<small className="income-source-estimate">{item.estimate!=null?t('Estimated: {amount} · {frequency}',{amount:formatMoney(item.estimate,item.currency,locale),frequency:t(frequencyLabels[item.frequency??'Monthly'])}):t('Variable income')}</small>}
   {item.payment&&<small className={item.payment.paid?'income-source-payment is-paid':'income-source-payment'}>{t(item.payment.paid?'Paid · {date}':'Scheduled · {date}',{date:formatDate(item.payment.due,locale)})}</small>}</>}))}/>;
}
