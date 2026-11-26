"use client";
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import {FormFooter} from '@/components/presentation-foundation/form-footer';
import {InlineError} from '@/components/presentation-foundation/inline-error';
import { showSaved } from '@/lib/feedback';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import {decimalTotalEquals} from '@/lib/decimal-amounts';
import {useState} from 'react';
import {useOwnerResource} from '@/hooks/use-owner-resource';
import {useLanguage} from '@/components/language-provider';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {DatePicker} from '@/components/presentation-foundation/date-picker';
import {FormattedNumberInput} from '@/components/presentation-foundation/formatted-number-input';
import {useDiscardChanges} from '@/components/discard-changes';
import {formatDate,formatMoney} from '@/lib/format';
import {depositToday} from '@/lib/deposit-interest';
import {shiftDay} from '@/lib/calendar-days';
import type {Entry} from '@/lib/finance';
import {requestJson} from '@/lib/api-client';
import {latestReconciled,openingBalance,statementFigures,statementStatus,type SavedStatement,type StatementChange,type StatementReview,type StatementStatus} from '@/lib/statement-reconciliation';
type Period={from:string;to:string}|null;
const today=()=>depositToday();
const emptyReview=():StatementReview=>({entries:[],fingerprint:'',saved:[],from:today().slice(0,7)+'-01',to:today(),balance_before:0,balance_at_end:0,previous:null,changes:{}});
// Account operations arrive under their internal names.
const operationNames:Record<string,string>={transfer:'Transfer money',repayment:'Record repayment',mortgage:'Record mortgage payment',reconcile:'Reconcile balance'};
const pills:Record<StatementStatus,[string,string]>={reconciled:['status-badge is-paid','Reconciled'],draft:['status-badge','Draft'],changed:['status-badge is-caution','Needs review']};
function StatusPill({status}:{status:StatementStatus}){const {t}=useLanguage();const [className,label]=pills[status];return <span className={className}>{t(label)}</span>;}

export function StatementReconciliation({account,owner,onClose,onSaved}:{account:Entry;owner:string|null;onClose:()=>void;onSaved:()=>void}){
 const {t,locale}=useLanguage();const [empty]=useState(emptyReview),[period,setPeriod]=useState<Period>(null),[selected,setSelected]=useState<SavedStatement|null>(null),[editing,setEditing]=useState(false);
 // Until a date is chosen the database picks the next period: the day after the last reconciled statement, through today.
 const resource=useOwnerResource(`/api/reconciliation?account=${account.id}${period?`&from=${period.from}&to=${period.to}`:''}`,owner,true,0,empty);
 const review=resource.data,from=period?.from??review.from,to=period?.to??review.to,latest=latestReconciled(review.saved);
 const choose=(next:{from:string;to:string})=>{setPeriod(next);setSelected(null);};
 return <Dialog open onOpenChange={open=>{if(!open&&!editing)onClose();}}><DialogContent className="record-dialog" showCloseButton={!editing}><DialogTitle>{t('Statement reconciliation')} · {account.name}<InfoHint>{t('Enter the opening cleared balance immediately before the first day. Match transactions to the bank statement. This review does not change your cash balance.')}</InfoHint></DialogTitle><DialogDescription className="sr-only">{t('Enter the opening cleared balance immediately before the first day. Match transactions to the bank statement. This review does not change your cash balance.')}</DialogDescription>
 {!editing?<><div className="form-grid"><label>{t('First day')}<DatePicker value={from} max={to} onChange={v=>choose({from:v,to})}/></label><label>{t('Statement closing date')}<DatePicker value={to} min={from} max={today()} onChange={v=>choose({from,to:v})}/></label></div>
 {resource.error&&<InlineError message={t(resource.error)} onRetry={resource.retry}/>}
 {resource.loading?<LoadingPlaceholder label={t('Loading records…')} rows={2}/>:!resource.error&&<>
  {latest&&<p role="status" className="statement-status"><StatusPill status={statementStatus(latest,review.changes)}/>{t('Reconciled through {date}',{date:formatDate(latest.end_date,locale)})}</p>}
  <Button onClick={()=>setEditing(true)}>{t(selected?'Review statement':'Start statement review')}</Button>
  <h3>{t('Saved statements')}</h3><ul className="tool-list">{review.saved.map(s=><li key={s.id}><span>{formatDate(s.start_date,locale)} — {formatDate(s.end_date,locale)}</span><StatusPill status={statementStatus(s,review.changes)}/><Button variant="outline" onClick={()=>{setPeriod({from:s.start_date,to:s.end_date});setSelected(s);}}>{t('Open')}</Button></li>)}</ul></>}
 <Button variant="outline" onClick={onClose}>{t('Close')}</Button></>:<StatementForm key={selected?.id??'new'} initial={selected} account={account} from={from} to={to} review={review} onClose={()=>setEditing(false)} onSaved={()=>{resource.invalidate();setEditing(false);setSelected(null);setPeriod(null);onSaved();}}/>}
 </DialogContent></Dialog>;
}

/** Reconciled entries edited, deleted or dated after the statement since it was reconciled. */
function ChangedEntries({changes,end,currency}:{changes:StatementChange[];end:string;currency:string}){
 const {t,locale}=useLanguage(),money=(value:number)=>formatMoney(Number(value),currency,locale);
 return <section aria-labelledby="statement-changes"><h3 id="statement-changes">{t('Changed since this statement was reconciled')}</h3><ul className="tool-list">{changes.map(c=><li key={c.key}>
  <span>{formatDate(c.was_date,locale)} · {t(operationNames[c.name]??c.name)}</span>
  {c.now_amount===null||c.now_date===null?<span>{t('Removed from this account')}</span>:c.now_date>end?<span>{t('Now dated {date}',{date:formatDate(c.now_date,locale)})}</span>:<span>{money(c.now_amount)} <small className="muted">{t('Was {amount}',{amount:money(c.was_amount)})}</small></span>}
 </li>)}</ul></section>;
}

