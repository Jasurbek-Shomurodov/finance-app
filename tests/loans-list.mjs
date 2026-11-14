import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, stubs, text } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';

const h = React.createElement;
const { formatMoney } = loadTS('lib/format.ts');
const usd = amount => formatMoney(amount, 'USD', 'en-US');
const base = { quantity: 1, cost: 0, rate: 0, frequency: 'Once', notes: '', date: '' };
// The flat is stored in UZS and shown in USD; the rest are USD.
const flat = { ...base, id: 'flat', name: 'Flat', kind: 'Mortgage', currency: 'UZS', amount: 120000000, rate: 12, date: '2030-01-01', opened_on: '2025-03-10', estimated_monthly_payment: 2400000 };
const card = { ...base, id: 'card', name: 'Card', kind: 'Debt', currency: 'USD', amount: 2300, rate: 21.9, date: '2026-11-20', opened_on: '2026-02-01' };
const ali = { ...base, id: 'ali', name: 'Ali', kind: 'Money lent', currency: 'USD', amount: 700, lent_date: '2026-02-05', borrower_group: 'Family' };
const vali = { ...base, id: 'vali', name: 'Vali', kind: 'Money lent', currency: 'USD', amount: 300, lent_date: '2026-03-01', borrower_group: 'family ', date: '2026-10-01' };
const stored = new Map([flat, card, ali, vali].map(record => [record.id, record]));
const shownFlat = { ...flat, currency: 'USD', amount: 10000, estimated_monthly_payment: 200 };
const event = (record_id, balance) => ({ id: record_id, record_id, occurred_on: '2025-01-01', created_at: '2025-01-01', event_type: 'baseline', amount: 0, balance, ownership_percentage: 100, principal: 0, interest: 0, notes: '' });

function list(overrides = {}, events = []) {
 const r = createRenderer(), ui = stubs(), calls = [];
 const call = name => record => calls.push([name, record.id]);
 const workspace = {
  filters: { order: 'newest' }, setFilters() {}, filtersActive: false, visible: [shownFlat, card, ali, vali], totalRecords: 4, tableLoading: false, planning: { error: '', data: {} }, demo: false, currency: 'USD',
  money: (amount, currency) => formatMoney(amount, currency, 'en-US'), storedRecord: record => stored.get(record.id), refreshRecords() {}, addRecord() {},
  editRecord: call('edit'), requestDelete: call('delete'), setTracking: call('tracker'), setPayingMortgage: call('mortgage'), setDebtPayment: call('debt'), ...overrides,
 };
 const modules = {
  ...ui.modules,
  '@/components/workspace/workspace-provider': { useWorkspace: () => workspace },
  '@/components/display-money': { useDisplayMoney: () => ({ showSum: amounts => usd(amounts.reduce((sum, row) => sum + row.amount, 0)), entered: (amount, currency) => formatMoney(amount, currency, 'en-US') }) },
  '@/components/record-filters': { RecordFilters: () => null, emptyRecordFilters: {} },
  '@/components/presentation-foundation/rolling-text': { RollingText: ({ text: value }) => value },
  '@/components/presentation-foundation/record-icon': { RecordIcon: () => null },
  '@/components/presentation-foundation/row-menu': { RowMenu: ({ items }) => h('menu', null, items.filter(Boolean).map(item => h('button', { key: item.label, 'data-menu': item.label, onClick: item.onSelect }, item.label))) },
  '@/components/presentation-foundation/inline-error': { InlineError: ({ message, onRetry }) => h('p', { role: 'alert', 'data-retry': !!onRetry }, message) },
  '@/components/presentation-foundation/empty-state': { EmptyState: ({ title }) => h('p', { className: 'empty' }, title) },
  '@/components/presentation-foundation/segmented': { Segmented: ({ options, onChange }) => h('nav', null, options.map(option => h('button', { key: option.value, 'data-group': option.value, onClick: () => onChange(option.value) }, option.label))) },
  '@/hooks/use-columns-fit': { useColumnsFit: () => null },
  '@/lib/deposit-interest': { depositToday: () => '2026-11-14' },
 };
 modules['@/components/loans/loan-row'] = r.load('components/loans/loan-row.tsx', modules);
 const { LoansList } = r.load('components/loans/loans-list.tsx', modules);
 r.mount(h(LoansList, { events }));
 return { r, calls, html: () => r.html(), words: () => text(r.tree) };
}
const order = (words, ...labels) => labels.map(label => words.indexOf(label));
const ascending = positions => positions.every((at, index) => at >= 0 && (!index || at > positions[index - 1]));

