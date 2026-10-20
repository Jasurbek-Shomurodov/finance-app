"use client";
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/language-provider';
import { useCashFlowData } from '@/components/cash-flow-data';
import { CashFlowDrillDialog } from '@/components/cash-flow-drill-lazy';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { depositToday } from '@/lib/deposit-interest';
import { income } from '@/lib/finance';
import type { SankeyRequest } from '@/components/workspace/state/use-open-dialogs';
import { formatMonthYear } from '@/lib/format';
import { marketRates } from '@/lib/market';

/** The Sankey a row opens over the page it is on. A transaction row opens its payer or merchant for the month it happened,
 * with the transaction listed below, one tap from its details; other rows (a schedule, a loan) ask for theirs. Nothing
 * is read until a row opens one. */
export function TransactionSankey() {
 const { t } = useLanguage();
 const { drilling, setDrilling, sankey, setSankey } = useWorkspace();
 if (drilling) {
  const merchant = drilling.name.trim() || t(drilling.kind);
  return <Drill key={drilling.id} request={{ target: { side: 'merchant', key: merchant, income: income.includes(drilling.kind) }, title: merchant, month: drilling.date.slice(0, 7) }} onClose={() => setDrilling(null)}/>;
 }
 return sankey ? <Drill key={JSON.stringify(sankey.target) + sankey.month} request={sankey} onClose={() => setSankey(null)}/> : null;
}

/** It reads what Cash flow reads, back to the month asked for, so every view it leads to is complete. */
function Drill({ request, onClose }: { request: SankeyRequest; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const { setViewing, storedRecord, user, demo, reload, planning, transactionTools, currency, market } = useWorkspace();
 // A schedule opened where its history is not at hand (the dashboard) shows it on Recurring.
 const router = useRouter();
 const today = depositToday();
 const { data, goalEvents, throughToday } = useCashFlowData({ owner: user, demo, revision: reload, provided: planning.data, month: today.slice(0, 7), today, linked: request.months?.[0] ?? request.month });
 const categoryName = (key: string) => data.categories.find(category => category.id === key)?.name ?? t(key);
 return <CashFlowDrillDialog target={request.target} title={request.title} period={request.period ?? formatMonthYear(request.month, locale)} savings={0}
  context={{ data, splits: transactionTools.data.splits, months: request.months ?? [request.month], currency, today, rates: marketRates(market), t, label: categoryName, locale, throughToday, goalEvents }}
  onClose={onClose} onOpenRecord={found => setViewing(storedRecord(found))} onDetails={request.onDetails ?? (request.target.side === 'schedule' ? () => { onClose(); router.push('/upcoming'); } : undefined)}/>;
}
