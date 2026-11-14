"use client";
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Plus, Search, Wallet } from 'lucide-react';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { AnimatedMoney } from '@/components/presentation-foundation/animated-money';
import { BusinessFilter, type BusinessOption } from '@/components/presentation-foundation/business-filter';
import { OwnerFilter } from '@/components/presentation-foundation/owner-filter';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { useCategoryHue } from '@/components/category-icons-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney, formatNumber } from '@/lib/format';
import { monthChanges } from '@/lib/account-story';
import type { HoldingAccount } from '@/lib/holding-accounts';
import type { PlanningData } from '@/lib/planning';
import { accountMix, balanceAccounts, currencyTotals, unassignedHoldings, type DirectoryItem, type MixSegment } from '@/lib/account-directory';
import { AccountDirectory } from './account-directory';
import { BalanceAccountCard, InvestmentAccountCard, type BalanceCardActions } from './account-cards';
import { HoldingRows, type HoldingActions } from './holding-rows';
import { BusinessHoldings } from './business-holdings';
import type { useAccountFilters } from './use-account-filters';
import type { StoryState } from './account-story';

/** The account shown beside the directory: the one picked, else the first one listed. */
export const selectedItem=(visible:DirectoryItem[],selected:string|null)=>visible.find(item=>item.key===selected)??visible[0];

/** How a part of the mix is named: the group's own heading for cash and deposits, the kind for investment accounts. */
const mixLabels: Record<MixSegment['kind'], string> = { Cash: 'Cash', Deposit: 'Deposits', Stock: 'Stock', Crypto: 'Crypto', 'Cash investment account': 'Cash investment account' };

/** What the listed accounts hold by type, as one bar and its legend, ending with the cash no savings goal holds. */
function AccountsMix({ visible, goals, currency }: { visible: DirectoryItem[]; goals: PlanningData['goals']; currency: string }) {
 const { t, locale } = useLanguage();
 const display = useDisplayMoney(), hue = useCategoryHue();
 const mix = accountMix(visible, goals, display.convert);
 if (!mix?.segments.length) return null;
 const tint = (kind: string) => ({ '--category-hue': hue(kind) }) as CSSProperties;
 return <section className="panel accounts-mix">
  <div className="accounts-mix-bar" aria-hidden="true">{mix.segments.map(part => <i key={part.kind} style={{ ...tint(part.kind), flexGrow: part.amount }}/>)}</div>
  <ul>{mix.segments.map(part => <li key={part.kind}><i style={tint(part.kind)} aria-hidden="true"/><span>{t(mixLabels[part.kind])}</span><b>{formatMoney(part.amount, currency, locale)}</b></li>)}
   <li className="accounts-mix-available"><span>{t('Available to spend')}</span><b>{formatMoney(mix.available, currency, locale)}</b></li></ul>
 </section>;
}

/** The page's figure: the total of what is listed, in the display currency (a search or a filter narrows it with the
 * groups below), with the search and the filters beside it and the mix by account type under it. */
