"use client";
import { showDeleted, showError, showNotice } from '@/lib/feedback';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { ArchiveRestore, Search } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RecoveryRowsSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { Pagination } from '@/components/presentation-foundation/pagination';
import { formatNumber } from '@/lib/format';
import { requestJson } from '@/lib/api-client';
import { useSessionResource } from '@/hooks/use-owner-resource';
import { deletedDays, deletedItemType, deletedSearchTerm, deletedTypes, matchesDeletedSearch, type DeletedItem, type DeletedType } from '@/lib/deleted-items';
import { depositToday } from '@/lib/deposit-interest';
import type { RestorePreview } from '@/lib/restore-preview';
import { DeletedDay, DeletedRow, deletedName } from '@/components/deleted-items/deleted-row';
import { RestorePanel, type PanelNames } from '@/components/deleted-items/restore-panel';

const emptyPage:{items:DeletedItem[];hasMore:boolean}={items:[],hasMore:false};
const typeLabels:Record<DeletedType,string>={transactions:'Transactions',recurring:'Recurring',goals:'Goals',accounts:'Accounts'};
/** What the screen tells about an item beyond its own data; without it, categories read by their kind and nothing is previewed. */
export type BinContext=PanelNames&{preview:(item:DeletedItem)=>RestorePreview|null};
const plainContext=(t:(key:string)=>string):BinContext=>({categoryName:entry=>t(entry.kind),accountName:()=>null,preview:()=>null});

/** A search waits for a pause in typing before it reads the bin again. */
function useSettledSearch(search:string){
 const [settled,setSettled]=useState(search);
 useEffect(()=>{const timer=setTimeout(()=>setSettled(search),300);return()=>clearTimeout(timer);},[search]);
 return settled;
}

/** Nothing to list: the bin is empty (one sentence and a way back), or nothing matches the tab or search; a failed read shows its error instead. */
function BinEmpty({failed,filtering,onBrowse}:{failed:boolean;filtering:boolean;onBrowse?:()=>void}){
 const {t}=useLanguage();
 if(failed)return null;
 if(filtering)return <EmptyState icon={<Search aria-hidden="true"/>} title={t('No matching records')}/>;
 return <EmptyState icon={<ArchiveRestore aria-hidden="true"/>} title={t('No deleted items')} description={t('Deleted items stay here until you delete them permanently.')}>{onBrowse&&<Button variant="outline" onClick={onBrowse}>{t('Go to Transactions')}</Button>}</EmptyState>;
}

/** One page of the bin, narrowed by a type tab and a search: read from the database when signed in, filtered here in the sample workspace. */
function useBinPage(demo:boolean,demoItems:DeletedItem[]){
 const [page,setPage]=useState(1),[reload,setReload]=useState(0);
 const [type,setType]=useState<DeletedType|null>(null),[search,setSearch]=useState('');
 const term=deletedSearchTerm(useSettledSearch(search));
 // A tab or a search narrows the bin in the database; the first page of the whole bin keeps the warm-up's address.
 const narrowed=(type?'&type='+type:'')+(term?'&q='+encodeURIComponent(term):'');
 // The page's items belong to the signed-in session; a restore or permanent delete reads the page again.
 const remote=useSessionResource('/api/deleted-items?page='+page+narrowed,!demo,reload,emptyPage);
 const {error:loadError}=remote;const {items,hasMore}=remote.data;
 // A page emptied by a restore or a delete falls back to the one before it, still loading until that page shows.
 const fallingBack=!demo&&!remote.loading&&!loadError&&!items.length&&page>1;
 if(fallingBack)setPage(page-1);
 const shown=demoItems.filter(item=>(!type||deletedItemType(item)===type)&&matchesDeletedSearch(item,term));
 const narrow=(next:{type?:DeletedType|null;search?:string})=>{setPage(1);if('type' in next)setType(next.type??null);if('search' in next)setSearch(next.search??'');};
 return {page,setPage,type,search,narrow,loadError,retry:remote.retry,reread:()=>setReload(n=>n+1),filtering:!!type||!!term,
  loading:remote.loading||fallingBack,visible:demo?shown.slice((page-1)*10,page*10):items,hasNext:demo?shown.length>page*10:hasMore};
}

