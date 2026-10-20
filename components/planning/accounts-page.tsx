"use client";
import { depositToday } from '@/lib/deposit-interest';
import type { DrillTarget } from '@/lib/cash-flow-drill-types';
import { StatementReconciliation } from './statement-reconciliation';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { CorporateEventDialog } from './corporate-event-dialog';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { useState } from 'react';
import { ArrowRightLeft, Briefcase, Plus, Users } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import type { HoldingAccount } from '@/lib/holding-accounts';
import type { Entry } from '@/lib/finance';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { AccountBusinessesDialog } from '@/components/account-businesses-dialog';
import { AccountOwnersDialog } from '@/components/account-owners-dialog';
import type { HouseholdState } from '@/lib/household';
import type { MarketData } from '@/lib/market';
import { AssetMovementDialog, type MovementDraft } from './asset-movement-dialog';
import { AccountOperation, type Operation } from './account-operation';
import { HoldingAccountDialog } from './holding-account-dialog';
import type { PlanningData } from '@/lib/planning';
import { useDisplayOrder } from '@/hooks/use-display-order';
import type { PreferenceResource } from '@/hooks/use-workspace-preferences';
import { accountHasLinks, linkedAccountMessage } from '@/lib/account-deletion';
import { showError } from '@/lib/feedback';
import { directoryItems } from '@/lib/account-directory';
import { useAccountFilters } from './accounts/use-account-filters';
import type { HoldingActions } from './accounts/holding-rows';
import { AccountActivity } from './accounts/account-activity';
import { AddAccountDialog, type AccountType } from './accounts/add-account-dialog';
import { AccountsOverview, selectedItem } from './accounts/accounts-overview';
import { lastTransferTarget, movementSources } from '@/lib/asset-movements';

type Props = {
 owner:string|null; onSaved:()=>void;
 /** Bumped after every confirmed change, so views that read on their own read again. */
 revision?:number;
 data: PlanningData; save: (action: string, data: unknown) => Promise<void>;
 onAdd: (kind: 'Cash'|'Deposit'|'Stock'|'Crypto', accountId?: string) => void;
 onEdit: (record: Entry) => void; onTrack?: (record: Entry) => void; onDelete: (record: Entry) => void;
 demo: boolean; preferences: PreferenceResource;
 market: MarketData|null; currencies: string[]; currency: string;
 saveAccount: (account: HoldingAccount) => Promise<void>;
 assignHolding: (record: Entry, accountId: string|null) => Promise<void>;
 businesses: readonly BusinessOption[];
 onAccountBusiness: (accountId: string, business: string|null) => Promise<number>;
 /** The open household, when it is shared: accounts then show and filter by their owner. */
 household?: HouseholdState|null; readOnly?: boolean;
 onAccountOwner: (accountId: string, owner: string) => Promise<number>;
 /** Opens a Sankey over the page (the workspace's): an account's, a holding's, or an investment account's holdings'. */
 onSankey?: (request: { target: DrillTarget; title: string; month: string; onDetails?: () => void }) => void;
};

