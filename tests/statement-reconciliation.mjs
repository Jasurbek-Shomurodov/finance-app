import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { byType, createRenderer, hostModule, stubs, text } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';

const r = createRenderer();
const ui = stubs();
const entries = [{ key: 'a', date: '2026-10-02', name: 'Coffee', amount: -0.1 }, { key: 'b', date: '2026-10-03', name: 'Tea', amount: -0.2 }];
const reconciled = { id: 's1', account_id: 'acc', start_date: '2026-09-01', end_date: '2026-09-30', opening_balance: 10, closing_balance: 10.3, cleared: ['z'], fingerprint: 'old', status: 'reconciled', revision: 1 };
let review;
const base = () => ({ entries, fingerprint: 'f', saved: [], from: '2026-10-01', to: '2026-10-31', balance_before: 10.3, balance_at_end: 9, previous: null, changes: {} });
const { StatementReconciliation } = r.load('components/planning/statement-reconciliation.tsx', {
 ...ui.modules, '@/components/presentation-foundation/loading-placeholder': hostModule(), '@/components/presentation-foundation/inline-error': hostModule(),
 '@/hooks/use-owner-resource': { useOwnerResource: () => ({ data: review, loading: false, error: '', retry() {}, invalidate() {} }) },
 '@/components/discard-changes': { useDiscardChanges: () => ({ close() {}, confirmation: null }) }, '@/lib/feedback': { showSaved() {} }, '@/lib/api-client': { requestJson: async () => ({}) },
});
const account = { id: 'acc', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 10 };
const mount = () => r.mount(React.createElement(StatementReconciliation, { account, owner: null, onClose() {}, onSaved() {} }));
const boxes = () => r.all(node => node.type === 'input' && node.props.type === 'checkbox');

// Statement reconciliation adds entered amounts exactly (CR 2026-10-23, item 5 / MONEY-004).
test('0.1 + 0.2 cleared against a closing balance of 0.3 less is no difference at all, and the statement can be reconciled', () => {
 review = base(); mount();
 r.fire(r.find(byType(ui.Button, 'Start statement review')), 'onClick');
 const inputs = () => r.all(byType(ui.FormattedNumberInput));
 r.fire(inputs()[0], 'onValueChange', 0.3);
 for (let index = 0; index < boxes().length; index++) r.fire(boxes()[index], 'onChange', { target: { checked: true } });
 const shown = text(r.tree);
 assert.ok(shown.includes('Cleared balance$0') && shown.includes('Difference$0'), shown);
 assert.ok(!shown.includes('A fractional difference remains'), 'no floating-point tail is reported as a difference');
 assert.equal(r.find(byType(ui.Button, 'Reconcile statement')).props.disabled, false);
 // A real cent off is still a difference and keeps Reconcile disabled.
 r.fire(inputs()[1], 'onValueChange', 0.01);
 assert.ok(text(r.tree).includes('A fractional difference remains'));
 assert.equal(r.find(byType(ui.Button, 'Reconcile statement')).props.disabled, true);
});

test('a new statement after a reconciled one opens at its closing balance and says how far the account is reconciled', () => {
 review = { ...base(), saved: [reconciled], previous: { id: 's1', end_date: '2026-09-30', closing_balance: 10.3 } }; mount();
 const shown = text(r.tree);
 assert.ok(shown.includes('Reconciled through 30 September 2026'), shown);
 assert.ok(r.all(node => node.props?.className === 'status-badge is-paid').length >= 1);
 r.fire(r.find(byType(ui.Button, 'Start statement review')), 'onClick');
 assert.equal(r.all(byType(ui.FormattedNumberInput))[0].props.value, 10.3);
 assert.ok(text(r.tree).includes('From the statement reconciled through 30 September 2026'));
});

test('a reconciled statement whose entries changed needs review and names each change', () => {
 review = { ...base(), saved: [reconciled], changes: { s1: [
  { key: 'z', name: 'Rent', was_date: '2026-09-05', was_amount: -500, now_date: '2026-09-05', now_amount: -550 },
  { key: 'y', name: 'Taxi', was_date: '2026-09-06', was_amount: -5, now_date: null, now_amount: null },
  { key: 'x', name: 'Gym', was_date: '2026-09-07', was_amount: -9, now_date: '2026-10-02', now_amount: -9 },
 ] } };
 mount();
 assert.ok(text(r.tree).includes('Needs review'));
 r.fire(r.find(byType(ui.Button, 'Open')), 'onClick');
 r.fire(r.find(byType(ui.Button, 'Review statement')), 'onClick');
 const shown = text(r.tree);
 for (const part of ['Changed since this statement was reconciled', '−$550', 'Was −$500', 'Removed from this account', 'Now dated 2 October 2026']) assert.ok(shown.includes(part), part + ' in ' + shown);
});

test('the figures explain the app balance: cleared, pending and changes with no entry', () => {
 const { statementFigures, openingBalance, statementStatus, latestReconciled } = loadTS('lib/statement-reconciliation.ts');
 // Opening 100; cleared -30.1; pending -0.2; the app says 69.5, so 0.2 is a balance change with no entry.
 const legs = [{ key: 'a', amount: -30.1 }, { key: 'b', amount: -0.2 }];
 assert.deepEqual({ ...statementFigures(legs, ['a'], 100, 69.9, 69.5) }, { clearedBalance: 69.9, pending: -0.2, difference: 0, withoutEntry: -0.2 });
 assert.equal(statementFigures(legs, [], 0, 0, 0).clearedBalance, 0);
 assert.equal(openingBalance({ previous: { id: 's', end_date: '2026-09-30', closing_balance: 5 }, from: '2026-10-01' }), 5);
 assert.equal(openingBalance({ previous: { id: 's', end_date: '2026-09-29', closing_balance: 5 }, from: '2026-10-01' }), null, 'a gap is typed, not carried');
 assert.equal(openingBalance({ previous: null, from: '2026-10-01' }), null);
 assert.equal(statementStatus({ id: 's', status: 'draft' }, { s: [{}] }), 'draft');
 assert.equal(statementStatus({ id: 's', status: 'reconciled' }, { s: [{}] }), 'changed');
 assert.equal(statementStatus({ id: 's', status: 'reconciled' }, {}), 'reconciled');
 assert.equal(latestReconciled([{ id: 'a', status: 'reconciled', end_date: '2026-08-31' }, { id: 'b', status: 'draft', end_date: '2026-10-31' }, { id: 'c', status: 'reconciled', end_date: '2026-09-30' }]).id, 'c');
 assert.equal(latestReconciled([]), null);
});
