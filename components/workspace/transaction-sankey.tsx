"use client";
import { useLanguage } from '@/components/language-provider';
import { useCashFlowData } from '@/components/cash-flow-data';
import { CashFlowDrillDialog } from '@/components/cash-flow-drill-lazy';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { depositToday } from '@/lib/deposit-interest';
import { income, type Entry } from '@/lib/finance';
import { formatMonthYear } from '@/lib/format';
import { marketRates } from '@/lib/market';

/** The Sankey a transaction row opens, over the page it is on: the transaction's payer or merchant for the month it
 * happened, with the transaction listed below, one tap from its details. Nothing is read until a row opens it. */
export function TransactionSankey() {
 const { drilling } = useWorkspace();
 return drilling ? <Drill key={drilling.id} record={drilling}/> : null;
}

/** It reads what Cash flow reads, back to the transaction's month, so every view it leads to is complete. */
function Drill({ record }: { record: Entry }) {
 const { t, locale } = useLanguage();
 const { setDrilling, setViewing, storedRecord, user, demo, reload, planning, transactionTools, currency, market } = useWorkspace();
 const month = record.date.slice(0, 7), today = depositToday();
 const { data, goalEvents, throughToday } = useCashFlowData({ owner: user, demo, revision: reload, provided: planning.data, month: today.slice(0, 7), today, linked: month });
 const merchant = record.name.trim() || t(record.kind);
 const categoryName = (key: string) => data.categories.find(category => category.id === key)?.name ?? t(key);
 return <CashFlowDrillDialog target={{ side: 'merchant', key: merchant, income: income.includes(record.kind) }} title={merchant} period={formatMonthYear(month, locale)} savings={0}
  context={{ data, splits: transactionTools.data.splits, months: [month], currency, today, rates: marketRates(market), t, label: categoryName, locale, throughToday, goalEvents }}
  onClose={() => setDrilling(null)} onOpenRecord={found => setViewing(storedRecord(found))}/>;
}