export function AccountsPage({ owner,onSaved,revision=0,data, save, onAdd, onEdit, onTrack, onDelete, demo, preferences, market, currencies, currency, saveAccount, assignHolding, businesses, onAccountBusiness, household, readOnly, onAccountOwner, onSankey }: Props) {
 const { t } = useLanguage();
 const [statement,setStatement]=useState<Entry|null>(null),[corporate,setCorporate]=useState<Entry|null>(null);
 // The page's two views, switched from the top bar: the accounts themselves and their recent operations.
 const [view,setView]=useState<'accounts'|'activity'>('accounts');
 const [movement,setMovement]=useState<MovementDraft|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [operation, setOperation] = useState<Operation|null>(null), [choosing, setChoosing] = useState(false), [draft, setDraft] = useState<HoldingAccount|null>(null);
 const [editingBusinesses,setEditingBusinesses]=useState(false),[editingOwners,setEditingOwners]=useState(false);
 const investmentAccounts = data.holdingAccounts??[];
 // Accounts keep the order the person drags them into within their group.
 const order=useDisplayOrder('account_order',directoryItems(data,market),preferences,owner,demo);
 const accountItems=order.items;
 const remove=(account:Entry)=>{if(accountHasLinks(account.id,data))showError(linkedAccountMessage);else onDelete(account);};
 const filters=useAccountFilters({items:accountItems,records:data.records,businesses,household});
 // An account, a holding or another asset opens its Sankey for this month, its Details editing it; picking an account in
 // the directory also selects it, so its card is there when the Sankey closes. An investment account opens its holdings.
 const month=depositToday().slice(0,7);
 const openRecord=onSankey&&((record:Entry)=>onSankey({target:{side:'account',key:record.id},title:record.name,month,onDetails:()=>onEdit(record)}));
 const select=(key:string)=>{
  setSelected(key);
  const item=order.items.find(entry=>entry.key===key);
  if(!item||!onSankey)return;
  if(key.startsWith('investment:'))onSankey({target:{side:'holdings',keys:data.records.filter(record=>record.holding_account_id===item.id).map(record=>record.id)},title:item.account.name,month});
  else openRecord?.(item.account as Entry);
 };
 const holdingActions:HoldingActions={accounts:investmentAccounts,market,onEdit,onTrack,assignHolding,onMove:setMovement,onCorporate:setCorporate,onOpen:openRecord};
 const choose=(kind:AccountType)=>{if(kind==='Cash'||kind==='Deposit')onAdd(kind);else setDraft({id:crypto.randomUUID(),kind:kind==='CashInvestment'?'Cash':kind,name:'',currency});};
 const owners=filters.owners;
 // Transfer money starts from the account shown beside the directory, when money can leave it, to where it last sent money.
 const shown=selectedItem(filters.visible,selected)?.key;
 const transferFrom=movementSources('transfer',data.records).find(record=>shown===`record:${record.id}`)?.id;
 return <>
  <PageHeader title={t('Accounts')} tabs={<Segmented className="page-tabs" as="nav" label={t('Accounts')} options={[{value:'accounts',label:t('Overview')},{value:'activity',label:t('Recent activity')}]} value={view} onChange={setView}/>}>{owners.length>0&&<Button variant="outline" disabled={readOnly} onClick={()=>setEditingOwners(true)}><Users size={17} aria-hidden="true"/>{t('Edit owners')}</Button>}{businesses.length>0&&<Button variant="outline" onClick={()=>setEditingBusinesses(true)}><Briefcase size={17} aria-hidden="true"/>{t('Edit businesses')}</Button>}<Button variant="outline" onClick={()=>setMovement({kind:'transfer',source_id:transferFrom,target_id:lastTransferTarget(data.movements??[],transferFrom,data.records)})}><ArrowRightLeft size={17} aria-hidden="true"/>{t('Transfer money')}</Button><Button onClick={()=>setChoosing(true)}><Plus size={17} aria-hidden="true" />{t('Add account')}</Button></PageHeader>
  {view==='accounts'&&<AccountsOverview items={accountItems} data={data} filters={filters} order={order} businesses={businesses} holdingActions={holdingActions} onEditAccount={setDraft} onAdd={onAdd} onAddAccount={()=>setChoosing(true)} selected={selected} onSelect={select}
   cardActions={{onEdit,onTrack,onDelete:remove,onMove:setMovement,onOperation:setOperation,onStatement:owner?setStatement:undefined}}/>}
  {/* Account operations are their own view, opened from the top bar. */}
  {view==='activity'&&<AccountActivity data={data} owner={owner} live={!!owner&&!demo} revision={revision} currency={currencies[0]}/>}
  <AddAccountDialog open={choosing} onOpenChange={setChoosing} onChoose={choose}/>
  <ErrorPopup message={order.error}/>
  {editingOwners&&household&&<AccountOwnersDialog records={data.records} accounts={investmentAccounts} market={market} household={household} owners={owners} onChange={onAccountOwner} onClose={()=>setEditingOwners(false)}/>}
  {editingBusinesses&&<AccountBusinessesDialog records={data.records} businesses={businesses} onChange={onAccountBusiness} onClose={()=>setEditingBusinesses(false)}/>}
  {statement&&<StatementReconciliation account={statement} owner={owner} onClose={()=>setStatement(null)} onSaved={onSaved}/>}
  {corporate&&<CorporateEventDialog record={corporate} records={data.records} accounts={investmentAccounts} owner={owner} onClose={()=>setCorporate(null)} onSaved={onSaved}/>}
  {draft&&<HoldingAccountDialog currencies={currencies} account={draft} existing={investmentAccounts.some(account=>account.id===draft.id)} save={saveAccount} onClose={()=>setDraft(null)}/>}
  {movement&&<AssetMovementDialog initial={movement} records={data.records} accounts={investmentAccounts} save={payload=>save('movement',payload)} onClose={()=>setMovement(null)}/>}
  {operation&&<AccountOperation operation={operation} records={data.records} save={save} onClose={()=>setOperation(null)}/>}
 </>;
}
