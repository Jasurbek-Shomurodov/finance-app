import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { formatMoney, formatNumber } from '@/lib/format';
import type { summarizeTransactions } from '@/lib/transaction-list';

/** The Summary panel beside the list: how many transactions, income, spending, the largest expense and the net, in the display currency. */
export function TransactionsSummary({ summary, currency }: { summary: ReturnType<typeof summarizeTransactions>; currency: string }) {
 const { t, locale } = useLanguage();
 const { entered: enteredMoney } = useDisplayMoney();
 const total = (amount: number) => summary.missing ? '—' : formatMoney(amount, currency, locale);
 return <aside className="panel transactions-summary" aria-label={t('Summary')}>
  <PanelTitle title={t('Summary')}/>
  <dl className="budget-left-summary">
   <div><dt>{t('Transactions')}</dt><dd>{formatNumber(summary.count, locale, 0)}</dd></div>
   {/* A total that adds amounts no rate converts is missing, never a partial figure (MONEY-008). */}
   <div><dt>{t('Income')}</dt><dd className={!summary.missing && summary.received > 0 ? 'positive' : undefined}><RollingText text={total(summary.received)}/></dd></div>
   <div><dt>{t('Spending')}</dt><dd><RollingText text={total(summary.spent)}/></dd></div>
   {summary.largest && <div><dt>{t('Largest expense')}</dt><dd><RollingText text={enteredMoney(summary.largest.entered.amount, summary.largest.entered.currency)}/></dd></div>}
   <div className="budget-left-total"><dt>{t('Net')}</dt><dd className={!summary.missing && summary.received - summary.spent > 0 ? 'positive' : undefined}><RollingText text={total(summary.received - summary.spent)}/></dd></div>
  </dl>
  {summary.missing > 0 && <p role="status" className="muted">{t('Exchange rate unavailable.')}</p>}
 </aside>;
}
