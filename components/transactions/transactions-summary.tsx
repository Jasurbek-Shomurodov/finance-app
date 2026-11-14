import Link from 'next/link';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { formatMoney, formatNumber, formatSignedMoney } from '@/lib/format';
import type { summarizeTransactions } from '@/lib/transaction-list';

type TopCategory = { key: string; name: string; icon: string; amount: number };
const share = (part: number, whole: number) => ({ width: `${whole > 0 ? Math.min(100, Math.max(0, part / whole * 100)) : 0}%` });

/** Beside the list: the period's net first, income against spending as two bars on one scale, then the count, the largest
 * expense (as entered) and the average spent a day; under it the categories most was spent in, with the way to Reports.
 * Every sum is in the display currency. */
export function TransactionsSummary({ title, summary, average, top, currency }: { /** The period the figures cover. */ title: string; summary: ReturnType<typeof summarizeTransactions>; /** Spending per day of the period. */ average: number; top: readonly TopCategory[]; currency: string }) {
 const { t, locale } = useLanguage();
 const { entered: enteredMoney } = useDisplayMoney();
 // A total that adds amounts no rate converts is missing, never a partial figure (MONEY-008).
 const known = !summary.missing, net = summary.received - summary.spent, scale = Math.max(summary.received, summary.spent);
 const total = (amount: number) => known ? formatMoney(amount, currency, locale) : '—';
 const signed = (amount: number) => known ? formatSignedMoney(amount, currency, locale) : '—';
 return <div className="transactions-aside">
  <aside className="panel transactions-summary" aria-label={t('Summary')}>
   <PanelTitle title={title}/>
   <p className="transactions-net"><span>{t('Net')}</span><strong className={known && net > 0 ? 'positive' : undefined}><RollingText text={signed(net)}/></strong></p>
   <div className="transactions-flow">
    <p><span>{t('Income')}</span><strong className={known && summary.received > 0 ? 'positive' : undefined}><RollingText text={signed(summary.received)}/></strong></p>
    <span className="progress-track" data-tone="income"><span style={share(known ? summary.received : 0, scale)}/></span>
    <p><span>{t('Spending')}</span><strong><RollingText text={total(summary.spent)}/></strong></p>
    <span className="progress-track" data-tone="expense"><span style={share(known ? summary.spent : 0, scale)}/></span>
   </div>
   <dl className="budget-left-summary">
    <div><dt>{t('Transactions')}</dt><dd>{formatNumber(summary.count, locale, 0)}</dd></div>
    {summary.largest && <div><dt>{t('Largest expense')}</dt><dd><RollingText text={enteredMoney(summary.largest.entered.amount, summary.largest.entered.currency)}/></dd></div>}
    <div><dt>{t('Average a day')}</dt><dd><RollingText text={total(average)}/></dd></div>
   </dl>
   {summary.missing > 0 && <p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
  </aside>
  {top.length > 0 && <section className="panel transactions-top" aria-label={t('Top categories')}>
   <PanelTitle title={t('Top categories')}><Link className="panel-link" href="/reports">{t('Reports')}</Link></PanelTitle>
   <ul>{top.map(row => <li key={row.key}>
    <CategoryIcon kind={row.icon} size="sm"/>
    <span><span><span>{row.name}</span><strong>{formatMoney(row.amount, currency, locale)}</strong></span><span className="progress-track" data-tone="expense"><span style={share(row.amount, top[0].amount)}/></span></span>
   </li>)}</ul>
  </section>}
 </div>;
}
