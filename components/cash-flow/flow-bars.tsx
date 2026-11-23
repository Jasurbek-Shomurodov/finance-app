"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { otherShareKey, topShares, type Share } from '@/lib/cash-flow-report';
import { formatMoney, formatPercent, formatSignedMoney } from '@/lib/format';

type Side = 'income' | 'expense';
type Row = { side: Side | 'left' | 'share'; key?: string; name: string; mark?: ReactNode; amount: string; /** Its share of the total, beside the amount. */note?: string;
 /** A second line under the name (a badge, the share and change). */under?: ReactNode;
 /** The bar's length, 0 to 1 of the longest. */share: number; /** A colour of its own for the bar. */color?: string; /** What was left over is short. */short?: boolean;
 /** With it the row is a button, named by `openLabel`; with `href` a link instead, to another page. */onOpen?: () => void; href?: string; openLabel?: string };

/** One ranked bar, the only one the app draws (Cash flow, Reports and the Dashboard's Where it is going): a mark and a
 * name, a bar sized against the longest, the amount. */
export function rankedBar({ side, key = '', name, mark = null, amount, note, under, share, color, short, onOpen, href, openLabel }: Row) {
 const cells = <><span className="flow-bar-name">{mark}<span>{name}{under}</span></span><span className="flow-bar-track" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(share > 0 ? 2 : 0, share * 100))}%`, background: color }}/></span><strong>{amount}{note && <small>{note}</small>}</strong></>;
 return <li key={side + key} data-side={side} data-short={short || undefined} title={note ? `${name} · ${amount}` : undefined}>{href
  ? <DrawerLink href={href} className="flow-bar-row" aria-label={openLabel}>{cells}</DrawerLink>
  : onOpen ? <button type="button" className="flow-bar-row" onClick={onOpen} aria-label={openLabel}>{cells}</button>
  : <div className="flow-bar-row">{cells}</div>}</li>;
}

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
 const opening = (side: Side | 'left', key: string, name: string, opens: boolean) => opens && onOpen ? { onOpen: () => onOpen(side, key), openLabel: t('Open {name}', { name }) } : {};
 const rows = (side: Side, items: Share[]) => {
  const shown = topShares(items, 8), peak = Math.max(...shown.map(item => item.amount));
  return shown.map(item => {
   const other = item.key === otherShareKey, name = other ? t('Other') : label(item.key);
   const mark = side === 'income' || other || !icon ? <i className="flow-bar-dot" aria-hidden="true"/> : icon(item.key);
   return rankedBar({ side, key: item.key, name, mark, amount: side === 'income' ? formatSignedMoney(item.amount, currency, locale) : formatMoney(item.amount, currency, locale), share: item.amount / peak, ...opening(side, item.key, name, !other) });
  });
 };
 const leftShare = left !== null && total > 0 ? Math.abs(left) / total : 0;
 return <ul className="flow-bars">
  {rows('income', income)}
  {rows('expense', expense)}
  {rankedBar({ side: 'left', name: t('Left over'), amount: left === null ? '—' : formatSignedMoney(left, currency, locale), share: leftShare, short: left !== null && left < 0, ...opening('left', '', t('Left over'), left !== null && left > 0) })}
 </ul>;
}

/** One side of a breakdown (Reports' Spending and Income, a donut's legend): the same ranked bars, each in its own
 * colour with its share of the total. The largest ten are named and the rest share one "Other" row, so the rows add up.
 * With `onSelect`, each named bar is a button that narrows the transactions below to it. */
export function ShareBars({ items, label, colorKey, currency, onSelect }: { items: Share[]; label: (key: string) => string; colorKey: (key: string) => string; currency: string; onSelect?: (key: string) => void }) {
 const { t, locale } = useLanguage();
 if (!items.length) return <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>;
 const shown = topShares(items), peak = Math.max(...shown.map(item => item.amount));
 return <ul className="flow-bars">{shown.map(item => {
  const other = item.key === otherShareKey, name = other ? t('Other') : label(item.key), color = other ? undefined : colorKey(item.key);
  return rankedBar({ side: 'share', key: item.key, name, mark: <i className="flow-bar-dot" style={{ background: color }} aria-hidden="true"/>, amount: formatMoney(item.amount, currency, locale), note: formatPercent(item.share * 100, locale), share: item.amount / peak, color,
   ...(onSelect && !other ? { onOpen: () => onSelect(item.key), openLabel: t('Show transactions for {name}', { name }) } : {}) });
 })}</ul>;
}
