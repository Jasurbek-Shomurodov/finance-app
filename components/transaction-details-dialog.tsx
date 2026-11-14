"use client";
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { useState, type ReactNode } from 'react';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { BusinessPicker } from '@/components/transactions/pickers';
import { TagSelector } from '@/components/transactions/tags';
import { showError, showNotice, showSaved } from '@/lib/feedback';
import { canAssignBusiness } from '@/lib/business';
import { canTag, type Tag } from '@/lib/tags';
import { Button } from '@/components/ui/button';
import { ChevronRight, Paperclip, Pencil, Split } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CategoryBadge } from '@/components/presentation-foundation/category-badge';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney, formatNumber, formatSignedMoney } from '@/lib/format';
import type { Entry } from '@/lib/finance';
import { shownName } from '@/lib/record-names';

type TagProps={tags:readonly Tag[];tagIds:readonly string[];onTags:(add:string[],remove:string[])=>Promise<unknown>;onCreateTag:(name:string)=>Promise<string>};
/** A transaction at a glance: the amount first, then its fields in two columns, with attachments and Split as cards. Its business, tags and receipts change right here; Edit opens its form and the bin, at the footer's start, moves it to Recently deleted after a confirmation; the dialog's own × closes it. */
export function TransactionDetailsDialog({record:initial,incoming,categoryName,businesses,onBusiness,tagging,accountName,propertyName,ownerName,attachments,editable,onEdit,onSplit,onDelete,onClose}:{record:Entry;incoming:boolean;categoryName?:string;businesses:readonly BusinessOption[];onBusiness:(business:string|null)=>Promise<number>;tagging:TagProps;accountName?:string;/** The property it was paid for or received from. */propertyName?:string;/** Who it belongs to, in a shared household. */ownerName?:string;attachments?:ReactNode;editable:boolean;onEdit:()=>void;/** Opens Split transaction, when this one can be split. */onSplit?:()=>void;onDelete?:()=>void;onClose:()=>void}) {
 const {t,locale}=useLanguage();
 const [record,setRecord]=useState(initial),[tagIds,setTagIds]=useState<readonly string[]>(tagging.tagIds);
 const business=businesses.find(item=>item.id===record.business_id);
 async function changeBusiness(next:string|null){try{if(await onBusiness(next)){setRecord({...record,business_id:next});showSaved();}else showNotice('This transaction keeps its business.');}catch(reason){showError((reason as Error).message||'Could not save changes.');}}
 async function toggleTag(id:string){const has=tagIds.includes(id);try{await tagging.onTags(has?[]:[id],has?[id]:[]);setTagIds(has?tagIds.filter(item=>item!==id):[...tagIds,id]);showSaved();}catch(reason){showError((reason as Error).message||'Could not save changes.');}}
 const money=(value:number)=>formatMoney(value,record.currency,locale);
 const name=shownName(record,t,categoryName);
 // A field is [label, value, wide?]: short facts pair up in two columns, the amount, tags and notes take the whole row.
 const rows:[string,ReactNode,boolean?][]=[
  [t('Amount'),<strong key="a" className={incoming?'transaction-details-amount positive':'transaction-details-amount'}>{formatSignedMoney(incoming?record.amount:-record.amount,record.currency,locale)}</strong>,true],
  [t('Date'),formatDate(record.date,locale)],
 ];
 if(accountName)rows.push([t('Account'),accountName]);
 rows.push([t('Category'),<span key="c" className="flex flex-wrap gap-1"><CategoryBadge kind={record.kind} label={t(record.payment_type==='bonus'?'Bonus':record.kind)}/>{categoryName&&record.custom_category_id&&<CategoryBadge kind={record.custom_category_id} label={categoryName}/>}</span>]);
 if(ownerName)rows.push([t('Owner'),ownerName]);
 rows.push([t('Frequency'),t(record.frequency==='Once'?'One-time record':record.frequency)]);
 if(record.end_date)rows.push([t('Last active date'),formatDate(record.end_date,locale)]);
 if(record.mortgage_payment_id)rows.push([t('Principal'),money(Number(record.payment_principal))],[t('Interest'),money(Number(record.payment_interest))]);
 const businessEditable=businesses.length>0&&(canAssignBusiness(record,null)||businesses.some(item=>canAssignBusiness(record,item.id)));
 if(businessEditable)rows.push([t('Business'),<BusinessPicker key="b" record={record} businesses={businesses} onChange={next=>void changeBusiness(next)}/>]);
 else if(business)rows.push([t('Business'),business.name]);
 if(propertyName)rows.push([t('Property'),propertyName]);
 if(record.account_currency&&record.account_currency!==record.currency&&record.account_exchange_rate)rows.push([t('Exchange rate'),`1 ${record.account_currency} = ${formatNumber(record.account_exchange_rate,locale)} ${record.currency}`]);
 if(canTag(record))rows.push([t('Tags'),<TagSelector key="t" tags={tagging.tags} selected={tagIds} onToggle={id=>void toggleTag(id)} onCreate={tagging.onCreateTag}/>,true]);
 if(record.notes)rows.push([t('Notes'),<span key="n" className="whitespace-pre-wrap break-words">{record.notes}</span>,true]);
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="transaction-details">
  <div className="transaction-details-head"><CategoryIcon kind={record.custom_category_id&&categoryName?categoryName:record.kind}/><DialogTitle>{shownName(record, t)}</DialogTitle></div>
  <DialogDescription className="sr-only">{t('Transaction details')}</DialogDescription>
  <dl className="transaction-details-fields">{rows.map(([label,value,wide])=><div key={label} data-wide={wide||undefined}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  {(attachments||onSplit)&&<div className="transaction-details-cards">
   {attachments&&<section aria-label={t('Attachments')}><h3><Paperclip size={15} aria-hidden="true"/>{t('Attachments')}</h3>{attachments}</section>}
   {onSplit&&<button type="button" onClick={onSplit}><Split size={15} aria-hidden="true"/><span>{t('Split transaction')}</span><ChevronRight size={16} aria-hidden="true"/></button>}
  </div>}
  {(editable||onDelete)&&<div className="transaction-details-actions">{onDelete&&<DeleteButton label={t('Delete {name}',{name})} onClick={onDelete}/>}{editable&&<Button type="button" aria-label={t('Edit {name}',{name})} onClick={onEdit}><Pencil size={16} aria-hidden="true"/>{t('Edit')}</Button>}</div>}
 </DialogContent></Dialog>;
}
