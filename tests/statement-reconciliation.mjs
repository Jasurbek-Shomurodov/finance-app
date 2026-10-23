import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { byType, createRenderer, hostModule, stubs, text } from './helpers/component-tree.mjs';

// Statement reconciliation adds entered amounts exactly (CR 2026-10-23, item 5 / MONEY-004).
const r = createRenderer();
const ui = stubs();
const entries = [{ key: 'a', date: '2026-10-02', name: 'Coffee', amount: 0.1 }, { key: 'b', date: '2026-10-03', name: 'Tea', amount: 0.2 }];
const { StatementReconciliation } = r.load('components/planning/statement-reconciliation.tsx', {
 ...ui.modules, '@/components/presentation-foundation/loading-placeholder': hostModule(), '@/components/presentation-foundation/inline-error': hostModule(),
 '@/hooks/use-owner-resource': { useOwnerResource: () => ({ data: { entries, fingerprint: 'f', saved: [] }, loading: false, error: '', retry() {}, invalidate() {} }) },
 '@/components/discard-changes': { useDiscardChanges: () => ({ close() {}, confirmation: null }) }, '@/lib/feedback': { showSaved() {} }, '@/lib/api-client': { requestJson: async () => ({}) },
});
const account = { id: 'acc', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 10 };

test('0.1 + 0.2 cleared against a closing balance of 0.3 is no difference at all, and the statement can be reconciled', () => {
 r.mount(React.createElement(StatementReconciliation, { account, owner: null, onClose() {}, onSaved() {} }));
 r.fire(r.find(byType(ui.Button, 'Start statement review')), 'onClick');
 const [, closing] = r.all(byType(ui.FormattedNumberInput));
 r.fire(closing, 'onValueChange', 0.3);
 const boxes = () => r.all(node => node.type === 'input' && node.props.type === 'checkbox');
 for (let index = 0; index < boxes().length; index++) r.fire(boxes()[index], 'onChange', { target: { checked: true } });
 const shown = text(r.tree);
 assert.ok(shown.includes('Cleared balance: $0') && shown.includes('Difference: $0'), shown);
 assert.ok(!shown.includes('A fractional difference remains'), 'no floating-point tail is reported as a difference');
 assert.equal(r.find(byType(ui.Button, 'Reconcile statement')).props.disabled, false);
 // A real cent off is still a difference and keeps Reconcile disabled.
 r.fire(closing, 'onValueChange', 0.31);
 assert.ok(text(r.tree).includes('A fractional difference remains'));
 assert.equal(r.find(byType(ui.Button, 'Reconcile statement')).props.disabled, true);
});
