import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { byType, createRenderer, hostModule, stubs } from './helpers/component-tree.mjs';

// Reports › Transactions counts transactions, not the category parts a split one was divided into (CR 2026-10-23, item 54).
const r = createRenderer();
const ui = stubs();
const Count = Object.assign(({ value }) => React.createElement('b', null, String(value)), { displayName: 'Count' });
const { ReportTransactions } = r.load('components/business-reports.tsx', { ...ui.modules, 'lucide-react': hostModule(), 'recharts': hostModule(), '@/components/presentation-foundation/count': { Count }, '@/components/presentation-foundation/panel-title': { PanelTitle: ({ title, count, children }) => React.createElement('header', null, title, count, children) }, ...Object.fromEntries(['category-icon', 'pagination', 'chart'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])) });
const names = { category: key => key, icon: key => key, group: key => key, business: () => 'Household', businessRecord: () => null };
const market = { id: 'm', name: 'Market', kind: 'Living expense', currency: 'USD', amount: 60, date: '2026-10-02', frequency: 'Once' };
const line = (id, record, amount, category) => ({ id, record, name: record?.name ?? 'Fee', date: '2026-10-02', direction: 'expense', amount, category, business: null });

test('a transaction split into two categories counts once; an item without a record counts by its own id', () => {
 const lines = [line('m:1', market, 40, 'Living expense'), line('m:2', market, 20, 'Pets'), line('fee', null, 5, 'Other expense')];
 r.mount(React.createElement(ReportTransactions, { lines, drill: null, label: null, names, currency: 'USD', onClear() {}, onOpen() {} }));
 assert.equal(r.find(byType(Count)).props.value, 2);
 assert.equal(r.all(byType('li')).length, 3, 'every part is still listed');
});
