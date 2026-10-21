"use client";
import { FlowSankey } from '@/components/cash-flow-sankey';
import { useLanguage } from '@/components/language-provider';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatMoney } from '@/lib/format';
import { surplusFlows, surplusLines, type SurplusParts } from '@/lib/surplus-flows';

/** How the monthly surplus is worked out: income in, spending and payments out, as a Sankey and as the sum it draws. */
export function SurplusBreakdownDialog({ parts, currency, goalFunding = 0, onClose }: { parts: SurplusParts; currency: string; goalFunding?: number; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const flows = surplusFlows(parts, key => t(key), goalFunding);
 const { incoming, outgoing } = surplusLines(parts, goalFunding);
 const spent = outgoing.filter(line => line.kind !== 'savings');
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="record-dialog cash-flow-drill-dialog" aria-describedby={undefined}>
  <DialogTitle>{t('Monthly surplus')} <span className="panel-figure">{money(parts.forecast)}</span></DialogTitle>
  {flows.links.length ? <FlowSankey flows={flows} currency={currency}/> : <p className="budget-left-empty">{t('Nothing recorded in this period.')}</p>}
  <dl className="surplus-sum">
   {incoming.filter(line => line.kind === 'income').map(line => <div key={line.key}><dt>{t(line.key)}</dt><dd className="positive">{money(line.amount)}</dd></div>)}
   {spent.map(line => <div key={line.key}><dt>{t(line.key)}</dt><dd>−{money(line.amount)}</dd></div>)}
   <div className="surplus-sum-total"><dt>{t('Left after expenses')}</dt><dd className={parts.forecast < 0 ? 'negative' : 'positive'}>{money(parts.forecast)}</dd></div>
   {goalFunding > 0 && parts.forecast > 0 && <>
    <div><dt>{t('Planned goal funding')}</dt><dd>−{money(Math.min(goalFunding, parts.forecast))}</dd></div>
    <div className="surplus-sum-total"><dt>{t('Unassigned monthly surplus')}</dt><dd>{money(Math.max(0, parts.forecast - goalFunding))}</dd></div>
   </>}
  </dl>
  <p className="comparison-note">{t("Yearly records are divided by 12. A category's budget counts when it is more than the bills in that category. One-time records are excluded.")}</p>
 </DialogContent></Dialog>;
}
