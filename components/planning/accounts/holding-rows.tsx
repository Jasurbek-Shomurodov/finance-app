"use client";
import { useState } from 'react';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { useLanguage } from '@/components/language-provider';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { NativeSelect } from '@/components/ui/native-select';
import { useDisplayMoney } from '@/components/display-money';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { value, type Entry } from '@/lib/finance';
import { marketEntry, type MarketData } from '@/lib/market';
import { holdingQuantity, isHolding } from '@/lib/asset-movements';
import { corporateKinds } from '@/lib/corporate-events';
import type { MovementDraft } from '../asset-movement-dialog';
import { AccountMenu } from './account-menu';
import { openProps } from '@/lib/row-open';
import { pnlOf, type InvestmentPnl } from '@/lib/investment-pnl';
import { pnlText } from '@/components/investment-pnl/pnl-figure';
import { signTone } from '@/components/presentation-foundation/tone';

/** What a holding row can do: move it between investment accounts, buy, sell, record events, track or edit it. */
export type HoldingActions = {
 accounts: HoldingAccount[]; market: MarketData|null;
 /** What each holding earned since tracking began, in `pnlCurrency`; null while it loads. */ pnl?: InvestmentPnl|null; pnlCurrency?: string;
 onEdit: (record: Entry) => void; onTrack?: (record: Entry) => void;
 assignHolding: (record: Entry, accountId: string|null) => Promise<void>;
 onMove: (draft: MovementDraft) => void; onCorporate: (record: Entry) => void;
 /** Opens the holding's details; never from its account picker or actions. */ onOpen?: (record: Entry) => void;
};

function HoldingRow({ record, accounts, market, pnl = null, pnlCurrency, onEdit, onTrack, assignHolding, onMove, onCorporate, onOpen }: HoldingActions & { record: Entry }) {
 const { t, locale } = useLanguage();
 const { show } = useDisplayMoney();
 const earned = pnlOf(pnl, [record.id]);
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 const priced = marketEntry(record, record.currency, market) ?? record;
 async function assign(accountId: string|null) {
  setBusy(true);setError('');
  try{await assignHolding(record,accountId);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
 }
 return <li className="account-holding-row" {...openProps(onOpen && (() => onOpen(record)), t('Open {name}', { name: record.name }))}><CategoryIcon kind={record.kind}/><div><strong>{record.name}</strong><p className="muted">{isHolding(record)?<>{holdingQuantity(t, record, record.quantity, locale)} · {show(priced.amount, record.currency, true)} {t('per unit')}</>:t('Available cash')}</p>{earned && pnlCurrency && <p className={'account-holding-pnl ' + (signTone(earned.total) ?? '')}><span className="sr-only">{t('Profit & loss')}: </span>{pnlText(earned, pnlCurrency, locale)}</p>}</div><strong className="account-holding-value">{show(value(priced), record.currency)}</strong>
  <div className="account-holding-actions"><label><span className="sr-only">{t('Investment account')}</span><NativeSelect value={record.holding_account_id??''} disabled={busy} onChange={event=>void assign(event.target.value||null)}><option value="">{t('No investment account')}</option>{accounts.filter(account=>record.kind==='Cash'||account.kind===record.kind).map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</NativeSelect></label><AccountMenu name={record.name}>{isHolding(record)&&<><DropdownMenuItem onSelect={()=>onMove({kind:'buy',target_id:record.id})}>{t('Buy')}</DropdownMenuItem><DropdownMenuItem onSelect={()=>onMove({kind:'sell',source_id:record.id})}>{t('Sell / convert')}</DropdownMenuItem>{corporateKinds.includes(record.kind)&&<DropdownMenuItem onSelect={()=>onCorporate(record)}>{t('Investment events')}</DropdownMenuItem>}</>}{onTrack&&<DropdownMenuItem onSelect={()=>onTrack(record)}>{t('Tracker')}</DropdownMenuItem>}<DropdownMenuItem onSelect={()=>onEdit(record)}>{t('Edit')}</DropdownMenuItem></AccountMenu></div>
  <ErrorPopup message={error}/>
 </li>;
}

/** Holdings as rows, each with its investment account and its actions. */
export function HoldingRows({ records, ...actions }: HoldingActions & { records: Entry[] }) {
 return <ul className="account-holdings">{records.map(record=><HoldingRow key={record.id} record={record} {...actions}/>)}</ul>;
}