test('grouped by type, what you owe and what you are owed are two groups with their totals; a borrower group keeps its own heading', () => {
 const { r, words: read } = list();
 // Month sections open first (the owner's choice of 1 November 2026); Type is one press away.
 r.find(element => element.props?.['data-group'] === 'side').props.onClick();
 r.update();
 const words = read();
 assert.ok(ascending(order(words, 'You owe', 'Flat', 'Card', 'Owed to you', 'Family', 'Ali', 'Vali')), words);
 assert.ok(words.includes(`You owe2${usd(12300)}`), words);
 assert.ok(words.includes(`Owed to you2${usd(1000)}`), words);
 assert.ok(words.includes(`Family2${usd(1000)}`), words);
 // One icon tile and the kind in the facts line: no category column, and sentence-case headings.
 assert.ok(words.includes('Paid off') && words.includes('Balance') && !words.includes('Category'), words);
 assert.ok(words.includes('Mortgage · 12% · Due: 1 January 2030'), words);
 assert.ok(words.includes('Money lent · Lent: 5 February 2026 · No due date'), words);
});

test('a row keeps its balance in the display currency and its monthly payment as entered', () => {
 const words = list().words();
 assert.ok(words.includes(usd(10000)) && words.includes(`${formatMoney(2400000, 'UZS', 'en-US')} per month`), words);
 assert.ok(!words.includes(`${usd(200)} per month`), words);
});

test('a due date within two weeks is marked with the days left, and a past one as overdue', () => {
 const { html, words } = list();
 assert.match(html(), /<span class="caution">Due: 20 November 2026 · in 6 days<\/span>/);
 assert.match(html(), /<span class="negative">Overdue · Due: 1 October 2026<\/span>/);
 assert.ok(!words().includes('1 January 2030 · in'), 'a far due date carries no countdown');
});

test('a paid-off bar appears only for a record with a recorded starting balance, in the record\'s own currency', () => {
 const none = list();
 assert.doesNotMatch(none.html(), /progress-track/);
 const { html, words } = list({}, [event('flat', 160000000), event('ali', 1000)]);
 assert.equal(html().match(/progress-track/g).length, 2);
 assert.match(html(), /data-tone="debt" role="img" aria-label="Paid off: 25%"><span style="width:25%">/);
 assert.ok(words().includes(`${formatMoney(40000000, 'UZS', 'en-US')} · 25% of ${formatMoney(160000000, 'UZS', 'en-US')}`), words());
 assert.ok(words().includes('30% repaid'), words());
});

test('Record payment is the row\'s one button and the rest sits in the menu; the sample workspace blocks loan payments', () => {
 const { r, calls } = list();
 const pay = r.all(element => element.props?.className === 'loan-row-pay');
 assert.deepEqual(pay.map(button => button.props['aria-label']), ['Record payment: Flat', 'Record payment: Card'], 'money lent has no payment button');
 pay[0].props.onClick(); pay[1].props.onClick();
 r.find(element => element.props?.['data-menu'] === 'Tracker').props.onClick();
 r.all(element => element.props?.['data-menu'] === 'Delete')[1].props.onClick();
 assert.deepEqual(calls, [['mortgage', 'flat'], ['debt', 'card'], ['tracker', 'flat'], ['delete', 'card']]);
 const sample = list({ demo: true });
 const blocked = sample.r.all(element => element.props?.className === 'loan-row-pay');
 blocked[0].props.onClick(); blocked[1].props.onClick();
 assert.deepEqual(sample.calls, [['mortgage', 'flat']]);
 assert.equal(blocked[1].props['aria-disabled'], true);
 assert.ok(!sample.words().includes('Tracker'));
});

test('grouped by month, each month nets what is lent against what is owed, newest list order kept', () => {
 const { r, words } = list();
 r.find(element => element.props?.['data-group'] === 'month').props.onClick();
 r.update();
 const shown = words();
 assert.ok(ascending(order(shown, 'March 2025', 'Flat', 'February 2026', 'Card', 'Ali', 'March 2026', 'Vali')), shown);
 assert.ok(shown.includes(`February 20262${usd(700 - 2300)}`), shown);
 assert.ok(!shown.includes('You owe'), shown);
});

test('a failed planning read offers a retry instead of a fresh start', () => {
 const failed = list({ visible: [], planning: { error: 'Could not load planning data.', data: {} } }).html();
 assert.match(failed, /role="alert" data-retry="true"/);
 assert.doesNotMatch(failed, /class="empty"/);
 assert.match(list({ visible: [] }).html(), /class="empty"/);
});
