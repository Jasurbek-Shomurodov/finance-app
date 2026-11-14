"use client";
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { AnimatedMoney } from '@/components/presentation-foundation/animated-money';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { useDisplayMoney } from '@/components/display-money';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { holdingAccountLabel, holdingAccountValue, type HoldingAccount } from '@/lib/holding-accounts';
import type { Entry } from '@/lib/finance';
import { isHolding } from '@/lib/asset-movements';
import { allocatedToGoals } from '@/lib/account-directory';
import type { PlanningData } from '@/lib/planning';
import type { MovementDraft } from '../asset-movement-dialog';
import type { Operation } from '../account-operation';
import { AccountMenu } from './account-menu';
import { HoldingRows, type HoldingActions } from './holding-rows';
import { AccountStoryView, type StoryState } from './account-story';

/** What can open from a cash account's or deposit's card. */
export type BalanceCardActions = {
 onEdit: (record: Entry) => void; onTrack?: (record: Entry) => void; onDelete: (record: Entry) => void;
 onMove: (draft: MovementDraft) => void; onOperation: (operation: Operation) => void;
 /** Reconciling a statement needs a signed-in owner; without one the button explains why it is unavailable. */
 onStatement?: (account: Entry) => void;
};

/** A cash account's goal allocations, or a deposit's interest and maturity: the rows of its facts list. */
function BalanceFacts({ account, goals, tracked }: { account: Entry; goals: PlanningData['goals']; /** Deposits are managed in the Tracker, which estimates their interest. */ tracked: boolean }) {
 const { t, locale } = useLanguage();
 const { show } = useDisplayMoney();
 if (account.kind!=='Cash') return <>
  <div><dt>{t('Annual interest')}</dt><dd>{formatPercent(account.rate,locale,2)}</dd></div>
  {tracked&&<div><dt>{t('Estimated monthly interest')}</dt><dd>{account.estimated_monthly_income==null?'—':formatMoney(account.estimated_monthly_income,account.currency,locale)}</dd></div>}
  <div><dt>{t('Due / maturity date')}</dt><dd>{formatDate(account.date,locale)}</dd></div>
 </>;
 const allocated=allocatedToGoals(goals,account.id);
 return <><div><dt>{t('Allocated to goals')}</dt><dd><RollingText text={show(allocated,account.currency)}/></dd></div><div><dt>{t('Available')}</dt><dd><RollingText text={show(account.amount-allocated,account.currency)}/></dd></div></>;
}

/** The selected cash account or deposit, told as the directory row cannot: its balance over six months, what it holds
 * for goals, this month's money in and out and its latest activity, with its actions at the foot. */
export function BalanceAccountCard({ account, goals, story, onEdit, onTrack, onDelete, onMove, onOperation, onStatement }: BalanceCardActions & { account: Entry; goals: PlanningData['goals']; story: StoryState }) {
 const { t } = useLanguage();
 // A balance is a display-currency figure, like the directory beside it; one no rate converts reads — with the note.
 const { show } = useDisplayMoney();
 const balance=show(account.amount,account.currency);
 const deposit=account.kind==='Deposit';
 return <article className="panel account-card">
  <header><CategoryIcon kind={account.kind}/><h2>{account.name}</h2><Button variant="ghost" size="icon" className="account-card-menu" aria-label={t('Edit {name}',{name:account.name})} onClick={()=>onEdit(account)}><Pencil size={17} aria-hidden="true"/></Button><AccountMenu name={account.name}>{deposit&&<DropdownMenuItem onSelect={()=>onMove({kind:'interest',source_id:account.id})}>{t('Record capitalized interest')}</DropdownMenuItem>}{deposit&&onTrack&&<DropdownMenuItem onSelect={()=>onTrack(account)}>{t('Manage deposit')}</DropdownMenuItem>}<DropdownMenuItem variant="destructive" onSelect={()=>onDelete(account)}><Trash2 aria-hidden="true"/>{t('Delete')}</DropdownMenuItem></AccountMenu></header>
  <div className="account-card-balance"><span>{t('Balance')}</span><strong className="account-card-value"><RollingText text={balance}/></strong></div>
  {balance==='—'&&<p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
  <AccountStoryView account={account} state={story}><BalanceFacts account={account} goals={goals} tracked={!!onTrack}/></AccountStoryView>
  <div className="account-card-actions">{!deposit&&<Button variant="outline" aria-disabled={!onStatement||undefined} title={onStatement?undefined:t('Available after you sign in.')} onClick={()=>onStatement?.(account)}>{t('Reconcile statement')}</Button>}{deposit?<><Button variant="outline" onClick={()=>onMove({kind:'transfer',target_id:account.id})}><Plus size={16} aria-hidden="true" />{t('Top-up')}</Button><Button variant="outline" onClick={()=>onMove({kind:'transfer',source_id:account.id})}>{t('Withdraw')}</Button></>:<Button variant="outline" onClick={()=>onOperation({action:'reconcile',account_id:account.id,amount:account.amount})}>{t('Adjust balance')}</Button>}</div>
 </article>;
}

/** The selected investment account: its value, holdings count and a dialog listing the holdings. */
export function InvestmentAccountCard({ account, records, onEditAccount, onAdd, holdingActions }: { account: HoldingAccount; records: Entry[]; onEditAccount: (account: HoldingAccount) => void; onAdd: (kind: HoldingAccount['kind'], accountId: string) => void; holdingActions: HoldingActions }) {
 const { t, locale } = useLanguage();
 const display=useDisplayMoney();
 const {holdings,total}=holdingAccountValue(account,records,holdingActions.market);
 // A balance is a display-currency figure, like the directory beside it.
 const shown=total===null?null:display.convert(total,account.currency);
 return <article className="panel account-card">
  <header><CategoryIcon kind={account.kind}/><h2>{account.name}</h2><Button variant="ghost" size="icon" className="account-card-menu" aria-label={t('Edit {name}',{name:account.name})} onClick={()=>onEditAccount(account)}><Pencil size={17} aria-hidden="true"/></Button><AccountMenu name={account.name}><DropdownMenuItem onSelect={()=>onAdd('Cash',account.id)}>{t('Add cash balance')}</DropdownMenuItem></AccountMenu></header>
  <div className="account-card-balance"><span>{t(holdingAccountLabel(account.kind))}</span><strong className="account-card-value">{shown===null?'—':<AnimatedMoney value={shown} currency={display.currency??account.currency}/>}</strong></div><p className="muted">{t('{count} holdings',{count:formatNumber(holdings.filter(isHolding).length,locale,0)})} · {account.currency}</p>
  {shown===null&&<p className="muted">{t('Exchange rates are missing. The account total is unavailable.')}</p>}
  <div className="account-card-actions"><Button onClick={()=>onAdd(account.kind,account.id)}><Plus size={16} aria-hidden="true" />{t(account.kind==='Cash'?'Add cash balance':'Add holding')}</Button></div>
  {holdings.length>0&&<Dialog><DialogTrigger asChild><Button variant="ghost" className="account-details-trigger">{t('Holdings')}</Button></DialogTrigger><DialogContent className="record-dialog" aria-describedby={undefined}><DialogTitle>{account.name} · {t('Holdings')}</DialogTitle><HoldingRows records={holdings} {...holdingActions}/></DialogContent></Dialog>}
 </article>;
}
