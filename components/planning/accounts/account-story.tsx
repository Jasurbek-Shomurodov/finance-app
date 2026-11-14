"use client";
import { useMemo, type ReactNode } from 'react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { ResourceState } from '@/components/presentation-foundation/resource-state';
import { useDisplayMoney } from '@/components/display-money';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney, formatSignedMoney } from '@/lib/format';
import type { Entry } from '@/lib/finance';
import { accountStory, latestActivity, type StoryContext, type StoryEntry } from '@/lib/account-story';
import { openProps } from '@/lib/row-open';
import { AccountBalanceChart } from './accounts-lazy';

/** What an account's panel is told from: the records with everything booked to the accounts, and how that read stands.
 * Signed in, the income and spending arrive after the page; until then the panel waits rather than draw half a story. */
export type StoryState = { context: StoryContext; loading: boolean; error: string | null; retry: () => void;
 /** Opens the Recent activity view. */ onViewAll: () => void; /** Opens a transaction's details. */ onView?: (record: Entry) => void };

function ActivityRow({ entry, kind, onView }: { entry: StoryEntry; /** The account's kind, for an operation's icon. */ kind: string; onView?: (record: Entry) => void }) {
 const { t, locale } = useLanguage();
 const record = entry.record, title = entry.label ? t(entry.label) : entry.name;
 return <li className="account-activity-row" {...openProps(record && onView ? () => onView(record) : undefined, t('View details for {name}', { name: title }))}>
  <CategoryIcon kind={record?.custom_category_id ?? record?.kind ?? kind} size="sm"/>
  <div><strong>{title}</strong><small>{[formatDate(entry.date, locale), entry.label ? entry.name : ''].filter(Boolean).join(' · ')}</small></div>
  <b className={entry.amount !== null && entry.amount > 0 ? 'positive' : undefined}>{entry.amount === null ? '—' : formatSignedMoney(entry.amount, entry.currency, locale)}</b>
 </li>;
}

/** What the directory row cannot show of a cash account or deposit: its balance over the last six months, this month's
 * money in and out beside the facts passed as `children`, and the newest things recorded against it. */
export function AccountStoryView({ account, state, children }: { account: Entry; state: StoryState; /** The account's own facts, as `<div><dt/><dd/></div>` rows. */ children?: ReactNode }) {
 const { t, locale } = useLanguage();
 const display = useDisplayMoney();
 const { context, loading, error } = state, waiting = loading || !!error;
 const balance = display.convert(account.amount, account.currency), currency = display.currency ?? account.currency;
 const story = useMemo(() => waiting || balance === null ? null : accountStory(account.id, balance, context), [waiting, balance, account.id, context]);
 const latest = useMemo(() => waiting ? [] : latestActivity(account.id, context.data), [waiting, account.id, context.data]);
 return <>
  <ResourceState loading={loading} error={error} onRetry={state.retry} rows={3}>
   {story ? <AccountBalanceChart points={story.points} currency={currency} label={t('Balance')}/> : balance !== null && <p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
  </ResourceState>
  <dl className="account-balance-facts">
   {children}
   {story && <><div><dt>{t('In this month')}</dt><dd className={story.moneyIn > 0 ? 'positive' : undefined}>{story.moneyIn > 0 ? formatSignedMoney(story.moneyIn, currency, locale) : formatMoney(0, currency, locale)}</dd></div>
   <div><dt>{t('Out this month')}</dt><dd>{formatMoney(story.moneyOut, currency, locale)}</dd></div></>}
  </dl>
  {!waiting && <section className="account-card-activity">
   <header><h3>{t('Recent activity')}</h3><button type="button" className="panel-link" onClick={state.onViewAll}>{t('View all')}</button></header>
   {latest.length ? <ul>{latest.map(entry => <ActivityRow key={entry.id} entry={entry} kind={account.kind} onView={state.onView}/>)}</ul> : <p className="muted">{t('No account operations yet.')}</p>}
  </section>}
 </>;
}
