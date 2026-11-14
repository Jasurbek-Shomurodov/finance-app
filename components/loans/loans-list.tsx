"use client";
import { Fragment, useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
import { useDisplayMoney } from '@/components/display-money';
import { useLanguage } from '@/components/language-provider';
import { LoanRow } from '@/components/loans/loan-row';
import { Count } from '@/components/presentation-foundation/count';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { RecordFilters, emptyRecordFilters } from '@/components/record-filters';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useColumnsFit } from '@/hooks/use-columns-fit';
import { depositToday } from '@/lib/deposit-interest';
import { debtProgress } from '@/lib/debt-plan';
import { lendingRecordKinds, liabilities, value, type Entry } from '@/lib/finance';
import { formatMonthYear } from '@/lib/format';
import type { HistoryEvent } from '@/lib/investment-history';
import { trackedKinds } from '@/lib/investment-history';
import { lendingMonths, lendingSequence, type LendingItem } from '@/lib/lending-groups';
import { shownName } from '@/lib/record-names';

type Grouping = 'side' | 'month';
const total = (rows: readonly Entry[], signed = false) => rows.map(row => ({ amount: signed && liabilities.includes(row.kind) ? -value(row) : value(row), currency: row.currency }));

/** Loans & debts as one list: what you owe and what you are owed, each with its total, or the same records by the
 * month they began. `events` is the Tracker history a paid-off bar is worked out from; without it rows show none. */
export function LoansList({ events }: { events: readonly HistoryEvent[] }) {
 const { t, locale } = useLanguage();
 const { showSum } = useDisplayMoney();
 const [grouping, setGrouping] = useState<Grouping>('month');
 const { filters, setFilters, filtersActive, visible, totalRecords, tableLoading, planning, demo, currency, money, storedRecord, refreshRecords,
  addRecord, editRecord, requestDelete, setTracking, setPayingMortgage, setDebtPayment } = useWorkspace();
 const list = useColumnsFit<HTMLUListElement>('.loan-row', 220);
 const today = depositToday();
 const row = (shown: Entry) => {
  const saved = storedRecord(shown), name = shownName(shown, t);
  const pay = shown.kind === 'Mortgage' ? () => setPayingMortgage(saved) : shown.kind === 'Loan' || shown.kind === 'Debt' ? () => setDebtPayment(saved) : undefined;
  return <LoanRow key={shown.id} record={saved} name={name} balance={money(value(shown), shown.currency)} today={today} progress={debtProgress(saved, events)}
   onOpen={() => editRecord(shown)} onPay={pay} payBlocked={demo && shown.kind !== 'Mortgage' ? t('Available after you sign in.') : undefined}
   menu={[
    !demo && trackedKinds.includes(shown.kind) && { label: t('Tracker'), onSelect: () => setTracking(saved) },
    { label: t('Edit'), onSelect: () => editRecord(shown) },
    { label: t('Delete'), deletes: true, onSelect: () => requestDelete(shown) },
   ]}/>;
 };
 const heading = (key: string, label: string, rows: readonly Entry[], level: 'group' | 'borrower', signed = false) => <li key={key} className="loan-group" data-level={level}><span>{label}<Count value={rows.length}/></span><span><RollingText text={showSum(total(rows, signed))}/></span></li>;
 // Loans to the same borrower group sit under one heading with what they owe together.
 const items = (sequence: LendingItem<Entry>[]) => sequence.map(item => 'row' in item ? row(item.row) : <Fragment key={'borrower:' + item.borrower}>{heading('borrower:' + item.borrower, item.borrower, item.rows, 'borrower')}{item.rows.map(row)}</Fragment>);
 const sides = () => [['You owe', visible.filter(entry => liabilities.includes(entry.kind))] as const, ['Owed to you', visible.filter(entry => entry.kind === 'Money lent')] as const]
  .filter(([, rows]) => rows.length).map(([label, rows]) => <Fragment key={label}>{heading(label, t(label), rows, 'group')}{items(lendingSequence(rows, entry => entry))}</Fragment>);
 // One section per month, its total what is lent less what is owed, as Net lending position counts them. Sorted by name, months would break the order.
 const months = () => filters.order === 'name' ? items(lendingSequence(visible, entry => entry)) : lendingMonths(visible, entry => entry).map(section => <Fragment key={'month:' + section.month}>
  {heading('month:' + section.month, formatMonthYear(section.month, locale), section.rows, 'group', true)}{items(section.items)}
 </Fragment>);
 return <section id="workspace-records" className="panel loans-list">
  <PanelTitle title={t('Loans and debts')} count={<Count value={totalRecords} loading={tableLoading}/>} hint={<p>{t("Paid off compares today's balance with the first balance recorded, plus anything borrowed since.")}</p>}>
   <Segmented label={t('Group by')} options={[{ value: 'month', label: t('Month') }, { value: 'side', label: t('Type') }] as const} value={grouping} onChange={setGrouping}/>
  </PanelTitle>
  <RecordFilters value={filters} onChange={setFilters} categories={[]} kinds={lendingRecordKinds}/>
  {planning.error && <InlineError message={t(planning.error)} onRetry={refreshRecords}/>}
  {tableLoading ? <LoadingPlaceholder label={t('Loading records…')}/> : visible.length ? <ul className="loan-rows" ref={list}>
   <li className="loan-rows-head" aria-hidden="true"><span/><span>{t('Paid off')}</span><span>{t('Balance')}</span><span/></li>
   {grouping === 'side' ? sides() : months()}
  </ul> : planning.error ? null : <EmptyState icon={<Wallet/>} title={t(filtersActive ? 'No matching records' : 'A fresh start')} description={t(filtersActive ? 'Try another search or clear the filters.' : 'Add a record in {currency} to start building your overview.', { currency })}>
   {filtersActive && <Button variant="outline" onClick={() => setFilters(emptyRecordFilters)}>{t('Clear filters')}</Button>}<Button variant="outline" onClick={addRecord}><Plus/>{t('Add your first record')}</Button>
  </EmptyState>}
 </section>;
}
