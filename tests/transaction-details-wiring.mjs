import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, host, text } from './helpers/component-tree.mjs';

const t = (message, values = {}) => message.replace(/\{(\w+)\}/g, (_, key) => String(values[key]));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const entry = (id, name, kind, extra = {}) => ({ id, name, kind, currency: 'USD', amount: 10, quantity: 1, cost: 0, rate: 0, date: '2026-11-11', frequency: 'Once', notes: '', ...extra });
const home = entry('m', 'Home', 'Mortgage'), wallet = entry('w', 'Wallet', 'Cash');
const source = { id: 'p', mortgage_id: 'm', principal: 4, interest: 6, date: '2026-11-11', notes: '', account_id: 'w' };

/** The two workspace pieces over a stubbed workspace; `calls` records what they asked it to do. */
function open(viewing, { editingPayment = null, readOnly = false, demo = false, load = async () => source, records = [home, wallet] } = {}) {
 const r = createRenderer(), calls = [], errors = [];
 const state = { viewing, editingPayment };
 const workspace = () => ({
  ...state, readOnly, demo, planning: { data: { records, categories: [{ id: 'c', name: 'Housing', direction: 'expense' }] } }, removedCategories: { kinds: ['Charity'] },
  businessList: [], tags: { data: { tags: [], links: [{ record_id: viewing?.id, tag_id: 'tag' }] }, change: async () => {}, save: async () => {} }, attachments: { available: true, refresh() {} },
  transactionTools: { data: { splits: [] }, loading: false, error: '' }, household: { state: null },
  setViewing: value => { state.viewing = value; calls.push(['viewing', value]); }, setSplitting: record => calls.push(['split', record.id]), setTracking: record => calls.push(['tracking', record.id]),
  setEditingPayment: value => { state.editingPayment = value; calls.push(['editingPayment', value]); },
  assignTransactionsBusiness: async () => 1, categorize: async (ids, choice) => { calls.push(['categorize', ids, choice]); return 1; },
  editRecord: record => calls.push(['edit', record.id]), requestDelete: record => calls.push(['delete', record.id]),
  mortgagePaymentSource: load, editMortgagePayment: async payment => { calls.push(['save', payment]); },
 });
 const hooks = r.load('hooks/use-mortgage-payment-source.ts', {});
 const parts = r.load('components/workspace/transaction-details.tsx', {
  '@/components/workspace/workspace-lazy': { TransactionDetailsDialog: host('details'), PaymentDialog: host('payment-form') },
  '@/components/record-attachments': { RecordAttachments: host('attachments') },
  '@/components/language-provider': { useLanguage: () => ({ t, locale: 'en-US' }) },
  '@/components/workspace/workspace-provider': { useWorkspace: workspace },
  '@/hooks/use-mortgage-payment-source': hooks,
  '@/lib/feedback': { showError: message => errors.push(message) },
 });
 return { r, calls, errors, parts, state };
}
const details = view => view.r.all(node => node.type === 'details')[0];

test('a mortgage payment\'s details name its mortgage and its account once the payment is read, and its Edit opens the payment form', async () => {
 const payment = entry('p', 'Home', 'Other expense', { mortgage_payment_id: 'p', payment_principal: 4, payment_interest: 6 });
 const view = open(payment);
 view.r.mount(React.createElement(view.parts.WorkspaceTransactionDetails));
 // Before the payment is read the row's own name stands in, and there is nothing to open yet.
 assert.equal(details(view).props.origin.label, 'Payment on Home');assert.equal(details(view).props.origin.onOpen, undefined);
 assert.equal(details(view).props.accountName, undefined);
 await flush();view.r.update();
 const props = details(view).props;
 assert.equal(props.accountName, 'Wallet');assert.equal(props.editable, true);
 assert.deepEqual(props.tagging.tagIds, ['tag']);
 assert.deepEqual([props.categoryEditing.categories.length, props.categoryEditing.removed], [1, ['Charity']]);
 assert.equal(await props.categoryEditing.onChange({ kind: 'Living expense', category_id: null }), 1);
 assert.deepEqual(view.calls.at(-1), ['categorize', ['p'], { kind: 'Living expense', category_id: null }]);
 assert.equal(props.onSplit, undefined, 'a payment is not split');
 props.origin.onOpen();
 assert.deepEqual(view.calls.slice(-2), [['viewing', null], ['tracking', 'm']]);
 view.state.viewing = payment;view.r.update();
 details(view).props.onEdit();
 assert.deepEqual(view.calls.slice(-2), [['viewing', null], ['edit', 'p']]);
 view.state.viewing = payment;view.r.update();
 details(view).props.onDelete();
 assert.deepEqual(view.calls.at(-1), ['delete', 'p']);
});

