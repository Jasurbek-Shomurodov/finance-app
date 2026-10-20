"use client";
import { useLanguage } from '@/components/language-provider';
import { operationDetails, type Operation } from '@/lib/cash-flow-operations';
import type { DrillContext, DrillTarget } from '@/lib/cash-flow-drill';
import { formatDate, formatMoney } from '@/lib/format';
import { convertAmount } from '@/lib/market';

const titles: Record<Operation['kind'], string> = { transfer: 'Transfer', repayment: 'Repayment', buy: 'Buy holding', sell: 'Sell / convert holding' };
/** What a transfer or repayment is called. */
export const operationTitle = (row: Pick<Operation, 'kind'>, t: (key: string) => string) => t(titles[row.kind]);

/** A transfer, repayment, buy or sale as a row of an account's transactions: the other account, and the amount as it left or reached
 * this account, in that account's currency. A tap opens it in the drill-down. */
export function OperationRow({ row, account, context, onOpen }: { row: Operation; account: string; context: DrillContext; onOpen: (row: Operation) => void }) {
 const { t, locale } = useLanguage();
 const details = operationDetails(row.id, context);
 if (!details) return null;
 const incoming = row.target_id === account, other = incoming ? details.source : details.target, money = incoming ? row.received : row.sent;
 const title = operationTitle(row, t);
 return <li><button type="button" onClick={() => onOpen(row)} aria-label={t('View details for {name}', { name: title })}>
  <span><strong>{title}</strong><small>{`${formatDate(row.date, locale)} · ${incoming ? '←' : '→'} ${other?.name.trim() || t(other?.kind ?? 'Other')}`}</small></span>
  <span className={incoming ? 'positive' : undefined}>{`${incoming ? '+' : '−'}${formatMoney(money.amount, money.currency, locale)}`}</span>
 </button></li>;
}

/** A transfer, repayment, buy or sale as it was entered: its accounts, its day, what was sent and what arrived, each in
 * its own account's currency, the fee and the notes. Every row opens something: an account opens its Sankey, the fee the
 * untraced amounts of the account its gap falls on, the day and notes Accounts, where the transfer is recorded. */
export function OperationDetails({ id, context, onOpen }: { id: string; context: DrillContext; onOpen: (target: DrillTarget, title: string) => void }) {
 const { t, locale } = useLanguage();
 const details = operationDetails(id, context);
 if (!details) return null;
 const { row, source, target } = details, { sent, received, fee } = row;
 const name = (record: typeof source) => record?.name.trim() || t(record?.kind ?? 'Other');
 // The fee opens the untraced amounts of the account the gap falls on: the sender when less arrived than left.
 const out = convertAmount(sent.amount, sent.currency, context.currency, context.rates), arrived = convertAmount(received.amount, received.currency, context.currency, context.rates);
 const gapOn = out !== null && out !== undefined && arrived !== null && arrived !== undefined && arrived > out ? row.target_id : row.source_id;
 const from: DrillTarget = { side: 'account', key: row.source_id }, to: DrillTarget = { side: 'account', key: row.target_id }, accounts: DrillTarget = { side: 'link', href: '/accounts' };
 const rows: Array<{ label: string; value: string; open: DrillTarget; title: string }> = [
  { label: t('From'), value: name(source), open: from, title: name(source) },
  { label: t('To'), value: name(target), open: to, title: name(target) },
  { label: t('Date'), value: formatDate(row.date, locale), open: accounts, title: t('Accounts') },
  { label: t('Amount'), value: formatMoney(sent.amount, sent.currency, locale), open: from, title: name(source) },
  ...sent.currency !== received.currency || sent.amount !== received.amount ? [{ label: t('Received'), value: formatMoney(received.amount, received.currency, locale), open: to, title: name(target) }] : [],
  ...fee > 0 ? [{ label: t('Transfer fee'), value: formatMoney(fee, sent.currency, locale), open: { side: 'untraced', key: gapOn } as DrillTarget, title: t('Not traced') }] : [],
  ...row.notes.trim() ? [{ label: t('Notes'), value: row.notes, open: accounts, title: t('Accounts') }] : [],
 ];
 return <ul className="drill-operation">{rows.map(item => <li key={item.label}><button type="button" onClick={() => onOpen(item.open, item.title)}><span>{item.label}</span><strong>{item.value}</strong></button></li>)}</ul>;
}
