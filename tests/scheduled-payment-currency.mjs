import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { byType, createRenderer, event, hostModule, stubs, text, walk } from './helpers/component-tree.mjs';

// Record payment of a USD salary into a UZS cash account, at 10,000 UZS to the dollar.
const r = createRenderer();
const ui = stubs();
const { AccountOperation } = r.load('components/planning/account-operation.tsx', {
 ...ui.modules,
 '@/hooks/use-dated-exchange-rate': { useDatedExchangeRate: (from, to) => ({ rate: from && to ? 0.0001 : null, loading: false }) },
 '@/components/discard-changes': { useDiscardChanges: (dirty, close) => ({ close, confirmation: null }) },
 '@/components/planning/recurring-rows': { useDueLabel: () => () => 'Today' },
 '@/lib/payment-account': { suggestedPaymentAccount: () => 'sum' },
 'lucide-react': hostModule(),
});
const records = [
 { id: 'sum', name: 'Cash', kind: 'Cash', currency: 'UZS', amount: 5000000, date: '2026-01-01' },
 { id: 'wallet', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 100, date: '2026-01-01' },
 { id: 'epam', name: 'EPAM Systems', kind: 'Salary', currency: 'USD', amount: 3450, date: '2026-01-05', frequency: 'Monthly' },
];
function open() {
 const saved = [];
 r.mount(React.createElement(AccountOperation, { operation: { action: 'occurrence', target_id: 'epam', date: '2026-10-05', amount: 3450 }, records, save: async (action, data) => { saved.push([action, data]); }, onClose() {} }));
 const select = label => [...walk(r.tree)].find(node => node.type === 'label' && text(node).startsWith(label)).children.flatMap(child => [...walk([child])]).find(byType(ui.NativeSelect));
 const amount = () => [...walk(r.tree)].find(byType(ui.FormattedNumberInput)).props.value;
 const submit = async () => { await r.fireAsync(r.find(node => node.type === 'form'), 'onSubmit', event()); return saved.at(-1)[1]; };
 return { select, amount, submit, find: () => [...walk(r.tree)] };
}

test('a scheduled payment may be typed in the cash account currency, as it arrived', async () => {
 const view = open();
 const currency = view.select('Currency');
 assert.deepEqual(currency.props.children.map(option => option.props.value), ['USD', 'UZS'], 'the schedule\'s currency, then the account\'s');
 assert.equal(currency.props.value, 'USD');
 // Switching carries the amount over at the day's rate, in whole sum.
 r.fire(currency, 'onChange', { target: { value: 'UZS' } });
 assert.equal(view.amount(), 34500000);
 assert.equal(view.find().some(node => node.props?.className === 'fx'), false, 'no rate is needed for the account\'s own currency');
 const data = await view.submit();
 assert.equal(data.currency, 'UZS');
 assert.equal(data.amount, 34500000);
 assert.equal('exchange_rate' in data, false);
});

test('a payment in the schedule currency is sent as before, with the rate', async () => {
 const view = open();
 const data = await view.submit();
 assert.equal('currency' in data, false);
 assert.equal(data.amount, 3450);
 assert.equal(data.exchange_rate, 0.0001);
});

test('another cash account in the schedule currency takes the payment back to it', () => {
 const view = open();
 r.fire(view.select('Currency'), 'onChange', { target: { value: 'UZS' } });
 r.fire(view.select('Cash account'), 'onChange', { target: { value: 'wallet' } });
 const currency = view.select('Currency');
 assert.equal(currency.props.value, 'USD');
 assert.equal(currency.props.disabled, true, 'one currency to choose from');
 assert.equal(view.amount(), 0, 'the sum typed for the other account is not read as dollars');
});
