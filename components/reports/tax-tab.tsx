"use client";
import { showSaved } from '@/lib/feedback';
import { useMemo, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { TaxPrepSheet } from '@/components/tax-prep-sheet';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { reportLedger, unconvertedCount, type LedgerLine } from '@/lib/business-report';
import { defaultTaxSettings, taxPeriodRange, type TaxPeriod, type TaxSettings } from '@/lib/business-tax';
import { depositToday } from '@/lib/deposit-interest';
import { expenses, income } from '@/lib/finance';
import type { WorkspacePreference } from '@/lib/workspace-preferences';
import { useRangeData } from '@/hooks/use-report-data';
import { marketRates } from '@/lib/market';
import { reportNames } from '@/lib/report-view';

/** Business tax prep reads its own tax year, whatever range the other tabs show. */
export function TaxTab({ preferences, save, saving = false, onOpen }: { preferences: readonly WorkspacePreference[]; save: (preference: WorkspacePreference) => Promise<void>; /** The saved settings are being read again: a change now would be built on stale ones. */ saving?: boolean; onOpen: (line: LedgerLine) => void }) {
 const { demo, currency, market, transactionTools, businessList } = useWorkspace();
 const today = depositToday(), thisYear = Number(today.slice(0, 4));
 const [business, setBusiness] = useState(businessList[0]?.id ?? '');
 const [year, setYear] = useState(thisYear), [period, setPeriod] = useState<TaxPeriod>('year');
 const saved = preferences.find((item): item is Extract<WorkspacePreference, { key: 'tax_lines' }> => item.key === 'tax_lines')?.data as TaxSettings | undefined;
 const [sample, setSample] = useState<TaxSettings>(defaultTaxSettings);
 const settings = demo ? sample : saved ?? defaultTaxSettings;
 const range = useMemo(() => taxPeriodRange(year, period), [year, period]);
 const { data, loading, error, retry } = useRangeData(range);
 const rates = marketRates(market);
 const shownBusiness = businessList.some(item => item.id === business) ? business : businessList[0]?.id ?? '';
 const ledger = useMemo(() => reportLedger(data, transactionTools.data.splits, range, currency, today, rates), [data, transactionTools.data.splits, range, currency, today, rates]);
 const lines = useMemo(() => ledger.lines.filter(line => line.business === shownBusiness), [ledger.lines, shownBusiness]);
 // A sheet for an accountant never quietly leaves a transaction out: what no rate converts is counted and shown.
 const missing = unconvertedCount(ledger.unconverted.filter(line => line.business === shownBusiness));
 const categories = useMemo(() => [...income.filter(kind => kind !== 'Salary').map(key => ({ key, direction: 'income' as const })), ...expenses.map(key => ({ key, direction: 'expense' as const })), ...data.categories.map(category => ({ key: category.id, direction: category.direction }))], [data.categories]);
 const { t } = useLanguage();
 if (error || transactionTools.error) return <InlineError message={t(error || transactionTools.error)} onRetry={() => { retry(); transactionTools.retry(); }}/>;
 if (loading || transactionTools.loading) return <PanelSkeleton label={t('Loading records…')} rows={6}/>;
 return <TaxPrepSheet lines={lines} missing={missing} saving={saving} businesses={businessList} business={shownBusiness} onBusiness={setBusiness} year={year} years={[0, 1, 2, 3, 4].map(back => thisYear - back)} onYear={setYear} period={period} onPeriod={setPeriod} categories={categories} settings={settings} onSettings={async next => { if (demo) { setSample(next); showSaved(); } else await save({ key: 'tax_lines', data: next }); }} names={reportNames(data.categories, businessList, t)} currency={currency} onOpen={onOpen}/>;
}
