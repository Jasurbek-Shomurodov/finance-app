"use client";
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { ArrowUpFromLine, Banknote, ChartLine, Flag, HandCoins, Landmark, Receipt, type LucideIcon } from 'lucide-react';
import { DeleteButton } from '@/components/presentation-foundation/delete-button';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import type { Entry } from '@/lib/finance';
import { categoryHue } from '@/lib/category-colors';
import { historyEventLabel, historyEventMovesCash, withoutRepeatedBalances, type TrackerEvent } from '@/lib/investment-history';

type Props = { events: TrackerEvent[]; record: Entry; accounts: Entry[]; valueLabel: string; /** What clicking an entry opens: a mortgage payment opens its transaction. Undefined where there is nothing to open. */ open?: (event: TrackerEvent) => (() => void) | undefined; deletable: (event: TrackerEvent) => boolean; deleteDisabled: boolean; onDelete: (event: TrackerEvent) => void };

/** Each kind of entry keeps one symbol and hue; invested money matches its line on the Overview chart. */
const eventMarks: Record<TrackerEvent['event_type'], { icon: LucideIcon; hue: number }> = {
 baseline: { icon: Flag, hue: 210 }, valuation: { icon: ChartLine, hue: 160 }, contribution: { icon: HandCoins, hue: categoryHue('Property') },
 withdrawal: { icon: ArrowUpFromLine, hue: 32 }, income: { icon: Banknote, hue: categoryHue('Deposit') }, expense: { icon: Receipt, hue: 0 }, mortgage_payment: { icon: Landmark, hue: 350 },
};

/** What makes an entry open on a click or on Enter and Space, while its own buttons keep their press. */
const openable = (onOpen: (() => void) | undefined, label: string) => !onOpen ? {} : ({
 className: 'tracker-event-open', tabIndex: 0, role: 'button', 'aria-label': label,
 onClick: (press: MouseEvent) => { if (!(press.target as HTMLElement).closest('button')) onOpen(); },
 onKeyDown: (press: KeyboardEvent) => { if (press.target === press.currentTarget && (press.key === 'Enter' || press.key === ' ')) { press.preventDefault(); onOpen(); } },
});

/** What a dated value was made of: a counted asset's two numbers, and the whole value with the share owned on that day. */
function OwnedLines({ event, record }: { event: TrackerEvent; record: Entry }) {
 const { t, locale } = useLanguage();
 const money = (value: number) => formatMoney(value, record.currency, locale);
 const shared = event.balance !== null && Number(event.ownership_percentage) < 100;
 return <>
  {event.quantity != null && event.unit_value != null && <span>{t('{quantity} {unit} × {value}', { quantity: formatNumber(Number(event.quantity), locale, 8), unit: record.unit_label ?? '', value: money(Number(event.unit_value)) })}</span>}
  {shared && <span>{t('Full value {amount} · you own {percent}', { amount: money(Number(event.balance)), percent: formatPercent(Number(event.ownership_percentage), locale, 8) })}</span>}
 </>;
}

/** One entry: what happened on the left, its amount on the right, and a bin only when the tracker may delete it. */
function HistoryRow({ event, record, accounts, valueLabel, onOpen, deletable, deleteDisabled, onDelete }: Omit<Props, 'events' | 'open'> & { event: TrackerEvent; onOpen?: () => void }) {
 const { t, locale } = useLanguage();
 const money = (value: number) => formatMoney(value, record.currency, locale);
 const value = Number(event.balance) * Number(event.ownership_percentage) / 100;
 const link = event.account_link;
 const account = link && t(Number(link.amount) < 0 ? 'from {account}' : 'to {account}', { account: accounts.find(item => item.id === link.account_id)?.name ?? t('Cash account') });
 const mark = eventMarks[event.event_type];
 const Icon = mark.icon;
 // A payment entered in another currency counts in the asset's currency at its own day's rate.
 const converted = event.entered && event.entered.currency !== record.currency && event.amount !== null;
 const label = t(historyEventLabel(record.kind, event.event_type));
 return <li data-event={event.event_type} {...openable(onOpen, t('View details for {name}', { name: label }))}>
  <span className="record-icon category-record-icon" style={{ '--category-hue': mark.hue } as CSSProperties} aria-hidden="true"><Icon/></span>
  <div className="tracker-event-main"><strong>{label}</strong><small><time>{formatDate(event.occurred_on, locale)}</time>{account && <> · {account}</>}</small>{event.notes && <p>{event.notes}</p>}</div>
  <div className="tracker-event-amount">
   {historyEventMovesCash(event) ? <><strong>{event.entered ? formatMoney(event.entered.amount, event.entered.currency, locale) : money(Number(event.amount))}</strong>{converted && <span>{t('{amount} at that day\'s rate', { amount: money(Number(event.amount)) })}</span>}{event.balance !== null && <span>{t(valueLabel)}: {money(value)}</span>}</>
    : <>{event.balance !== null && <strong>{money(value)}</strong>}{Number(event.amount) > 0 && <span>{t('Cash amount (your share)')}: {money(Number(event.amount))}</span>}</>}
   <OwnedLines event={event} record={record}/>
   {event.event_type === 'mortgage_payment' && <small>{t('Principal repayment')}: {money(Number(event.principal))} · {t('Interest paid')}: {money(Number(event.interest))}</small>}
  </div>
  {deletable(event) && <DeleteButton disabled={deleteDisabled} label={t(event.entered ? 'Delete record' : 'Delete update')} onClick={() => onDelete(event)}/>}
 </li>;
}

/** The tracker's History tab: every entry, newest first. Its explanations sit behind the tracker's ⓘ. */
export function TrackerHistory({ events, open, ...row }: Props) {
 const { t } = useLanguage();
 return <div className="tracker-history">
  {events.length ? <ul>{withoutRepeatedBalances(events).reverse().map(event => <HistoryRow key={event.id} event={event} onOpen={open?.(event)} {...row}/>)}</ul> : <p>{t('No history yet.')}</p>}
 </div>;
}
