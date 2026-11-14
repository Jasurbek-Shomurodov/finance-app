"use client";
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { Plus, Search } from 'lucide-react';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { DeleteCategoryDialog, EditCategoryDialog } from '@/components/workspace/workspace-lazy';
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { Count } from '@/components/presentation-foundation/count';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { AddCategoryDialog } from '@/components/settings/add-category-dialog';
import { CategoryList, type CategoryItem, type CategoryRowView } from '@/components/settings/category-list';
import type { CategoryIconsController, CategoryLookChange } from '@/hooks/use-category-icons';
import type { RemovedCategoriesController } from '@/hooks/use-removed-categories';
import { canRemoveCategory, offeredKinds } from '@/lib/removed-categories';
import { categoryHue, chosenCategoryHue } from '@/lib/category-colors';
import { categoryPlan, type CategoryPlanSource } from '@/lib/category-plans';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useDiscardChanges } from '@/components/discard-changes';
import { formatMoney } from '@/lib/format';
import { decimalTotalEquals } from '@/lib/decimal-amounts';
import type { Category } from '@/lib/planning';
import { income, type Entry } from '@/lib/finance';
import type { TransactionTools } from '@/lib/transaction-tools';
import { useDisplayOrder } from '@/hooks/use-display-order';
import type { PreferenceResource } from '@/hooks/use-workspace-preferences';
import { categoryNameTaken } from '@/lib/category-names';
import { categoryChoices } from '@/lib/transaction-rules';
export type ToolsController={data:TransactionTools;loading:boolean;error:string;save:(action:string,data:unknown)=>Promise<void>;retry:()=>void};
type Direction=Category['direction'];
type PanelProps={categories:Category[];saveCategory:(name:string,direction:Direction,id?:string)=>Promise<string>;icons:CategoryIconsController;removed:RemovedCategoriesController;loading:boolean;error:string;onRetry:()=>void;onDeleted:()=>void;preferences:PreferenceResource;owner:string|null;demo:boolean;
 /** This month's budgets and the running schedules, shown beside each category; without them the columns read as empty. */
 plans?:CategoryPlanSource};
const noPlans:CategoryPlanSource={amounts:[],records:[],month:'',currency:'',rates:undefined};
/** Categories in Settings: one list a direction at a time, in the order the person drags them into, with a search, the
 * budget and recurring bill of each, and add, edit and delete in dialogs. */
