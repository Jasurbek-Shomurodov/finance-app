"use client";
import type { CSSProperties } from 'react';
import { ArrowUpFromLine, Banknote, ChartLine, Flag, HandCoins, Landmark, Receipt, type LucideIcon } from 'lucide-react';
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import type { Entry } from '@/lib/finance';
import { categoryHue } from '@/lib/category-colors';
import { historyEventLabel, historyEventMovesCash, type TrackerEvent } from '@/lib/investment-history';

type Props = { events: TrackerEvent[]; record: Entry; accounts: Entry[]; valueLabel: string; help: string[]; deletable: (event: TrackerEvent) => boolean; deleteDisabled: boolean; onDelete: (event: TrackerEvent) => void };

/** Each kind of entry keeps one symbol and hue; invested money and income match their lines on the Overview chart. */
const eventMarks: Record<TrackerEvent['event_type'], { icon: LucideIcon; hue: number }> = {
 baseline: { icon: Flag, hue: 210 }, valuation: { icon: ChartLine, hue: 160 }, contribution: { icon: HandCoins, hue: categoryHue('Property') },
 withdrawal: { icon: ArrowUpFromLine, hue: 32 }, income: { icon: Banknote, hue: categoryHue('Deposit') }, expense: { icon: Receipt, hue: 0 }, mortgage_payment: { icon: Landmark, hue: 350 },
};

/** One entry: what happened on the left, its amount on the right, and a bin only when the tracker may delete it. */
function HistoryRow({ event, record, accounts, valueLabel, deletable, deleteDisabled, onDelete }: Omit<Props, 'events' | 'help'> & { event: TrackerEvent }) {
 const { t, locale } = useLanguage();
 const money = (value: number) => formatMoney(value, record.currency, locale);
 const value = Number(event.balance) * Number(event.ownership_percentage) / 100;
 const link = event.account_link;
 const account = link && t(Number(link.amount) < 0 ? 'from {account}' : 'to {account}', { account: accounts.find(item => item.id === link.account_id)?.name ?? t('Cash account') });
 const mark = eventMarks[event.event_type];
 const Icon = mark.icon;
 const shared = event.balance !== null && Number(event.ownership_percentage) < 100;
 // A payment entered in another currency counts in the asset's currency at its own day's rate.
 const converted = event.entered && event.entered.currency !== record.currency && event.amount !== null;
 return <li data-event={event.event_type}>
  <span className="record-icon category-record-icon" style={{ '--category-hue': mark.hue } as CSSProperties} aria-hidden="true"><Icon/></span>
  <div className="tracker-event-main"><strong>{t(historyEventLabel(record.kind, event.event_type))}</strong><small><time>{formatDate(event.occurred_on, locale)}</time>{account && <> · {account}</>}</small>{event.notes && <p>{event.notes}</p>}</div>
  <div className="tracker-event-amount">
   {historyEventMovesCash(event) ? <><strong>{event.entered ? formatMoney(event.entered.amount, event.entered.currency, locale) : money(Number(event.amount))}</strong>{converted && <span>{t('{amount} at that day\'s rate', { amount: money(Number(event.amount)) })}</span>}{event.balance !== null && <span>{t(valueLabel)}: {money(value)}</span>}</>
    : <>{event.balance !== null && <strong>{money(value)}</strong>}{Number(event.amount) > 0 && <span>{t('Cash amount (your share)')}: {money(Number(event.amount))}</span>}</>}
   {shared && <span>{t('Full value {amount} · you own {percent}', { amount: money(Number(event.balance)), percent: formatPercent(Number(event.ownership_percentage), locale) })}</span>}
   {event.event_type === 'mortgage_payment' && <small>{t('Principal repayment')}: {money(Number(event.principal))} · {t('Interest paid')}: {money(Number(event.interest))}</small>}
  </div>
  {deletable(event) && <DeleteButton disabled={deleteDisabled} label={t(event.entered ? 'Delete record' : 'Delete update')} onClick={() => onDelete(event)}/>}
 </li>;
}

/** The tracker's History tab: every entry, newest first. */
export function TrackerHistory({ events, help, ...row }: Props) {
 const { t } = useLanguage();
 return <div className="tracker-history">
  {help.map(text => <p key={text} className="tracker-help">{text}</p>)}
  {events.length ? <ul>{[...events].reverse().map(event => <HistoryRow key={event.id} event={event} {...row}/>)}</ul> : <p>{t('No history yet.')}</p>}
 </div>;
}
