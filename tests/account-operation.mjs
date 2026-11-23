import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { byType, createRenderer, event, hostModule, stubs, text } from './helpers/component-tree.mjs';

const r = createRenderer(), ui = stubs();
const guards = [];
globalThis.crypto ??= { randomUUID: () => 'op-1' };
const { AccountOperation } = r.load('components/planning/account-operation.tsx', {
 ...ui.modules,
 '@/components/ui/textarea': hostModule(),
 '@/components/discard-changes': { useDiscardChanges: (dirty, onClose, busy) => ({ close: () => guards.push([dirty, busy]), confirmation: null }) },
 '@/lib/deposit-interest': { depositToday: () => '2026-11-23' },
});
const account = (id, amount, kind = 'Cash') => ({ id, name: id, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date: '2026-01-01', frequency: 'Once', notes: '' });
const records = [account('Wallet', 1000), account('Card', 0), account('Savings', 500, 'Deposit')];
const save = () => r.find(byType(ui.Button));
const footer = () => r.find(byType(ui.FormFooter));
const submit = () => r.fireAsync(r.find(byType('form')), 'onSubmit', event());

test('Adjust balance records the statement balance of one cash account, today, as neither income nor spending', async () => {
 const saved = [], closed = [];
 r.mount(React.createElement(AccountOperation, { operation: { action: 'reconcile', account_id: 'Wallet', amount: 1000 }, records, save: async (...args) => { saved.push(args); }, onClose: () => closed.push(true) }));
 assert.match(text(r.tree), /Adjust balance/);
 // Only cash accounts are offered; the account it was opened from is chosen with its balance.
 assert.deepEqual(r.all(byType('option')).map(option => option.props.value), ['', 'Wallet', 'Card']);
 assert.equal(r.find(byType(ui.FormattedNumberInput)).props.value, 1000);
 assert.equal(save().props.disabled, false);
 r.fire(r.find(byType(ui.FormattedNumberInput)), 'onValueChange', 940, false);
 r.fire(r.find(byType('Textarea')), 'onChange', { target: { value: 'Counted' } });
 await submit();
 assert.equal(saved.length, 1);assert.equal(saved[0][0], 'reconcile');
 const { id, ...sent } = saved[0][1];
 assert.ok(id);
 assert.deepEqual(sent, { account_id: 'Wallet', target_id: null, date: '2026-11-23', amount: 940, fee: 0, notes: 'Counted', received: 0 });
 assert.deepEqual(closed, [true]);
});

test('a statement balance belongs to one account and must be typed; a refusal stays in the dialog', async () => {
 const closed = [];
 const failure = Object.assign(Error('Could not save the adjustment.'), { confirmedFailure: true });
 r.mount(React.createElement(AccountOperation, { operation: { action: 'reconcile' }, records, save: async () => { throw failure; }, onClose: () => closed.push(true) }));
 // No account yet: Save waits and says why in words.
 assert.equal(footer().props.blocked, 'Choose a cash account.');assert.equal(save().props.disabled, true);
 // Choosing an empty account leaves the balance to be typed, never carried over from another account.
 r.fire(r.find(byType(ui.NativeSelect)), 'onChange', { target: { value: 'Card' } });
 assert.equal(footer().props.blocked, undefined);assert.equal(save().props.disabled, true, 'a blank balance would empty the account');
 r.fire(r.find(byType(ui.NativeSelect)), 'onChange', { target: { value: 'Wallet' } });
 assert.equal(r.find(byType(ui.FormattedNumberInput)).props.value, 1000);assert.equal(save().props.disabled, false);
 await submit();
 assert.equal(closed.length, 0);
 assert.equal(r.find(byType(ui.ErrorPopup)).props.message, 'Could not save the adjustment.');
 assert.equal(text(save()), 'Save', 'a confirmed failure can be saved again');
 // Cancel asks through the discard guard, which knows the form changed.
 r.fire(footer(), 'onCancel');
 assert.deepEqual(guards.at(-1), [true, false]);
});
