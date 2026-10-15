import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { byType, createRenderer, event, hostModule, stubs, text, walk } from './helpers/component-tree.mjs';

// Record payment of a USD salary, with USD and UZS preferred, at 10,000 UZS to the dollar.
const r = createRenderer();
const ui = stubs();
const { AccountOperation } = r.load('components/planning/account-operation.tsx', {
 ...ui.modules,
 '@/hooks/use-dated-exchange-rate': { useDatedExchangeRate: (from, to) => ({ rate: !from || !to ? null : from === 'UZS' ? 0.0001 : 10000, loading: false }) },
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
 r.mount(React.createElement(AccountOperation, { operation: { action: 'occurrence', target_id: 'epam', date: '2026-10-05', amount: 3450 }, records, currencies: ['USD', 'UZS'], save: async (action, data) => { saved.push([action, data]); }, onClose() {} }));
 const select = label => [...walk(r.tree)].find(node => node.type === 'label' && text(node).startsWith(label)).children.flatMap(child => [...walk([child])]).find(byType(ui.NativeSelect));
 const amount = () => [...walk(r.tree)].find(byType(ui.FormattedNumberInput)).props.value;
 const submit = async () => { await r.fireAsync(r.find(node => node.type === 'form'), 'onSubmit', event()); return saved.at(-1)[1]; };
 return { select, amount, submit, find: () => [...walk(r.tree)] };
}

test('a scheduled payment may be typed in the currency it arrived in, as entered in an account of that currency', async () => {
 const view = open();
 const currency = view.select('Currency');
 assert.deepEqual(currency.props.children.map(option => option.props.value), ['USD', 'UZS'], 'the schedule\'s currency, then the account\'s and the preferred ones');
 assert.equal(currency.props.value, 'USD');
 assert.equal(currency.props.disabled, false);
 // Another currency is typed as it arrived; the schedule's brings its amount back.
 r.fire(currency, 'onChange', { target: { value: 'UZS' } });
 assert.equal(view.amount(), 0);
 r.fire(view.find().find(byType(ui.FormattedNumberInput)), 'onValueChange', 30155000);
 assert.equal(view.find().some(node => node.props?.className === 'fx'), false, 'no rate is needed for the account\'s own currency');
 const data = await view.submit();
 assert.equal(data.currency, 'UZS');
 assert.equal(data.amount, 30155000);
 assert.equal('exchange_rate' in data, false);
});

test('a payment in the schedule currency is sent as before, with the rate', async () => {
 const view = open();
 const data = await view.submit();
 assert.equal('currency' in data, false);
 assert.equal(data.amount, 3450);
 assert.equal(data.exchange_rate, 0.0001);
});

test('sum paid into a dollar account keeps its currency and moves the account at the day\'s rate', async () => {
 const view = open();
 r.fire(view.select('Cash account'), 'onChange', { target: { value: 'wallet' } });
 const currency = view.select('Currency');
 assert.deepEqual(currency.props.children.map(option => option.props.value), ['USD', 'UZS'], 'UZS stays on offer for a USD account');
 r.fire(currency, 'onChange', { target: { value: 'UZS' } });
 r.fire(view.find().find(byType(ui.FormattedNumberInput)), 'onValueChange', 13320000);
 assert.ok(view.find().some(node => node.props?.className === 'fx'), 'the rate is shown');
 const data = await view.submit();
 assert.deepEqual([data.currency, data.amount, data.exchange_rate, data.account_id], ['UZS', 13320000, 10000, 'wallet']);
});
