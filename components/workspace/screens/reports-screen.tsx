"use client";
import { useMemo, useState, type ReactNode } from 'react';
import { ReportSummary, ReportTransactions, type ReportNames } from '@/components/business-reports';
import { useLanguage } from '@/components/language-provider';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { ReportsSkeleton } from '@/components/presentation-foundation/screen-skeletons';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { AttributeTab } from '@/components/reports/attribute-tab';
import { CashFlowTab } from '@/components/reports/cash-flow-tab';
import { ReportFilters } from '@/components/reports/report-filters';
import { TaxTab } from '@/components/reports/tax-tab';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useReportLink } from '@/hooks/use-report-link';
import { useRangeData } from '@/hooks/use-report-data';
import { budgetCategories } from '@/lib/budget';
import { HOUSEHOLD } from '@/lib/business';
import { drillMatches, filterLines, periodOf, reportLedger, shiftPeriod, trendWindow, type Drill, type Interval, type LedgerLine } from '@/lib/business-report';
import { depositToday } from '@/lib/deposit-interest';
import { inOwnerFilter, ownerOf, SHARED, workspaceOwners } from '@/lib/household';
import { describeDrill, groupFinder, reportNames, reportTabsFor, tabLines, type ReportTab } from '@/lib/report-view';
import { marketRates } from '@/lib/market';

const tabLabels: Record<ReportTab, string> = { cash_flow: 'Cash flow', spending: 'Spending', income: 'Income', tax: 'Business tax prep' };

/** Reports: cash flow, spending and income for the household and each business, with breakdowns, trends and a
 * profit and loss table, and business tax prep. Every chart narrows the transactions below it. */
export function ReportsScreen() {
 const { t } = useLanguage();
 const { currency, market, budget, transactionTools, businessList, workspacePreferences, setViewing, storedRecord, household } = useWorkspace();
 // In a shared household, reports narrow to what one person owns or to what is shared.
 const homes = household.state;
 const owners = workspaceOwners(homes, { shared: t('Shared'), unnamed: t('Partner') });
 const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
 const today = depositToday();
 const { tab, setTab, businesses, setBusinesses, cashView, setCashView, cashMode, setCashMode } = useReportLink();
 // The page shows one month, quarter or year; Trends read back from it.
 const [interval, setInterval] = useState<Interval>('month');
 const [anchor, setAnchor] = useState(today);
 const period = periodOf(interval, anchor, today), trendRange = trendWindow(period, interval);
 const { data, loading, error, retry } = useRangeData(trendRange);
 const rates = marketRates(market);
 const splits = transactionTools.data.splits;
 const ledger = useMemo(() => reportLedger(data, splits, { from: trendRange.from, to: trendRange.to }, currency, today, rates), [data, splits, trendRange.from, trendRange.to, currency, today, rates]);
 // Costs that come from an asset's history rather than a transaction belong to the household.
 const trendLines = useMemo(() => filterLines(ledger.lines, businesses).filter(line => !homes || inOwnerFilter(ownerFilter, line.record ? ownerOf(line.record, homes) : SHARED)), [ledger.lines, businesses, homes, ownerFilter]);
 const lines = useMemo(() => trendLines.filter(line => line.date >= period.from && line.date <= period.to), [trendLines, period.from, period.to]);
 const groups = useMemo(() => new Map(budgetCategories(data.categories, budget.state.categories).map(category => [category.key, category.group])), [data.categories, budget.state.categories]);
 const groupOf = groupFinder(groups, data.categories);
 const names = reportNames(data.categories, businessList, t);
 const [drill, setDrill] = useState<{ drill: Drill; label: string } | null>(null);
 // A row narrows the transactions below to what it counts: its history for the report's period.
 const narrow = (next: Drill) => setDrill({ drill: next, label: describeDrill(next, names, t) });
 // Changing what the page shows starts again from every transaction.
 const reset = <T,>(set: (value: T) => void) => (value: T) => { set(value); setDrill(null); };
 const visibleTabs = reportTabsFor(businessList.length > 0);
 const shownTab = visibleTabs.includes(tab) ? tab : 'cash_flow';
 const open = (line: LedgerLine) => line.record && setViewing(storedRecord(line.record));
 const tabProps = { trendLines, trendRange, interval, names, groupOf, currency, onDrill: narrow, missing: ledger.missing };

 return <div data-page="Reports" className="content reports-content">
  <PageHeader title={t('Reports')} tabs={<Segmented as="nav" className="page-tabs" label={t('Reports')} options={visibleTabs.map(value => ({ value, label: t(tabLabels[value]) }))} value={shownTab} onChange={reset(setTab)}/>} hint={t('Cash flow, spending and income for your household and each business. Click any part of a chart or table to see its transactions.')}>
   {shownTab !== 'tax' && <ReportFilters businesses={businessList} business={businesses} onBusiness={reset(setBusinesses)} owners={owners} owner={ownerFilter} onOwner={reset(setOwnerFilter)} interval={interval} onInterval={reset(setInterval)} period={period} today={today} onStep={reset((steps: number) => setAnchor(shiftPeriod(period.from, interval, steps)))} onToday={() => reset(setAnchor)(today)}/>}
  </PageHeader>
  {shownTab === 'tax' ? <TaxTab preferences={workspacePreferences.data.preferences} save={workspacePreferences.save} names={names} onOpen={open}/>
   : error ? <InlineError message={t(error)} onRetry={retry}/> : loading ? <ReportsSkeleton label={t('Loading records…')} donut={shownTab !== 'cash_flow'}/> : <ReportBody tab={shownTab} lines={lines} names={names} currency={currency} drill={drill} onClear={() => setDrill(null)} missing={ledger.missing} fileName={`${shownTab.replace('_', '-')}-${period.from}-${period.to}`} onOpen={open}>
    {shownTab === 'cash_flow' ? <CashFlowTab {...tabProps} lines={lines} includeHousehold={!businesses.length || businesses.includes(HOUSEHOLD)} businessIds={businessList.map(item => item.id).filter(id => businesses.includes(id) || (!businesses.length && (cashMode === 'trends' ? trendLines : lines).some(line => line.business === id)))} view={cashView} onView={setCashView} mode={cashMode} onMode={setCashMode}/>
     : <AttributeTab {...tabProps} key={shownTab} direction={shownTab === 'spending' ? 'expense' : 'income'} lines={tabLines(shownTab, lines)} trendLines={tabLines(shownTab, trendLines)} hasBusinesses={businessList.length > 0}/>}
   </ReportBody>}
 </div>;
}

/** A report tab's chart, then the transactions it narrows to beside their summary. */
function ReportBody({ tab, lines, names, currency, drill, onClear, missing, fileName, onOpen, children }: { tab: ReportTab; lines: LedgerLine[]; names: ReportNames; currency: string; drill: { drill: Drill; label: string } | null; onClear: () => void; missing: number; fileName: string; onOpen: (line: LedgerLine) => void; children: ReactNode }) {
 const { t } = useLanguage();
 const shown = tabLines(tab, lines).filter(line => drillMatches(drill?.drill ?? null, line));
 return <>
  {children}
  {missing > 0 && <p className="muted">{t('{count} transactions in other currencies are left out until exchange rates load.', { count: missing })}</p>}
  <div className="transactions-layout">
   <ReportTransactions key={drill?.label ?? 'all'} lines={shown} drill={drill?.drill ?? null} label={drill?.label ?? null} names={names} currency={currency} onClear={onClear} onOpen={onOpen}/>
   <ReportSummary lines={shown} mixed={tab === 'cash_flow'} names={names} currency={currency} fileName={fileName}/>
  </div>
 </>;
}
