"use client";
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney } from '@/lib/format';
import type { Entry } from '@/lib/finance';
import { historyEventLabel, historyEventMovesCash, type HistoryEvent } from '@/lib/investment-history';

type Props = { events: HistoryEvent[]; record: Entry; accounts: Entry[]; valueLabel: string; help: string[]; deletable: (event: HistoryEvent) => boolean; deleteDisabled: boolean; onDelete: (event: HistoryEvent) => void };

/** One entry: what happened on the left, its amount on the right, and a bin only when the tracker may delete it. */
function HistoryRow({ event, record, accounts, valueLabel, deletable, deleteDisabled, onDelete }: Omit<Props, 'events' | 'help'> & { event: HistoryEvent }) {
 const { t, locale } = useLanguage();
 const money = (value: number) => formatMoney(value, record.currency, locale);
 const value = Number(event.balance) * Number(event.ownership_percentage) / 100;
 const link = event.account_link;
 const account = link && t(Number(link.amount) < 0 ? 'from {account}' : 'to {account}', { account: accounts.find(item => item.id === link.account_id)?.name ?? t('Cash account') });
 return <li>
  <div className="tracker-event-main"><strong>{t(historyEventLabel(record.kind, event.event_type))}</strong><small><time>{formatDate(event.occurred_on, locale)}</time>{account && <> · {account}</>}</small>{event.notes && <p>{event.notes}</p>}</div>
  <div className="tracker-event-amount">
   {historyEventMovesCash(event) ? <><strong>{event.entered ? formatMoney(event.entered.amount, event.entered.currency, locale) : money(Number(event.amount))}</strong>{event.balance !== null && <span>{t(valueLabel)}: {money(value)}</span>}</>
    : <>{event.balance !== null && <strong>{money(value)}</strong>}{event.amount > 0 && <span>{t('Cash amount (your share)')}: {money(Number(event.amount))}</span>}</>}
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
