import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { byType, createRenderer, hostModule, stubs } from './helpers/component-tree.mjs';

// Assets & investments: a tap on the allocation list lands where that kind is (CR 2026-10-23, items 23 and 51).
const scrolled = [];
const r = createRenderer({ attach: element => element.type === 'section' ? { scrollIntoView: () => scrolled.push(element.props.className) } : null });
const ui = stubs();
globalThis.window ??= {};
globalThis.window.matchMedia ??= () => ({ matches: true });
const AssetCard = Object.assign(({ record, fact, children }) => React.createElement('article', { 'data-id': record.id }, fact?.value, children), { displayName: 'AssetCard' });
const AllocationDonut = Object.assign(() => null, { displayName: 'AllocationDonut' });
const foundation = Object.fromEntries(['count', 'inline-error', 'loading-placeholder', 'partial-total', 'empty-state', 'animated-money', 'segmented', 'pagination'].map(name => ['@/components/presentation-foundation/' + name, hostModule()]));
const { AssetDashboard } = r.load('components/asset-dashboard.tsx', { ...ui.modules, ...foundation, '@/components/presentation-foundation/asset-card': { AssetCard }, '@/components/charts-lazy': { AllocationDonut }, 'next/link': hostModule(), 'lucide-react': hostModule(), '@/components/ui/dropdown-menu': hostModule() });
const entry = (id, kind, amount, extra = {}) => ({ id, name: id, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date: '2026-10-01', frequency: 'Once', notes: '', ...extra });
const market = { rates: {}, fx: null, quotes: {}, errors: {}, stocksConfigured: false };
const broker = { id: 'broker', name: 'Broker', kind: 'Stock', currency: 'USD' };
const records = [entry('Savings', 'Deposit', 1000), entry('AAA', 'Stock', 100, { quantity: 2 }), entry('BBB', 'Stock', 50, { holding_account_id: 'broker' }), entry('Broker cash', 'Cash', 20, { holding_account_id: 'broker' })];
const props = { accounts: [broker], accountsLoading: false, accountsError: '', onRetryAccounts() {}, onAddHolding() {}, records, currency: 'USD', market, netWorth: 0, debt: 0, forecast: {}, forecastReady: true, loading: false, demo: false, onAdd() {}, onEdit() {}, onTrack() {}, onDelete() {}, quoteLabel: () => '' };
const option = kind => r.find(node => node.props?.className === 'allocation-option' && node.props['aria-pressed'] !== undefined && node.children.some(child => typeof child === 'object' && child.children.includes(kind)));

test('the allocation list shows every kind; a kind held only in accounts scrolls to the accounts, a loose one filters the assets below', () => {
 r.mount(React.createElement(AssetDashboard, props));
 assert.deepEqual(r.find(byType(AllocationDonut)).props.slices.map(slice => [slice.kind, slice.amount]), [['Deposit', 1000], ['Stock', 250], ['Cash', 20]], 'the donut and list still split everything held, the account’s holdings included');
 r.fire(option('Deposit'), 'onClick');
 assert.deepEqual(scrolled, ['asset-account-section'], 'a deposit is an account card: no empty "0 of 1 assets" filter');
 assert.equal(r.find(byType('Segmented')).props.value, 'all');
 r.fire(option('Stock'), 'onClick');
 assert.deepEqual(scrolled, ['asset-account-section', 'asset-holdings']);
 assert.equal(r.find(byType('Segmented')).props.value, 'Stock');
 assert.equal(option('Stock').props['aria-pressed'], true);
 // The donut's slice does the same as the row.
 r.fire(r.find(byType(AllocationDonut)), 'onSelect', 'Cash');
 assert.equal(scrolled.at(-1), 'asset-account-section', 'cash held in a brokerage account is on the account card');
});

test('an account card’s Holdings count is the list and total under it, cash rows included', () => {
 r.mount(React.createElement(AssetDashboard, props));
 const card = r.find(node => node.type === 'article' && node.props['data-id'] === 'broker');
 assert.equal(card.children[0], '2', 'the stock and the cash balance held in the account');
});
