"use client";
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { useState, type ReactNode } from 'react';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { BusinessPicker, CategoryPicker } from '@/components/transactions/pickers';
import type { Category } from '@/lib/planning';
import type { CategoryChoice } from '@/lib/transaction-rules';
import { TagSelector } from '@/components/transactions/tags';
import { showError, showNotice, showSaved } from '@/lib/feedback';
import { canAssignBusiness } from '@/lib/business';
import { canTag, type Tag } from '@/lib/tags';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ChevronRight, Paperclip, Pencil, Split } from 'lucide-react';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CategoryBadge } from '@/components/presentation-foundation/category-badge';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney, formatRate, formatSignedMoney } from '@/lib/format';
import type { Entry } from '@/lib/finance';
import { shownName } from '@/lib/record-names';

type TagProps={tags:readonly Tag[];tagIds:readonly string[];onTags:(add:string[],remove:string[])=>Promise<unknown>;onCreateTag:(name:string)=>Promise<string>};
/** Changing the category right in the dialog: the categories on offer and the change itself, resolving to how many rows changed. */
export type CategoryEditing={categories:readonly Category[];removed?:readonly string[];onChange:(choice:CategoryChoice)=>Promise<number>};
/** Where a transaction written by a larger action came from: a line naming it, and for a mortgage payment a button that opens the mortgage. */
export type TransactionOrigin={label:string;openLabel?:string;onOpen?:()=>void};
/** Where the details lead: the account's, the property's and a business's own page, and Transactions with one category in view. Each is offered only where there is a page to open. */
export type TransactionOpens={/** Transactions with one tag in view. */tagHref?:(tag:string)=>string;account?:()=>void;property?:()=>void;business?:(id:string)=>(()=>void)|undefined;categoryHref?:(category:string)=>string};
/** A field that opens what it names. A plain name is the link itself; a value that also changes in place (`children`) keeps its own press and gets the arrow beside it. */
function Opens({name,onOpen,href,children}:{name:string;onOpen?:()=>void;href?:string;children?:ReactNode}){
 const {t}=useLanguage();
 if(!onOpen&&!href)return children??name;
 const label=children?undefined:name,props={className:'transaction-details-link','aria-label':t('Open {name}',{name}),title:children?t('Open {name}',{name}):undefined,onClick:onOpen};
 const body=<>{label&&<span>{label}</span>}<ArrowUpRight size={15} aria-hidden="true"/></>;
 return <span className="transaction-details-open">{children}{href?<DrawerLink href={href} {...props}>{body}</DrawerLink>:<button type="button" {...props}>{body}</button>}</span>;
}
/** A transaction at a glance: the amount first, then its fields in two columns, with attachments and Split as cards. Its category, business, tags and receipts change right here; Edit opens its form and the bin, at the footer's start, moves it to Recently deleted after a confirmation; the dialog's own × closes it. The account, business, property and category each open their own page (`opens`). */
export function TransactionDetailsDialog({record:initial,incoming,categoryName,businesses,onBusiness,tagging,accountName,propertyName,ownerName,attachments,editable,onEdit,onSplit,onDelete,onClose,categoryEditing,origin,schedule,opens={}}:{/** The recurring income or bill this payment belongs to, and its own form where it has one. */schedule?:{name:string;onOpen?:()=>void};categoryEditing?:CategoryEditing;opens?:TransactionOpens;origin?:TransactionOrigin;record:Entry;incoming:boolean;categoryName?:string;businesses:readonly BusinessOption[];onBusiness:(business:string|null)=>Promise<number>;tagging:TagProps;accountName?:string;/** The property it was paid for or received from. */propertyName?:string;/** Who it belongs to, in a shared household. */ownerName?:string;attachments?:ReactNode;editable:boolean;onEdit:()=>void;/** Opens Split transaction, when this one can be split. */onSplit?:()=>void;onDelete?:()=>void;onClose:()=>void}) {
 const {t,locale}=useLanguage();
 const [record,setRecord]=useState(initial),[tagIds,setTagIds]=useState<readonly string[]>(tagging.tagIds);
 const business=businesses.find(item=>item.id===record.business_id);
 async function changeBusiness(next:string|null){try{if(await onBusiness(next)){setRecord({...record,business_id:next});showSaved();}else showNotice('This transaction keeps its business.');}catch(reason){showError((reason as Error).message||'Could not save changes.');}}
 async function changeCategory(choice:CategoryChoice){try{if(await categoryEditing!.onChange(choice)){setRecord({...record,kind:choice.kind,custom_category_id:choice.category_id});showSaved();}else showNotice('This transaction keeps its category.');}catch(reason){showError((reason as Error).message||'Could not save changes.');}}
 async function toggleTag(id:string){const has=tagIds.includes(id);try{await tagging.onTags(has?[]:[id],has?[id]:[]);setTagIds(has?tagIds.filter(item=>item!==id):[...tagIds,id]);showSaved();}catch(reason){showError((reason as Error).message||'Could not save changes.');}}
 const money=(value:number)=>formatMoney(value,record.currency,locale);
 const name=shownName(record,t,categoryName);
 // A field is [label, value, wide?]: short facts pair up in two columns, the amount, tags and notes take the whole row.
 const rows:[string,ReactNode,boolean?][]=[
  [t('Amount'),<strong key="a" className={incoming?'transaction-details-amount positive':'transaction-details-amount'}>{formatSignedMoney(incoming?record.amount:-record.amount,record.currency,locale)}</strong>,true],
  [t('Date'),formatDate(record.date,locale)],
 ];
 if(accountName)rows.push([t('Account'),<Opens key="ac" name={accountName} onOpen={opens.account}/>]);
 // The category reads from the record as it stands, so a change made here shows at once.
 const customName=record.custom_category_id?categoryEditing?.categories.find(category=>category.id===record.custom_category_id)?.name??categoryName:undefined;
 const badges=<span key="c" className="flex flex-wrap gap-1"><CategoryBadge kind={record.kind} label={t(record.payment_type==='bonus'?'Bonus':record.kind)}/>{customName&&record.custom_category_id&&<CategoryBadge kind={record.custom_category_id} label={customName}/>}</span>;
 const categoryLabel=customName??t(record.kind),categoryHref=opens.categoryHref?.(record.custom_category_id??record.kind);
 rows.push([t('Category'),<Opens key="co" name={categoryLabel} href={categoryHref} onOpen={categoryHref?onClose:undefined}>{categoryEditing?<CategoryPicker key="c" record={record} categories={categoryEditing.categories} removed={categoryEditing.removed} onChange={choice=>void changeCategory(choice)}>{badges}</CategoryPicker>:badges}</Opens>]);
 if(schedule)rows.push([t('Recurring'),<Opens key="so" name={schedule.name} onOpen={schedule.onOpen}/>]);
 if(origin)rows.push([t('Source'),<span key="o" className="transaction-details-origin"><span>{origin.label}</span>{origin.onOpen&&origin.openLabel&&<Button type="button" size="sm" variant="outline" onClick={origin.onOpen}>{origin.openLabel}</Button>}</span>,true]);
 if(ownerName)rows.push([t('Owner'),ownerName]);
 // A one-time transaction has no frequency worth a row; a schedule names its own.
 if(record.frequency!=='Once')rows.push([t('Frequency'),t(record.frequency)]);
 if(record.end_date)rows.push([t('Last active date'),formatDate(record.end_date,locale)]);
 if(record.mortgage_payment_id)rows.push([t('Principal'),money(Number(record.payment_principal))],[t('Interest'),money(Number(record.payment_interest))]);
 const businessEditable=businesses.length>0&&(canAssignBusiness(record,null)||businesses.some(item=>canAssignBusiness(record,item.id)));
 const openBusiness=business?opens.business?.(business.id):undefined;
 if(businessEditable)rows.push([t('Business'),<Opens key="bo" name={business?.name??''} onOpen={openBusiness}><BusinessPicker key="b" record={record} businesses={businesses} onChange={next=>void changeBusiness(next)}/></Opens>]);
 else if(business)rows.push([t('Business'),<Opens key="bo" name={business.name} onOpen={openBusiness}/>]);
 if(propertyName)rows.push([t('Property'),<Opens key="po" name={propertyName} onOpen={opens.property}/>]);
 if(record.account_currency&&record.account_currency!==record.currency&&record.account_exchange_rate)rows.push([t('Exchange rate'),`1 ${record.account_currency} = ${formatRate(record.account_exchange_rate,locale)} ${record.currency}`]);
 if(canTag(record))rows.push([t('Tags'),<TagSelector key="t" tags={tagging.tags} selected={tagIds} onToggle={id=>void toggleTag(id)} onCreate={tagging.onCreateTag} hrefFor={opens.tagHref} onOpen={onClose}/>,true]);
 if(record.notes)rows.push([t('Notes'),<span key="n" className="whitespace-pre-wrap break-words">{record.notes}</span>,true]);
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="transaction-details" onOpenAutoFocus={event=>{/* Reading comes first: focus the dialog, not its tag field. */event.preventDefault();(event.currentTarget as HTMLElement).focus();}}>
  <div className="transaction-details-head"><CategoryIcon kind={record.custom_category_id&&customName?customName:record.kind}/><DialogTitle>{shownName(record, t)}</DialogTitle></div>
  <DialogDescription className="sr-only">{t('Transaction details')}</DialogDescription>
  <dl className="transaction-details-fields">{rows.map(([label,value,wide])=><div key={label} data-wide={wide||undefined}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  {(attachments||onSplit)&&<div className="transaction-details-cards">
   {attachments&&<section aria-label={t('Attachments')}><h3><Paperclip size={15} aria-hidden="true"/>{t('Attachments')}</h3>{attachments}</section>}
   {onSplit&&<button type="button" onClick={onSplit}><Split size={15} aria-hidden="true"/><span>{t('Split transaction')}</span><ChevronRight size={16} aria-hidden="true"/></button>}
  </div>}
  {(editable||onDelete)&&<div className="transaction-details-actions">{onDelete&&<DeleteButton label={t('Delete {name}',{name})} onClick={onDelete}/>}{editable&&<Button type="button" aria-label={t('Edit {name}',{name})} onClick={onEdit}><Pencil size={16} aria-hidden="true"/>{t('Edit')}</Button>}</div>}
 </DialogContent></Dialog>;
}
