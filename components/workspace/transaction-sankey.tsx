"use client";
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/language-provider';
import { useCashFlowData } from '@/components/cash-flow-data';
import { CashFlowDrillDialog } from '@/components/cash-flow-drill-lazy';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { depositToday } from '@/lib/deposit-interest';
import type { SankeyRequest } from '@/components/workspace/state/use-open-dialogs';
import { formatMonthYear } from '@/lib/format';
import { marketRates } from '@/lib/market';

/** The Sankey a Money flow button opens over the page it is on. Nothing is read until one opens. */
export function TransactionSankey() {
 const { sankey, setSankey } = useWorkspace();
 return sankey ? <Drill key={JSON.stringify(sankey.target) + sankey.month} request={sankey} onClose={() => setSankey(null)}/> : null;
}

/** It reads what Cash flow reads, back to the month asked for, so every view it leads to is complete. */
function Drill({ request, onClose }: { request: SankeyRequest; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const { setViewing, storedRecord, user, demo, reload, planning, transactionTools, currency, market } = useWorkspace();
 // A schedule opened where its history is not at hand (the dashboard) shows it on Recurring.
 const router = useRouter();
 const today = depositToday();
 const { live, data, remote, goalEvents, throughToday } = useCashFlowData({ owner: user, demo, revision: reload, provided: planning.data, month: today.slice(0, 7), today, linked: request.months?.[0] ?? request.month });
 const categoryName = (key: string) => data.categories.find(category => category.id === key)?.name ?? t(key);
 return <CashFlowDrillDialog target={request.target} title={request.title} period={request.period ?? formatMonthYear(request.month, locale)} savings={request.savings ?? 0} loading={live && remote.initialLoading}
  context={{ data, splits: transactionTools.data.splits, months: request.months ?? [request.month], currency, today, rates: marketRates(market), t, label: categoryName, locale, throughToday, goalEvents }}
  onClose={onClose} onOpenRecord={found => setViewing(storedRecord(found))} onDetails={request.onDetails ?? (request.target.side === 'schedule' ? () => { onClose(); router.push('/upcoming'); } : undefined)}/>;
}