type Props={demo:boolean;demoItems:DeletedItem[];onRestore:(item:DeletedItem)=>void;onDelete:(item:DeletedItem)=>void;onSaved:()=>void;context?:BinContext;onBrowse?:()=>void};
export function RecentlyDeleted({demo,demoItems,onRestore,onDelete,onSaved,context,onBrowse}:Props) {
 const {t,locale}=useLanguage();
 const names=context??plainContext(t);
 const bin=useBinPage(demo,demoItems);
 const {page,setPage,type,search,narrow,visible,loading,loadError,filtering}=bin;
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [permanent,setPermanent]=useState<DeletedItem|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const panel=useRef<HTMLDivElement>(null);
 const selected=visible.find(item=>item.id===selectedId)??visible[0]??null;
 async function act(item:DeletedItem,discard:boolean){
  setBusy(true);setError('');
  try{
   if(demo){if(discard)onDelete(item);else onRestore(item);if(visible.length===1&&page>1)setPage(n=>n-1);}
   else await requestJson('/api/deleted-items',{method:discard?'DELETE':'POST',body:{id:item.id}});
   setPermanent(null);bin.reread();onSaved();if(discard)showDeleted();else showNotice('Restored');
  }catch(reason){const message=(reason as Error).message;if(discard)setError(message);else showError(message);}
  finally{setBusy(false);}
 }
 const choose=(item:DeletedItem)=>{setSelectedId(item.id);requestAnimationFrame(()=>panel.current?.scrollIntoView?.({block:'nearest'}));};
 const today=depositToday();
 const tabs=<Segmented className="page-tabs" label={t('Recently deleted')} value={type} onChange={value=>narrow({type:value})} options={[{value:null,label:t('All')},...deletedTypes.map(value=>({value,label:t(typeLabels[value])}))]}/>;
 return <><PageHeader title={t('Recently deleted')} tabs={tabs} hint={<>{t('Deleted items stay here until you delete them permanently.')} {t('Items deleted before recovery was enabled cannot be recovered here.')}</>}/>
 <div className="recovery-layout">
 <section className="panel records recovery-panel">
 {(search||type||visible.length>0||loading)&&<div className="recovery-tools"><label className="transactions-search"><Search size={16} aria-hidden="true"/><Input type="search" placeholder={t('Search deleted items')} aria-label={t('Search deleted items')} maxLength={100} value={search} onChange={event=>narrow({search:event.currentTarget.value})}/></label></div>}
 {loadError&&!loading&&<InlineError as="div" message={t(loadError)} onRetry={bin.retry}/>}
 {loading?<RecoveryRowsSkeleton label={t('Loading records…')}/>:!visible.length?<BinEmpty failed={!!loadError} filtering={filtering} onBrowse={onBrowse}/>
  :<div className="recovery-list">{deletedDays(visible).map(({day,items:list})=><DeletedDay key={day} day={day} today={today}>{list.map(item=><DeletedRow key={item.id} item={item} names={names} selected={item.id===selected?.id} busy={busy} onSelect={()=>choose(item)} onRestore={()=>act(item,false)} onDiscard={()=>{setError('');setPermanent(item);}}/>)}</DeletedDay>)}</div>}
 <Pagination label={t('Record pages')} summary={t('Page {page}',{page:formatNumber(page,locale,0)})} page={page} hasNext={bin.hasNext} disabled={loading||busy} onPage={setPage}/>
 </section>
 {selected&&!loading&&<div ref={panel} className="recovery-side"><RestorePanel item={selected} names={names} preview={names.preview(selected)} busy={busy} onRestore={()=>act(selected,false)} onDiscard={()=>{setError('');setPermanent(selected);}}/></div>}
 </div>
 <ConfirmDialog open={!!permanent} onClose={()=>{setPermanent(null);setError('');}} busy={busy} deletes error={error} title={t('Permanently delete {name}?',{name:permanent?deletedName(permanent,t):''})} description={t('This permanently removes the saved item and its recovery data from the database. This cannot be undone.')} confirmLabel={t(busy?'Saving…':'Delete permanently')} onConfirm={async()=>{if(permanent)await act(permanent,true);}}/></>;
}
