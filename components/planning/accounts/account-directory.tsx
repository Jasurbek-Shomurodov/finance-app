"use client";
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { Count } from '@/components/presentation-foundation/count';
import { SortableItem, SortableList } from '@/components/presentation-foundation/sortable';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatNumber, formatSignedMoney } from '@/lib/format';
import { useDisplayMoney } from '@/components/display-money';
import { allocatedToGoals, currencyTotals, directoryGroups, type DirectoryItem } from '@/lib/account-directory';
import type { Entry } from '@/lib/finance';
import type { PlanningData } from '@/lib/planning';

/** The person's own order of the accounts within a group (`useDisplayOrder`). */
type Order = { reorder: (moved: string, over: string, ids: string[]) => Promise<void> | void; disabled: boolean };

/** A directory row's marks: the business it belongs to, named beside the account in the business's colour, and who owns it. */
export type RowDetails = { business: (item: DirectoryItem) => { name: string; color: string } | null; owner: (item: DirectoryItem) => ReactNode };

/** Between the parts of a row, for a screen reader: the name, the business and the figures are read apart. */
const pause = <span className="sr-only">, </span>;

/** What a row says under the account's name: facts the group heading does not already give. An investment account's
 * holdings; a balance's interest, maturity, what its goals hold, and its own amount when it is shown converted. */
function useRowFacts(item: DirectoryItem, goals: PlanningData['goals']) {
 const { t, locale } = useLanguage();
 const { show, entered, convert, currency } = useDisplayMoney();
 if (item.count !== null) return [t('{count} holdings', { count: formatNumber(item.count, locale, 0) })];
 // Without a holdings count the row is a cash account or a deposit: a record with a rate and a date.
 const account = item.account as Entry, facts: string[] = [], held = allocatedToGoals(goals, item.id);
 if (Number(account.rate) > 0) facts.push(t('{rate}% annual interest', { rate: formatNumber(account.rate, locale) }));
 if (item.group === 'deposits' && account.date) facts.push(t('Matures {date}', { date: formatDate(account.date, locale) }));
 if (held > 0) facts.push(t('{amount} in goals', { amount: show(held, account.currency) }));
 // Shown converted, a balance also reads as it is held; without a rate the row says only that it has none.
 if (currency && currency !== account.currency && item.total !== null && convert(item.total, account.currency) !== null) facts.push(entered(item.total, account.currency));
 return facts;
}

function DirectoryRow({ item, active, details, goals, change, onSelect }: { item: DirectoryItem; active: boolean; details: RowDetails; goals: PlanningData['goals']; /** How the balance moved this month, in the display currency; undefined while that is not known. */ change?: number; onSelect: () => void }) {
 const { t, locale } = useLanguage();
 const { show, currency } = useDisplayMoney();
 const business = details.business(item), owner = details.owner(item), facts = useRowFacts(item, goals);
 const moved = change !== undefined && Math.abs(change) >= .5;
 return <button type="button" className="account-list-row" aria-pressed={active} onClick={onSelect}>
  <CategoryIcon kind={item.account.kind}/>
  <span className="account-list-name">
   <span className="account-list-heading"><span className="account-list-title">{item.account.name}</span>{business && <>{pause}<span className="account-business"><i style={{ background: business.color }} aria-hidden="true"/>{business.name}</span></>}{owner && <>{pause}{owner}</>}</span>
   {facts.length > 0 && <>{pause}<small>{facts.join(' · ')}</small></>}
  </span>
  {pause}
  <span className="account-list-amount"><strong>{item.total === null ? '—' : show(item.total, item.account.currency)}</strong>{moved && <>{pause}<small data-tone={change > 0 ? 'positive' : undefined}>{t('{amount} this month', { amount: formatSignedMoney(change, currency ?? item.account.currency, locale) })}</small></>}</span>
 </button>;
}

/** The Accounts directory: one card of Cash, Deposits and Investments as collapsible groups, each with its total in the
 * display currency and its accounts as rows in the order the person drags them into. */
export function AccountDirectory({ visible, activeKey, onSelect, order, details, goals, changes }: { visible: DirectoryItem[]; activeKey?: string; onSelect: (key: string) => void; order: Order; details: RowDetails; goals: PlanningData['goals']; /** Each account's change this month by id; null while it cannot be told. */ changes: Map<string, number> | null }) {
 const { t } = useLanguage();
 const { showSum } = useDisplayMoney();
 return <section className="panel account-directory" aria-label={t('Accounts')}>
  {directoryGroups.map(([group,label])=>{
   const items=visible.filter(item=>item.group===group), ids=items.map(item=>item.id);
   if(!items.length)return null;
   // Balances in every currency are added in the display currency; a balance that cannot be converted leaves the total out.
   const totals=currencyTotals(items);
   const total=totals.every(item=>item.total!==null)?showSum(totals.map(item=>({amount:item.total!,currency:item.currency}))):null;
   return <details className="account-group" key={group} open>
    <summary><ChevronDown size={18} aria-hidden="true"/><h2>{t(label)}</h2><Count value={items.length}/><strong>{total===null||total==='—'?'—':<RollingText text={total}/>}</strong></summary>
    {(total===null||total==='—')&&<p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
    <SortableList id={`accounts-${group}`} items={ids} nameOf={id=>items.find(item=>item.id===id)?.account.name??''} onMove={(moved,over)=>void order.reorder(moved,over,ids)} disabled={order.disabled}>
     <div className="account-rows">{items.map(item=><SortableItem key={item.key} id={item.id} label={item.account.name} className="account-sortable-row"><DirectoryRow item={item} active={activeKey===item.key} details={details} goals={goals} change={changes?(changes.get(item.id)??0):undefined} onSelect={()=>onSelect(item.key)}/></SortableItem>)}</div>
    </SortableList>
   </details>;
  })}
  {!visible.length&&<p className="account-search-empty muted">{t('No accounts match your search.')}</p>}
 </section>;
}