test('other linked transactions say where they came from; a plain one edits, splits and has no source line', () => {
 const fee = open(entry('f', 'Transfer fee', 'Other expense', { operation_id: 'op', account_id: 'w' }));
 fee.r.mount(React.createElement(fee.parts.WorkspaceTransactionDetails));
 assert.equal(details(fee).props.origin.label, 'Transfer or repayment fee. To change the amount or date, delete it and record it again.');
 assert.equal(details(fee).props.editable, false);assert.equal(details(fee).props.accountName, 'Wallet');
 assert.ok(details(fee).props.categoryEditing, 'its category still changes');
 const plain = open(entry('x', 'Shop', 'Living expense'));
 plain.r.mount(React.createElement(plain.parts.WorkspaceTransactionDetails));
 assert.equal(details(plain).props.origin, undefined);assert.equal(details(plain).props.editable, true);
 details(plain).props.onSplit();
 assert.deepEqual(plain.calls.slice(-2), [['viewing', null], ['split', 'x']]);
 details(plain).props.onClose();
 assert.deepEqual(plain.calls.at(-1), ['viewing', null]);
 // A viewer of a shared workspace sees the category without the picker; nothing is rendered with nothing open.
 const viewer = open(entry('x', 'Shop', 'Living expense'), { readOnly: true });
 viewer.r.mount(React.createElement(viewer.parts.WorkspaceTransactionDetails));
 assert.equal(details(viewer).props.categoryEditing, undefined);
 const closed = open(null);
 closed.r.mount(React.createElement(closed.parts.WorkspaceTransactionDetails));
 assert.equal(closed.r.all(node => node.type === 'details').length, 0);
});

test('Edit on a payment opens its form on the payment\'s own values; a payment that cannot be read says so and closes', async () => {
 const payment = entry('p', 'Home', 'Other expense', { mortgage_payment_id: 'p', custom_category_id: 'c' });
 const view = open(null, { editingPayment: payment });
 view.r.mount(React.createElement(view.parts.MortgagePaymentEditor));
 assert.equal(view.r.all(node => node.type === 'payment-form').length, 0, 'nothing shows until the payment is read');
 await flush();view.r.update();
 const form = view.r.all(node => node.type === 'payment-form')[0].props;
 // The one Record payment dialog, opened on the recorded payment: its values and its own category.
 assert.deepEqual([form.plan.kind, form.plan.target.id, form.plan.editing, form.plan.category], ['mortgage', 'm', source, { kind: 'Other expense', category_id: 'c' }]);
 await form.saves.edit({ ...source, principal: 5 });
 assert.deepEqual(view.calls.at(-1), ['save', { ...source, principal: 5 }]);
 form.onClose();
 assert.deepEqual(view.calls.at(-1), ['editingPayment', null]);
 const failed = open(null, { editingPayment: payment, load: async () => { throw Error('Could not load the payment.'); } });
 failed.r.mount(React.createElement(failed.parts.MortgagePaymentEditor));
 await flush();failed.r.update();
 assert.deepEqual(failed.errors, ['Could not load the payment.']);assert.deepEqual(failed.calls.at(-1), ['editingPayment', null]);
 // The mortgage is not among the records (deleted meanwhile): the same, in plain words.
 const orphan = open(null, { editingPayment: payment, records: [wallet] });
 orphan.r.mount(React.createElement(orphan.parts.MortgagePaymentEditor));
 await flush();orphan.r.update();
 assert.deepEqual(orphan.errors, ['Mortgage not found.']);
});

test('an address the workspace does not have shows one line and the way back', () => {
 const r = createRenderer();
 const { NotFoundPage } = r.load('components/not-found-page.tsx', {
  'next/link': { __esModule: true, default: host('a') }, 'lucide-react': { Compass: host('compass') },
  '@/components/language-provider': { useLanguage: () => ({ t }) },
  '@/components/presentation-foundation/empty-state': { EmptyState: host('empty') }, '@/components/ui/button': { Button: host('button') },
 });
 r.mount(React.createElement(NotFoundPage));
 const empty = r.all(node => node.type === 'empty')[0];
 assert.deepEqual([empty.props.title, empty.props.description], ['Page not found', 'This address does not open anything here.']);
 assert.equal(r.all(node => node.type === 'a')[0].props.href, '/');
 assert.equal(text(r.all(node => node.type === 'a')[0]), 'Dashboard');
});

test('the workspace\'s not-found route renders that page inside the shell', () => {
 const r = createRenderer();
 const page = r.load('app/(workspace)/not-found.tsx', { '@/components/not-found-page': { NotFoundPage: host('not-found') } });
 r.mount(React.createElement(page.default));
 assert.equal(r.all(node => node.type === 'not-found').length, 1);
});

test('the details open the Tracker of the account and the business and Transactions for the category; the sample workspace has no Tracker to open', () => {
 const shop = entry('b', 'Corner shop', 'Business'), sale = entry('s', 'Sale', 'Business income', { account_id: 'w', business_id: 'b' });
 const view = open(sale, { records: [home, wallet, shop] });
 view.r.mount(React.createElement(view.parts.WorkspaceTransactionDetails));
 const { opens } = details(view).props;
 opens.account();opens.business('b')();
 assert.deepEqual(view.calls.filter(call => call[0] === 'tracking'), [['tracking', 'w'], ['tracking', 'b']]);
 assert.equal(view.calls.filter(call => call[0] === 'viewing').length, 2, 'the details close first');
 assert.equal(opens.business('missing'), undefined);assert.equal(opens.property, undefined);
 assert.equal(opens.categoryHref('Business income'), '/transactions?category=Business+income');
 const sample = open(sale, { records: [home, wallet, shop], demo: true });
 sample.r.mount(React.createElement(sample.parts.WorkspaceTransactionDetails));
 assert.equal(details(sample).props.opens.account, undefined);
});