export function TransactionToolsPanel({categories,saveCategory,icons,removed,loading,error,onRetry,onDeleted,preferences,owner,demo,plans=noPlans}:PanelProps){
 const {t,locale}=useLanguage();
 const [direction,setDirection]=useState<Direction>('expense'),[query,setQuery]=useState('');
 const [editing,setEditing]=useState<CategoryItem|null>(null),[adding,setAdding]=useState(false),[deleting,setDeleting]=useState<Category|null>(null);
 // Built-in categories are listed by name and added ones by id, in the order the person drags them into.
 const items:CategoryItem[]=[...offeredKinds('income',removed.kinds).map(kind=>({id:kind,name:kind,direction:'income' as const})),...offeredKinds('expense',removed.kinds).map(kind=>({id:kind,name:kind,direction:'expense' as const})),...categories.map(category=>({id:category.id,name:category.name,direction:category.direction,category}))];
 const order=useDisplayOrder('category_order',items,preferences,owner,demo);
 const label=(item:CategoryItem)=>item.category?item.name:t(item.name);
 const listed=order.items.filter(item=>item.direction===direction);
 const builtInNames=listed.filter(item=>!item.category).map(label);
 const search=query.trim().toLocaleLowerCase(locale);
 const disabled=loading||!!error;
 // Deleting a built-in category passes it on as a category whose id is its kind; the sample workspace only hides it for the visit.
 const remove=(item:CategoryItem)=>{const category=item.category??{id:item.id,name:t(item.name),direction:item.direction};setEditing(null);if(demo&&!categories.includes(category))removed.hideForVisit(category.id);else setDeleting(category);};
 const removable=(item:CategoryItem)=>canRemoveCategory(item.id,item.direction,categories,removed.kinds);
 const rows:CategoryRowView[]=listed.filter(item=>label(item).toLocaleLowerCase(locale).includes(search)).map(item=>({item,label:label(item),emoji:icons.emojiOf(item.category?item.name:item.id),hue:chosenCategoryHue(item.id,icons.colors??{}),plan:categoryPlan(item.id,item.direction,plans),onDelete:removable(item)?()=>remove(item):undefined}));
 // The name is saved before the icon, for a new category and an edited one alike.
 const saveEdit=async(item:CategoryItem,{name:renamed,...look}:CategoryLookChange&{name?:string})=>{if(renamed)await saveCategory(renamed,item.direction,item.id);if(look.icon!==undefined||look.color!==undefined)await icons.update(item.id,look);};
 const add=async(name:string,icon:string|null)=>{const id=await saveCategory(name,direction);if(icon)await icons.choose(id,icon);};
 return <section id="categories" className="panel category-settings">
 <PanelTitle title={t('Categories')} count={<Count value={listed.length} loading={loading}/>} hint={t('Add income and expense categories to use when recording transactions.')}>
  <Segmented label={t('Categories')} value={direction} onChange={setDirection} options={[{value:'expense',label:t('Expenses')},{value:'income',label:t('Income')}]}/>
  <label className="category-search"><Search size={16} aria-hidden="true"/><Input type="search" aria-label={t('Search categories')} placeholder={t('Search categories')} value={query} maxLength={80} onChange={event=>setQuery(event.target.value)}/></label>
  <Button type="button" size="sm" disabled={disabled} onClick={()=>setAdding(true)}><Plus size={16} aria-hidden="true"/>{t(direction==='income'?'Add income category':'Add expense category')}</Button>
 </PanelTitle>
 {error&&<InlineError message={t(error)} onRetry={onRetry}/>}
 {rows.length?<CategoryList direction={direction} rows={rows} currency={plans.currency} disabled={disabled} moveDisabled={order.disabled||disabled} onMove={order.reorder} onEdit={setEditing}/>:<p className="category-list-empty" role="status">{t('No matching categories.')}</p>}
 <ErrorPopup message={order.error}/>
 {adding&&<AddCategoryDialog key={direction} direction={direction} iconsDisabled={icons.disabled} taken={name=>categoryNameTaken(name,direction,categories,builtInNames)} onAdd={add} onClose={()=>setAdding(false)}/>}
 {editing&&<EditCategoryDialog key={editing.id} item={{...editing,label:label(editing)}} icon={icons.emojiOf(editing.category?editing.name:editing.id)} chosen={Object.hasOwn(icons.icons,editing.id)} color={icons.colors?.[editing.id]??null} defaultHue={categoryHue(editing.id)} iconsDisabled={icons.disabled} categories={categories} builtInNames={order.items.filter(item=>item.direction===editing.direction&&!item.category).map(label)} onSave={change=>saveEdit(editing,change)} onDelete={removable(editing)?()=>remove(editing):undefined} onClose={()=>setEditing(null)}/>}
 {deleting&&<DeleteCategoryDialog key={deleting.id} category={deleting} categories={categories} removed={removed.kinds} onClose={()=>setDeleting(null)} onDeleted={()=>{if(!categories.includes(deleting))removed.deleted(deleting.id);onDeleted();}}/>}
 </section>;
}
export function SplitTransactionDialog({record,tools,categories,removed=[],onClose}:{record:Entry;tools:ToolsController;categories:Category[];removed?:readonly string[];onClose:()=>void}){
 const {t,locale}=useLanguage();const [initial]=useState(()=>tools.data.splits.filter(part=>part.record_id===record.id).map(({category_id,amount})=>({category_id,amount:Number(amount)})));
 const [parts,setParts]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const guard=useDiscardChanges(JSON.stringify(parts)!==JSON.stringify(initial),onClose,busy);
 const valid=parts.length===0||(parts.length>=2&&parts.every(part=>part.category_id&&part.amount>0)&&decimalTotalEquals(parts.map(part=>part.amount),record.amount));
 return <><Dialog open onOpenChange={open=>{if(!open)guard.close();}}><DialogContent className="record-dialog" showCloseButton={!busy}><DialogTitle>{t('Split transaction')}<InfoHint>{t('Allocate the existing transaction across categories. Its total and account balance do not change.')}</InfoHint></DialogTitle><DialogDescription className="sr-only">{t('Allocate the existing transaction across categories. Its total and account balance do not change.')}</DialogDescription><p>{record.name} · {formatMoney(record.amount,record.currency,locale)}</p><form className="record-form" onSubmit={async event=>{event.preventDefault();if(!valid)return;setBusy(true);setError('');try{await tools.save('split',{record_id:record.id,splits:parts});onClose();}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>
 <fieldset disabled={busy} className="tracker-fields">{parts.map((part,index)=><div className="inline-tool-form" key={index}><label>{t('Category')}<NativeSelect required value={part.category_id} onChange={event=>setParts(parts.map((item,i)=>i===index?{...item,category_id:event.target.value}:item))}><option value="">{t('Select category')}</option>{categoryChoices(categories,income.includes(record.kind)?'income':'expense',removed).map(choice=><option key={choice.category_id??choice.kind} value={choice.category_id??choice.kind}>{choice.custom?choice.name:t(choice.name)}</option>)}</NativeSelect></label><label>{t('Amount')}<FormattedNumberInput value={part.amount} max={1e15} onValueChange={amount=>setParts(parts.map((item,i)=>i===index?{...item,amount}:item))}/></label><DeleteButton variant="ghost" label={t('Remove')} onClick={()=>setParts(parts.filter((_,i)=>i!==index))}/></div>)}<Button type="button" variant="outline" disabled={parts.length>=50} onClick={()=>setParts([...parts,{category_id:'',amount:0}])}>{t('Add split')}</Button><Button type="button" variant="ghost" onClick={()=>setParts([])}>{t('Clear split')}</Button></fieldset>
 {!valid&&<p role="status">{t('Use at least two categories and make the amounts equal the transaction total.')}</p>}<ErrorPopup message={error}/><FormFooter busy={busy} onCancel={guard.close}><Button disabled={busy||!valid||!!tools.error||tools.loading}>{t(busy?'Saving…':'Save split')}</Button></FormFooter></form></DialogContent></Dialog>{guard.confirmation}</>;
}
