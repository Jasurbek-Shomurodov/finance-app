"use client";
import { useLanguage } from '@/components/language-provider';
import { operationDetails, type Operation } from '@/lib/cash-flow-operations';
import type { DrillContext } from '@/lib/cash-flow-drill';
import { formatDate, formatMoney } from '@/lib/format';

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

/** A transfer, repayment, buy or sale as it was entered: its day, what was sent and what arrived, each in its own account's currency,
 * the fee and the notes. Its accounts are the two ends of the Sankey above, which open them. */
export function OperationDetails({ id, context }: { id: string; context: DrillContext }) {
 const { t, locale } = useLanguage();
 const details = operationDetails(id, context);
 if (!details) return null;
 const { row } = details, { sent, received, fee } = row;
 const differs = sent.currency !== received.currency || sent.amount !== received.amount;
 return <dl className="drill-operation">
  <dt>{t('Date')}</dt><dd>{formatDate(row.date, locale)}</dd>
  <dt>{t('Amount')}</dt><dd>{formatMoney(sent.amount, sent.currency, locale)}</dd>
  {differs && <><dt>{t('Received')}</dt><dd>{formatMoney(received.amount, received.currency, locale)}</dd></>}
  {fee > 0 && <><dt>{t('Transfer fee')}</dt><dd>{formatMoney(fee, sent.currency, locale)}</dd></>}
  {row.notes.trim() && <><dt>{t('Notes')}</dt><dd>{row.notes}</dd></>}
 </dl>;
}
