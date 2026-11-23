"use client";
import { ChevronDown } from 'lucide-react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Count } from '@/components/presentation-foundation/count';
import { RowMenu } from '@/components/presentation-foundation/row-menu';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import type { Entry } from '@/lib/finance';
import { formatDate } from '@/lib/format';
import { holdingAccountLabel, type HoldingAccount } from '@/lib/holding-accounts';

type Props = {
 /** Closed accounts and holdings, the latest closing first. */
 records: readonly Entry[];
 /** Closed investment accounts. */
 accounts?: readonly HoldingAccount[];
 onReopen: (record: Entry) => void; onReopenAccount?: (account: HoldingAccount) => void;
 /** Deleting a closed record goes through the same confirmation as an open one. */
 onDelete?: (record: Entry) => void; onDeleteAccount?: (account: HoldingAccount) => void;
};

/** One closed account, holding or investment account: what it is, the day it closed, and Reopen. */
function ClosedRow({ item, label, onReopen, onDelete }: { item: Pick<Entry, 'kind' | 'name' | 'closed_on'>; label: string; onReopen: () => void; onDelete?: () => void }) {
 const { t, locale } = useLanguage();
 return <li className="closed-row">
  <CategoryIcon kind={item.kind}/>
  <div className="closed-row-name"><strong>{item.name}</strong><span>{label}</span></div>
  <span className="closed-row-day">{t('Closed on {date}', { date: formatDate(item.closed_on ?? '', locale) })}</span>
  <div className="row-actions"><Button size="sm" variant="outline" onClick={onReopen}>{t('Reopen')}</Button><RowMenu label={t('Actions for {name}', { name: item.name })} items={[onDelete && { label: t('Delete'), deletes: true, onSelect: onDelete }]}/></div>
 </li>;
}

/** What was closed, folded away at the foot of Accounts and Investments: each row says what it is and the day it
 * closed, and Reopen brings it back to the lists and pickers. Nothing is rendered while nothing is closed. */
export function ClosedFold({ records, accounts = [], onReopen, onReopenAccount, onDelete, onDeleteAccount }: Props) {
 const { t } = useLanguage();
 const count = records.length + accounts.length;
 if (!count) return null;
 return <section className="panel account-directory closed-fold" aria-label={t('Closed')}>
  <details className="account-group">
   <summary><ChevronDown size={18} aria-hidden="true"/><h2>{t('Closed')}</h2><Count value={count}/></summary>
   <ul className="closed-rows">
    {accounts.map(account => <ClosedRow key={'account:' + account.id} item={account} label={t(holdingAccountLabel(account.kind))} onReopen={() => onReopenAccount?.(account)} onDelete={onDeleteAccount && (() => onDeleteAccount(account))}/>)}
    {records.map(record => <ClosedRow key={record.id} item={record} label={t(record.kind)} onReopen={() => onReopen(record)} onDelete={onDelete && (() => onDelete(record))}/>)}
   </ul>
  </details>
 </section>;
}
