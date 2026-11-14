import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createRenderer, hostModule, language, text } from './helpers/component-tree.mjs';

// Reports: a period total that would leave out an amount no rate converts reads — instead of a partial figure (MONEY-008).
const { formatMoney } = loadTS('lib/format.ts');
const usd = value => formatMoney(value, 'USD', 'en');
const modules = { '@/components/language-provider': language('en'), '@/components/business-reports': hostModule({ attributeColor: () => 'red' }), '@/components/cash-flow-report': hostModule(), '@/components/category-icons-context': { useCategoryHue: () => () => 0 },
 './business-sankey': hostModule(), './profit-loss-table': hostModule(),
 ...Object.fromEntries(['panel-title', 'segmented', 'stat-tile'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])) };
const line = (direction, amount, category = 'Living expense') => ({ id: direction + amount, name: 'Row', direction, amount, category, date: '2026-10-05', business: null });
const lines = [line('income', 3000, 'Salary'), line('expense', 1200)];
const names = { category: key => key, group: key => key, business: key => key };
const shared = { period: { from: '2026-10-01', to: '2026-10-31' }, lines, trendLines: lines, trendRange: { from: '2026-08-01', to: '2026-10-31' }, interval: 'month', names, groupOf: key => key, currency: 'USD', onDrill() {} };
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
 // A split transaction is one transaction with several ledger lines; the tile counts transactions, as the Transactions panel does.
 const parts = [line('expense', 100), { ...line('expense', 50), id: 'part-a', record: { id: 'split' } }, { ...line('expense', 30), id: 'part-b', record: { id: 'split' } }];
 r.mount(React.createElement(AttributeTab, { ...props, direction: 'expense', lines: parts, trendLines: parts }));
 assert.deepEqual(tiles(r), [['Total spending', usd(180), undefined], ['Transactions', '2', undefined]]);
});

test('Cash flow names the business whose loss pulled net income down, and P&L reads the period, the month before and the year so far', () => {
 const r = createRenderer();
 const { CashFlowTab } = r.load('components/reports/cash-flow-tab.tsx', modules);
 const shop = (direction, amount, date = '2026-10-05') => ({ ...line(direction, amount, 'Supplies'), id: direction + amount + date, date, business: 'shop' });
 const period = [...lines, shop('income', 100), shop('expense', 264)], earlier = [shop('income', 900, '2026-09-10'), shop('expense', 100, '2026-02-03')];
 const props = { ...shared, lines: period, trendLines: [...period, ...earlier], trendRange: { from: '2025-11-01', to: '2026-10-31' }, includeHousehold: true, businessIds: ['shop'], view: 'pnl', onView() {}, mode: 'breakdown', onMode() {} };
 r.mount(React.createElement(CashFlowTab, props));
 const net = r.find(node => node.type === 'StatTile' && node.props.label === 'Net income');
 assert.equal(text(net).replace(/\s+/g, ' ').includes(`${usd(-164)} from shop`), true, 'the tile says which business made the loss');
 const { columns } = r.find(node => node.type === 'ProfitLossTable').props;
 assert.deepEqual(columns.map(column => column.label), ['October 2026', 'September 2026', 'Year to date']);
 assert.deepEqual(columns.map(column => column.pnl.businesses[0].net), [-164, 900, 636]);
 // Without a loss the tile carries no line.
 r.mount(React.createElement(CashFlowTab, { ...props, lines, trendLines: lines, businessIds: [] }));
 assert.equal(text(r.find(node => node.type === 'StatTile' && node.props.label === 'Net income')).includes('from'), false);
});
