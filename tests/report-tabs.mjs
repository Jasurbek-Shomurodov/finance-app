import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createRenderer, hostModule, language } from './helpers/component-tree.mjs';

// Reports: a period total that would leave out an amount no rate converts reads — instead of a partial figure (MONEY-008).
const { formatMoney } = loadTS('lib/format.ts');
const usd = value => formatMoney(value, 'USD', 'en');
const modules = { '@/components/language-provider': language('en'), '@/components/business-reports': hostModule({ attributeColor: () => 'red' }), '@/components/cash-flow-report': hostModule(), '@/components/category-icons-context': { useCategoryHue: () => () => 0 },
 ...Object.fromEntries(['panel-title', 'segmented', 'stat-tile'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])) };
const line = (direction, amount, category = 'Living expense') => ({ id: direction + amount, name: 'Row', direction, amount, category, date: '2026-10-05', business: null });
const lines = [line('income', 3000, 'Salary'), line('expense', 1200)];
const names = { category: key => key, group: key => key, business: key => key };
const shared = { lines, trendLines: lines, trendRange: { from: '2026-08-01', to: '2026-10-31' }, interval: 'month', names, groupOf: key => key, currency: 'USD', onDrill() {} };
const tiles = r => r.all(node => node.type === 'StatTile').map(node => [node.props.label, node.props.value, node.props.tone]);

test('Cash flow tiles show income, expenses, net and the savings rate, or — for every one while an amount has no rate', () => {
 const r = createRenderer();
 const { CashFlowTab } = r.load('components/reports/cash-flow-tab.tsx', modules);
 const props = { ...shared, includeHousehold: true, businessIds: [], view: 'pnl', onView() {}, mode: 'breakdown', onMode() {} };
 r.mount(React.createElement(CashFlowTab, props));
 assert.deepEqual(tiles(r), [['Income', usd(3000), 'positive'], ['Expenses', usd(1200), undefined], ['Net income', usd(1800), 'positive'], ['Savings rate', '60%', 'positive']]);
 r.mount(React.createElement(CashFlowTab, { ...props, missing: 2 }));
 assert.deepEqual(tiles(r), [['Income', '—', undefined], ['Expenses', '—', undefined], ['Net income', '—', undefined], ['Savings rate', '—', undefined]]);
});

test('the Spending and Income tabs show their total, or — while an amount has no rate', () => {
 const r = createRenderer();
 const { AttributeTab } = r.load('components/reports/attribute-tab.tsx', modules);
 const props = { ...shared, direction: 'income', lines: [lines[0]], trendLines: [lines[0]], hasBusinesses: false };
 r.mount(React.createElement(AttributeTab, props));
 assert.deepEqual(tiles(r)[0], ['Total income', usd(3000), 'positive']);
 r.mount(React.createElement(AttributeTab, { ...props, missing: 1 }));
 assert.deepEqual(tiles(r)[0], ['Total income', '—', undefined]);
 assert.deepEqual(tiles(r)[1], ['Transactions', '1', undefined]);
});
