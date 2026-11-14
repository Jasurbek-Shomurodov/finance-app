import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, stubs, text } from './helpers/component-tree.mjs';

// The debt payoff planner asks for a debt before it plans; with one it compares both methods side by side.
const r = createRenderer();
const ui = stubs();
const { DebtPayoffPanel } = r.load('components/planning/debt-payoff-panel.tsx', {
 ...ui.modules, '@/components/presentation-foundation/resource-state': { ResourceState: ({ children }) => children }, '@/components/presentation-foundation/rolling-text': { RollingText: ({ text: value }) => value },
 '@/components/discard-changes': { useUnsavedNavigation: () => null },
 '@/components/loans/loans-lazy': { PayoffChart: ({ points }) => React.createElement('figure', { 'data-points': points.length, 'data-guide': points.some(point => point.minimums !== null) }) },
 '@/components/presentation-foundation/record-icon': { RecordIcon: () => null },
});
const card = { id: 'card', name: 'Card', kind: 'Debt', currency: 'USD', amount: 1200, rate: 24, estimated_monthly_payment: 100, date: '2026-01-01' };
const car = { id: 'car', name: 'Car', kind: 'Loan', currency: 'USD', amount: 600, rate: 5, estimated_monthly_payment: 100, date: '2026-01-01' };
const mount = (records, saved) => { r.mount(React.createElement(DebtPayoffPanel, { records, currency: 'USD', today: '2026-10-10', preferences: { data: { preferences: saved ? [{ key: 'debt_plan', data: saved }] : [] }, loading: false, error: '', retry() {}, save: async () => {} } })); return text(r.tree); };

test('without a debt the planner asks for one; with debts it shows the date, both methods and the order they clear', () => {
 const empty = mount([]);
 assert.ok(empty.includes('Add a debt to compare payoff strategies.'), empty);
 assert.ok(!empty.includes('Payoff order') && !empty.includes('Payoff method'), empty);
 const planned = mount([card, car]);
 for (const label of ['Estimated debt-free date', 'Estimated interest', 'Monthly payment budget', 'Balance owed', 'Payoff order', 'Highest interest first', 'Smallest balance first', 'Save plan']) assert.ok(planned.includes(label), label);
 // No extra payment: nothing to compare against minimums, and no debt is named as getting the extra.
 assert.ok(!planned.includes('Minimums only') && !planned.includes('Gets the extra payment first') && !planned.includes('with minimums only'), planned);
 assert.equal(r.find(element => element.type === 'figure').props['data-guide'], false);
});

test('an extra payment is compared with minimums only, and the method decides which debt gets it first', () => {
 const avalanche = mount([card, car], { currency: 'USD', extra: 200, method: 'avalanche', payments: {} });
 assert.ok(avalanche.includes('Minimums only') && avalanche.includes('with minimums only') && avalanche.includes('less than minimums only'), avalanche);
 assert.ok(avalanche.includes('$200 minimums + $200 extra'), avalanche);
 assert.equal(r.find(element => element.type === 'figure').props['data-guide'], true);
 const first = html => html.slice(html.indexOf('Payoff order')).match(/(Card|Car)[^C]*Gets the extra payment first/)?.[1];
 assert.equal(first(avalanche), 'Card', 'the 24% card before the 5% car');
 assert.equal(first(mount([card, car], { currency: 'USD', extra: 200, method: 'snowball', payments: {} })), 'Car', 'the smaller balance first');
 // A plan saved in another currency does not apply to this one.
 assert.ok(!mount([card, car], { currency: 'EUR', extra: 200, method: 'snowball', payments: {} }).includes('Gets the extra payment first'));
});
