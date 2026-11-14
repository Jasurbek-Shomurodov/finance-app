"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { otherShareKey, topShares, type Share } from '@/lib/cash-flow-report';
import { formatMoney, formatSignedMoney } from '@/lib/format';

type Side = 'income' | 'expense';
type Props = { income: Share[]; expense: Share[]; /** Income less spending; null when an amount could not be converted. */left: number | null; label: (key: string) => string;
 /** The mark before an expense's name (a category's icon); income rows carry a green dot. */icon?: (key: string) => ReactNode; currency: string;
 /** With it, a named row is a button that opens what is behind it; Left over opens where the surplus went. */onOpen?: (side: Side | 'left', key: string) => void };

/** Where a period's money went, as one ranked list: income on top in green, then spending from the largest down (the
 * smallest share one "Other" row, so the rows add up), and what was left over at the foot. Bars are sized within their
 * own side, so the largest income and the largest expense are both full width. */
export function FlowBars({ income, expense, left, label, icon, currency, onOpen }: Props) {
 const { t, locale } = useLanguage();
 if (!income.length && !expense.length) return <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>;
 const total = income.reduce((sum, item) => sum + item.amount, 0);
 const row = ({ side, key = '', name, mark = null, amount, share, opens }: { side: Side | 'left'; key?: string; name: string; mark?: ReactNode; amount: string; share: number; opens: boolean }) => {
  const cells = <><span className="flow-bar-name">{mark}<span>{name}</span></span><span className="flow-bar-track" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(share > 0 ? 2 : 0, share * 100))}%` }}/></span><strong>{amount}</strong></>;
  return <li key={side + key} data-side={side} data-short={side === 'left' && left !== null && left < 0 || undefined}>{opens && onOpen
   ? <button type="button" className="flow-bar-row" onClick={() => onOpen(side, key)} aria-label={t('Open {name}', { name })}>{cells}</button>
   : <div className="flow-bar-row">{cells}</div>}</li>;
 };
 const rows = (side: Side, items: Share[]) => {
  const shown = topShares(items, 8), peak = Math.max(...shown.map(item => item.amount));
  return shown.map(item => {
   const other = item.key === otherShareKey, name = other ? t('Other') : label(item.key);
   const mark = side === 'income' || other || !icon ? <i className="flow-bar-dot" aria-hidden="true"/> : icon(item.key);
   return row({ side, key: item.key, name, mark, amount: side === 'income' ? formatSignedMoney(item.amount, currency, locale) : formatMoney(item.amount, currency, locale), share: item.amount / peak, opens: !other });
  });
 };
 const leftShare = left !== null && total > 0 ? Math.abs(left) / total : 0;
 return <ul className="flow-bars">
  {rows('income', income)}
  {rows('expense', expense)}
  {row({ side: 'left', name: t('Left over'), amount: left === null ? '—' : formatSignedMoney(left, currency, locale), share: leftShare, opens: left !== null && left > 0 })}
 </ul>;
}
