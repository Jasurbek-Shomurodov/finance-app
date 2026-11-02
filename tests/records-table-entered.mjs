import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, stubs } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';

const h = React.createElement;
const ui = stubs();
const { formatMoney } = loadTS('lib/format.ts');
const flat = { id: 'flat', name: 'Flat', kind: 'Mortgage', currency: 'UZS', amount: 120000000, quantity: 1, cost: 0, rate: 12, date: '2030-01-01', frequency: 'Once', estimated_monthly_payment: 2400000, notes: '' };
function table(overrides) {
 const r = createRenderer();
 const workspace = {
  filters: {}, setFilters() {}, filtersActive: false, historyOnly: false, useFilteredRecords: true, remoteHistory: false, historyPage: {}, visible: [{ ...flat, currency: 'USD', amount: 10000, estimated_monthly_payment: 200 }], totalRecords: 1, pageCount: 1, tablePage: 1, tableLoading: false, recordsLoading: false, showPage() {}, sectionKey: 'debts',
  planning: { error: '', data: { categories: [] } }, transactionTools: { data: {} }, demo: false, busy: false, currency: 'USD', money: (amount, currency) => formatMoney(amount, currency, 'en-US'), storedRecord: () => flat, refreshRecords() {}, addRecord() {}, editRecord() {}, requestDelete() {}, setViewing() {}, setStopping() {}, setTracking() {}, setPayingMortgage() {}, setDebtPayment() {}, setSplitting() {}, ...overrides,
 };
 const { RecordsTable } = r.load('components/workspace/records-table.tsx', {
  ...ui.modules,
  '@/components/workspace/workspace-provider': { useWorkspace: () => workspace },
  '@/components/display-money': { useDisplayMoney: () => ({ showSum: () => '', entered: (amount, currency) => formatMoney(amount, currency, 'en-US') }) },
  '@/components/record-filters': { RecordFilters: () => null, emptyRecordFilters: {} },
  '@/components/presentation-foundation/row-menu': { RowMenu: () => null },
  '@/components/presentation-foundation/inline-error': { InlineError: ({ message, onRetry }) => h('p', { role: 'alert', 'data-retry': !!onRetry }, message) },
  '@/components/presentation-foundation/empty-state': { EmptyState: ({ title }) => h('p', { className: 'empty' }, title) },
 });
 r.mount(h(RecordsTable, { title: 'Loans & debts', pagination: false }));
 return r.html();
}
test('a mortgage row keeps its value in the display currency and its monthly payment as entered', () => {
 const html = table();
 assert.ok(html.includes(`Estimated payment: ${formatMoney(2400000, 'UZS', 'en-US')}/month`));
 assert.ok(!html.includes(`Estimated payment: ${formatMoney(200, 'USD', 'en-US')}/month`));
});
test('a failed planning read offers a retry instead of a fresh start', () => {
 const html = table({ visible: [], planning: { error: 'Could not load planning data.', data: { categories: [] } } });
 assert.match(html, /role="alert" data-retry="true"/);
 assert.doesNotMatch(html, /class="empty"/);
 assert.match(table({ visible: [] }), /class="empty"/);
});