function AccountsHero({ visible, goals, children }: { visible: DirectoryItem[]; goals: PlanningData['goals']; /** The search and the filters. */ children?: ReactNode }) {
 const { t, locale } = useLanguage();
 const display = useDisplayMoney();
 const totals = currencyTotals(visible), total = totals.every(item => item.total !== null) ? display.sum(totals.map(item => ({ amount: item.total!, currency: item.currency }))) : null;
 const currency = display.currency??totals[0]?.currency??'USD';
 return <>
  <section className="accounts-hero">
   <div className="accounts-hero-figure">
    <h2>{t('Total across {count} accounts', { count: formatNumber(visible.length, locale, 0) })}<InfoHint>{t('Account totals use current quotes where available and saved prices otherwise. Holdings are counted once in your assets.')}</InfoHint></h2>
    <strong>{total===null?'—':<AnimatedMoney value={total} currency={currency}/>}</strong>
    {total===null&&<p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
   </div>
   {children}
  </section>
  <AccountsMix visible={visible} goals={goals} currency={currency}/>
 </>;
}

/** The Overview view of Accounts: the total in the display currency, the filters, the directory beside the selected account, and
 * the holdings that belong to no account yet. */
export function AccountsOverview({ loadFailed = false, items, data, filters, order, businesses, cardActions, holdingActions, onEditAccount, onAdd, onAddAccount, selected, onSelect, story }: { /** The accounts could not be read: an empty list then says nothing about them. */loadFailed?: boolean; /** The account picked in the directory; the page keeps it, so Transfer money can start from it. */selected: string|null; onSelect: (key: string) => void; items: DirectoryItem[]; data: PlanningData; filters: ReturnType<typeof useAccountFilters>; order: Parameters<typeof AccountDirectory>[0]['order']; businesses: readonly BusinessOption[]; cardActions: BalanceCardActions; holdingActions: HoldingActions; onEditAccount: (account: HoldingAccount) => void; onAdd: (kind: HoldingAccount['kind'], accountId: string) => void; onAddAccount: () => void; /** What the selected account's panel and the rows' month figures are told from. */ story: StoryState }) {
 const { t } = useLanguage();
 const { query, setQuery, businessFilter, setBusinessFilter, owners, ownerFilter, setOwnerFilter, visible, details, businessHoldings } = filters;
 const active=selectedItem(visible,selected);
 const balances=balanceAccounts(data.records), investmentAccounts=data.holdingAccounts??[], unassigned=unassignedHoldings(data.records);
 const market=holdingActions.market;
 // Each account's change this month, once everything booked to the accounts has been read.
 const waiting=story.loading||!!story.error;
 const changes=useMemo(()=>waiting?null:monthChanges(story.context),[waiting,story.context]);
 // A search once there are more than six accounts; the business and owner filters where the workspace has them.
 const tools=(items.length>6||businesses.length>0||owners.length>0)&&<div className="accounts-hero-tools">{items.length>6&&<label className="account-search"><Search size={18} aria-hidden="true"/><Input aria-label={t('Search accounts')} placeholder={t('Search accounts...')} value={query} onChange={event=>setQuery(event.target.value)}/></label>}{businesses.length>0&&<BusinessFilter businesses={businesses} value={businessFilter} onChange={setBusinessFilter}/>}{owners.length>0&&<OwnerFilter owners={owners} value={ownerFilter} onChange={setOwnerFilter}/>}</div>;
 return <>
  {!!items.length&&<AccountsHero visible={visible} goals={data.goals}>{tools}</AccountsHero>}
  {!!items.length&&<div className="accounts-master-detail">
   <AccountDirectory visible={visible} activeKey={active?.key} onSelect={onSelect} order={order} details={details} goals={data.goals} changes={changes}/>
   <div className="account-selected-panel">
   {balances.filter(account=>active?.key===`record:${account.id}`).map(account=><BalanceAccountCard key={account.id} account={account} goals={data.goals} story={story} {...cardActions}/>)}
   {investmentAccounts.filter(account=>active?.key===`investment:${account.id}`).map(account=><InvestmentAccountCard key={account.id} account={account} records={data.records} onEditAccount={onEditAccount} onAdd={onAdd} holdingActions={holdingActions}/>)}
   </div>
  </div>}
  {!loadFailed&&!balances.length&&!investmentAccounts.length&&<EmptyState className="panel" icon={<Wallet aria-hidden="true"/>} description={t('Add a cash, deposit, stock or crypto account to get started.')}><Button onClick={onAddAccount}><Plus size={17} aria-hidden="true"/>{t('Add account')}</Button></EmptyState>}
  {businessHoldings.length>0&&<BusinessHoldings records={businessHoldings} market={market} onOpen={holdingActions.onOpen}/>}
  {!!unassigned.length&&<section className="panel account-unassigned"><PanelTitle title={t('Holdings without an account')} hint={t('Assign existing holdings to an account without changing their value or cash balances.')}/><HoldingRows records={unassigned} {...holdingActions}/></section>}
 </>;
}
