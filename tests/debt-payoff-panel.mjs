import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, stubs, text } from './helpers/component-tree.mjs';

// The debt payoff planner says nothing about an alternative method until there is a debt to plan (CR 2026-10-23, item 49).
const r = createRenderer();
const ui = stubs();
const { DebtPayoffPanel } = r.load('components/planning/debt-payoff-panel.tsx', {
 ...ui.modules, '@/components/presentation-foundation/resource-state': { ResourceState: ({ children }) => children }, '@/components/presentation-foundation/rolling-text': { RollingText: ({ text: value }) => value },
 '@/components/discard-changes': { useUnsavedNavigation: () => null },
});
const preferences = { data: { preferences: [] }, loading: false, error: '', retry() {}, save: async () => {} };
const mount = records => { r.mount(React.createElement(DebtPayoffPanel, { records, currency: 'USD', today: '2026-10-10', preferences })); return text(r.tree); };

test('without a debt the planner asks for one and shows no alternative method; with one it compares both', () => {
 const empty = mount([]);
 assert.ok(empty.includes('Add a debt to compare payoff strategies.'), empty);
 assert.ok(!empty.includes('Alternative method'), empty);
 const planned = mount([{ id: 'card', name: 'Card', kind: 'Debt', currency: 'USD', amount: 1200, rate: 18, estimated_monthly_payment: 100, date: '2026-01-01' }]);
 assert.ok(planned.includes('Alternative method:') && planned.includes('Estimated debt-free date'), planned);
});