/** The cleared balance against the statement, and why the app balance on the closing day differs from it. */
function StatementTotals({figures,appBalance,to,currency}:{figures:ReturnType<typeof statementFigures>;appBalance:number;to:string;currency:string}){
 const {t,locale}=useLanguage(),money=(value:number)=>formatMoney(value,currency,locale);
 return <dl className="statement-totals">
  <div><dt>{t('Cleared balance')}</dt><dd><strong>{money(figures.clearedBalance)}</strong></dd></div>
  <div><dt>{t('Difference')}</dt><dd><strong>{money(figures.difference)}</strong></dd></div>
  <div><dt>{t('App balance on {date}',{date:formatDate(to,locale)})}</dt><dd>{money(appBalance)}</dd></div>
  <div><dt>{t('Pending entries')}</dt><dd>{money(figures.pending)}</dd></div>
  <div><dt>{t('Balance changes without an entry')}</dt><dd>{money(figures.withoutEntry)}</dd></div>
 </dl>;
}

function newStatement(account:Entry,from:string,to:string,review:StatementReview):SavedStatement{
 return {id:crypto.randomUUID(),account_id:account.id,start_date:from,end_date:to,opening_balance:openingBalance({previous:review.previous,from})??0,closing_balance:0,cleared:[],fingerprint:review.fingerprint,status:'draft',revision:null};
}

function StatementForm({initial,account,from,to,review,onClose,onSaved}:{initial:SavedStatement|null;account:Entry;from:string;to:string;review:StatementReview;onClose:()=>void;onSaved:()=>void}){
 const {t,locale}=useLanguage(),currency=account.currency;
 const [draft,setDraft]=useState<SavedStatement>(()=>initial?{...initial,opening_balance:Number(initial.opening_balance),closing_balance:Number(initial.closing_balance),cleared:initial.cleared.filter(k=>review.entries.some(e=>e.key===k)),fingerprint:review.fingerprint}:newStatement(account,from,to,review));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const [opened]=useState(()=>JSON.stringify(draft));const guard=useDiscardChanges(JSON.stringify(draft)!==opened,onClose,busy);
 const figures=statementFigures(review.entries,draft.cleared,draft.opening_balance,draft.closing_balance,Number(review.balance_at_end));
 const cleared=review.entries.filter(e=>draft.cleared.includes(e.key)).map(e=>Number(e.amount)),carried=!initial&&openingBalance({previous:review.previous,from})!==null;
 const changes=initial?review.changes[initial.id]??[]:[];
 async function save(status:SavedStatement['status']){if(busy)return;setBusy(true);setError('');try{await requestJson('/api/reconciliation',{body:{...draft,status}});showSaved();onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><fieldset className="record-form" disabled={busy}>
 {initial&&<p role="status"><StatusPill status={statementStatus(initial,review.changes)}/></p>}
 {changes.length>0&&<ChangedEntries changes={changes} end={initial?.end_date??to} currency={currency}/>}
 <div className="form-grid"><label>{t('Opening cleared balance')}<FormattedNumberInput value={draft.opening_balance} onValueChange={n=>setDraft({...draft,opening_balance:n})}/>
  <small className="muted">{carried&&review.previous?t('From the statement reconciled through {date}',{date:formatDate(review.previous.end_date,locale)}):`${t('App balance on {date}',{date:formatDate(shiftDay(from,-1),locale)})}: ${formatMoney(Number(review.balance_before),currency,locale)}`}</small></label>
  <label>{t('Statement closing balance')}<FormattedNumberInput value={draft.closing_balance} onValueChange={n=>setDraft({...draft,closing_balance:n})}/></label></div>
 <p className="muted">{t('Unchecked entries remain pending. Direct balance corrections may not have a transaction leg; review unexplained differences instead of forcing a match.')}</p>
 <div className="table-scroll daily-ledger"><table><thead><tr><th>{t('Cleared')}</th><th>{t('Date')}</th><th>{t('Name')}</th><th>{t('Amount')}</th></tr></thead><tbody>{review.entries.map(e=><tr key={e.key}><td><input type="checkbox" aria-label={`${t('Cleared')}: ${e.name}`} checked={draft.cleared.includes(e.key)} onChange={event=>setDraft({...draft,cleared:event.target.checked?[...draft.cleared,e.key]:draft.cleared.filter(k=>k!==e.key)})}/></td><td>{formatDate(e.date,locale)}{e.date<from&&<small className="block">{t('Pending from an earlier statement')}</small>}</td><td>{t(operationNames[e.name]??e.name)}</td><td>{formatMoney(Number(e.amount),currency,locale)}</td></tr>)}</tbody></table></div>
 <StatementTotals figures={figures} appBalance={Number(review.balance_at_end)} to={to} currency={currency}/>
 {figures.difference!==0&&Math.abs(figures.difference)<1&&<p>{t('A fractional difference remains. Check the precise statement amounts.')}</p>}
 <p className="muted">{t('Editing or deleting a reconciled entry, or dating it after the statement, reopens the statement.')}</p>
 </fieldset><ErrorPopup message={error}/><FormFooter busy={busy} onCancel={guard.close}><Button variant="outline" disabled={busy} onClick={()=>void save('draft')}>{t('Save draft')}</Button><Button disabled={busy||!decimalTotalEquals([draft.opening_balance,...cleared],draft.closing_balance)} onClick={()=>void save('reconciled')}>{t('Reconcile statement')}</Button></FormFooter>{guard.confirmation}</>;
}
