import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createRenderer, hostModule, language } from './helpers/component-tree.mjs';
const { drillFlows, accountChanges } = loadTS('lib/cash-flow-drill.ts');
const { cashFlowReport, sankeyFlows } = loadTS('lib/cash-flow-report.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const accounts = [record('card', 'Card', 'Cash', 0, '2026-01-01', { frequency: 'Monthly' }), record('save', 'Savings account', 'Cash', 0, '2026-01-01', { frequency: 'Monthly' }), record('loan', 'Car loan', 'Loan', 5000, '2026-01-01', { frequency: 'Monthly' }), record('home', 'Home', 'Mortgage', 90000, '2026-01-01', { frequency: 'Monthly' })];
const context = (records, activity = [], extra = {}) => ({ data: { records: [...accounts, ...records], activity, investmentLinks: [] }, splits: [], months: ['2026-08'], currency: 'USD', today: '2026-08-31', rates: { USD: 1, EUR: 0.5 }, t: key => key, ...extra });
const shape = flows => flows.links.map(link => [flows.nodes[link.source].name, flows.nodes[link.target].name, link.value]);

test('a tapped spending category shows its merchants, and an income category its payers, adding up to its Cash flow total', () => {
 const records = [
  record('a', 'Market', 'Living expense', 120, '2026-08-02'), record('b', 'Market', 'Living expense', 30, '2026-08-09'), record('c', 'Cafe', 'Living expense', 50, '2026-08-10'),
  record('d', 'Gift', 'Charity', 70, '2026-08-11'), record('e', 'EPAM', 'Salary', 2000, '2026-08-05'), record('f', 'Bonus', 'Salary', 100, '2026-08-25', { currency: 'EUR' }),
  record('g', 'Later', 'Living expense', 999, '2026-09-01'),
 ];
 const spending = drillFlows({ side: 'expense', key: 'Living expense' }, 'Living expense', 0, context(records));
 assert.deepEqual(shape(spending), [['Living expense', 'Market', 150], ['Living expense', 'Cafe', 50]], 'merchants grouped by name, other categories and months left out');
 const report = cashFlowReport({ records, activity: [], investmentLinks: [], categories: [] }, [], ['2026-08'], 'USD', '2026-08-31', { USD: 1, EUR: 0.5 });
 assert.equal(spending.links.reduce((sum, link) => sum + link.value, 0), report.categories.expense.find(item => item.key === 'Living expense').amount);
 const pay = drillFlows({ side: 'income', key: 'Salary' }, 'Salary', 0, context(records));
 assert.deepEqual(shape(pay), [['EPAM', 'Salary', 2000], ['Bonus', 'Salary', 200]], 'payers flow into the category, EUR 100 at 0.5 per dollar');
 const unconverted = drillFlows({ side: 'income', key: 'Salary' }, 'Salary', 0, context(records, [], { rates: { USD: 1 } }));
 assert.equal(unconverted.missing, 1, 'a payment without a rate is counted as missing, never shown under the wrong currency');
 assert.deepEqual(shape(unconverted), [['EPAM', 'Salary', 2000]]);
 const many = Array.from({ length: 12 }, (_, index) => record('m' + index, 'Shop ' + index, 'Other expense', 100 - index, '2026-08-03'));
 const folded = drillFlows({ side: 'expense', key: 'Other expense' }, 'Other expense', 0, context(many));
 assert.equal(folded.nodes.length, 11, 'the category, nine merchants and Other');
 assert.equal(folded.nodes.at(-1).name, 'Other');
});

test('savings flow to the accounts that grew and the debts paid down, fed by any account drawn down, with the rest not traced', () => {
 const records = [
  record('pay', 'EPAM', 'Salary', 3000, '2026-08-05', { account_id: 'card' }),
  record('food', 'Market', 'Living expense', 500, '2026-08-06', { account_id: 'card' }),
  record('cash', 'Taxi', 'Living expense', 100, '2026-08-07'),
  record('mp', 'Mortgage payment', 'Other expense', 1000, '2026-08-20', { mortgage_payment_id: 'mp', payment_interest: 400, payment_principal: 600 }),
 ];
 const activity = [
  { id: 't1', action: 'transfer', account_id: 'card', target_id: 'save', amount: 1500, received: 1500, fee: 0, occurred_on: '2026-08-10', notes: '', before_balance: 0, after_balance: 0 },
  { id: 'r1', action: 'repayment', account_id: 'card', target_id: 'loan', amount: 300, received: 300, fee: 0, occurred_on: '2026-08-15', notes: '', before_balance: 0, after_balance: 0 },
  { id: 'mp', action: 'mortgage', account_id: 'card', target_id: 'home', amount: 1000, received: 1000, fee: 0, occurred_on: '2026-08-20', notes: '', before_balance: 0, after_balance: 0 },
  { id: 'x', action: 'reconcile', account_id: 'card', target_id: 'card', amount: 999, received: 999, fee: 0, occurred_on: '2026-08-21', notes: '', before_balance: 0, after_balance: 0 },
 ];
 const ctx = context(records, activity);
 const { changes } = accountChanges(ctx);
 // Card: +3000 − 500 − 1500 − 300 − 600 principal − 400 interest = −300; the taxi has no account.
 assert.deepEqual(Object.fromEntries(changes), { card: -300, '': -100, save: 1500, loan: 300, home: 600 });
 const savings = 3000 - 500 - 100 - 400;
 const flows = drillFlows({ side: 'savings' }, 'Savings', savings, ctx);
 assert.deepEqual(shape(flows), [['Cash flow', 'Savings', 2000], ['Card', 'Savings', 300], ['No account', 'Savings', 100], ['Savings', 'Savings account', 1500], ['Savings', 'Home', 600], ['Savings', 'Car loan', 300]]);
 assert.deepEqual(flows.nodes.map(node => node.kind), ['income', 'account', 'untraced', 'savings', 'account', 'debt', 'debt']);
 const into = flows.links.filter(link => link.target === 3).reduce((sum, link) => sum + link.value, 0), out = flows.links.filter(link => link.source === 3).reduce((sum, link) => sum + link.value, 0);
 assert.equal(into, out, 'the middle node balances');
});

test('savings with nothing moved stay where they were earned; a gap the records cannot explain is shown as Not traced', () => {
 const simple = drillFlows({ side: 'savings' }, 'Savings', 800, context([record('pay', 'EPAM', 'Salary', 1000, '2026-08-05', { account_id: 'card' }), record('food', 'Market', 'Living expense', 200, '2026-08-06', { account_id: 'card' })]));
 assert.deepEqual(shape(simple), [['Savings', 'Card', 800]], 'no feeding column when nothing was drawn down');
 const fee = [{ id: 't', action: 'transfer', account_id: 'card', target_id: 'save', amount: 500, received: 490, fee: 10, occurred_on: '2026-08-10', notes: '', before_balance: 0, after_balance: 0 }];
 const gap = drillFlows({ side: 'savings' }, 'Savings', 800, context([record('pay', 'EPAM', 'Salary', 800, '2026-08-05', { account_id: 'card' })], fee));
 assert.deepEqual(shape(gap), [['Savings', 'Savings account', 490], ['Savings', 'Card', 300], ['Savings', 'Not traced', 10]]);
 const grew = drillFlows({ side: 'savings' }, 'Savings', 100, context([record('pay', 'EPAM', 'Salary', 300, '2026-08-05', { account_id: 'card' })]));
 assert.deepEqual(shape(grew), [['Cash flow', 'Savings', 100], ['Not traced', 'Savings', 200], ['Savings', 'Card', 300]], 'more growth than savings is never spread over the accounts');
 const links = [{ id: 'l', account_id: 'card', account_currency: 'USD', amount: -400, investment_history: { occurred_on: '2026-08-12', record_id: 'card', event_type: 'buy' } }];
 const bought = accountChanges({ ...context([]), data: { records: [...accounts, record('vt', 'VT', 'Stock', 10, '2026-01-01')], activity: [], investmentLinks: [{ ...links[0], investment_history: { ...links[0].investment_history, record_id: 'vt' } }] } });
 assert.deepEqual(Object.fromEntries(bought.changes), { card: -400, vt: 400 }, 'cash moved into a holding');
});

test('the Cash flow Sankey opens a category or Savings in a dialog; the total and the merged Other open nothing', () => {
 const report = { savings: 300, categories: { income: [{ key: 'Salary', amount: 1000 }], expense: [{ key: 'A', amount: 400 }, { key: 'B', amount: 200 }, { key: 'C', amount: 60 }, { key: 'D', amount: 40 }] } };
 assert.deepEqual(sankeyFlows(report, key => key, 3).nodes.map(node => node.key), ['Salary', undefined, 'A', 'B', undefined, undefined], 'only real categories carry a key');
 const r = createRenderer();
 const modules = { 'recharts': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { FlowSankey, CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 const flows = sankeyFlows(report, key => key, 3);
 const opened = [];
 r.mount(React.createElement(FlowSankey, { flows, currency: 'USD', canOpen: index => !!flows.nodes[index].key, onOpen: index => opened.push(index) }));
 const node = r.find(item => item.type === 'Sankey').props.node;
 const draw = index => node({ x: 0, y: 0, width: 10, height: 20, index, payload: { name: flows.nodes[index].name, value: 100 } });
 const salary = draw(0), total = draw(1);
 assert.equal(salary.props.role, 'button');
 assert.equal(salary.props['aria-label'], 'Open Salary');
 salary.props.onClick();
 salary.props.onKeyDown({ key: 'Enter', preventDefault() {} });
 salary.props.onKeyDown({ key: 'Tab', preventDefault() {} });
 assert.deepEqual(opened, [0, 0], 'click and Enter open it; other keys do not');
 assert.equal(total.props.role, undefined, 'the total is not a button');
 // 20 October 2026: a tap on the wide grey flow did nothing; only the thin bar and its label opened.
 const link = r.find(item => item.type === 'Sankey').props.link;
 const flow = index => link({ sourceX: 0, targetX: 100, sourceY: 0, targetY: 10, sourceControlX: 50, targetControlX: 50, linkWidth: 8, index });
 flow(0).props.onClick();
 flow(1).props.onClick();
 assert.deepEqual(opened, [0, 0, 0, 2], 'Salary → Income opens Salary (the total cannot open); Income → A opens A');
 assert.equal(flow(3).props.onClick, undefined, 'a flow into the merged Other opens nothing');
 let closed = false;
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'expense', key: 'Living expense' }, title: 'Living expense', period: 'August 2026', savings: 0, context: context([record('a', 'Market', 'Living expense', 120, '2026-08-02'), record('f', 'Bonus', 'Living expense', 100, '2026-08-25', { currency: 'GBP' })]), onClose: () => { closed = true; } }));
 assert.ok(r.find(item => item.type === 'FlowSankey' || item.type === 'Sankey'), 'the drill-down Sankey is drawn');
 assert.ok(r.find(item => item.type === 'p' && item.props.className === 'partial-total'), 'an unconverted amount is noted');
 r.find(item => item.type === 'Dialog').props.onOpenChange(false);
 assert.ok(closed);
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'income', key: 'Salary' }, title: 'Salary', period: 'August 2026', savings: 0, context: context([]), onClose() {} }));
 assert.ok(r.find(item => item.type === 'p' && item.props.className === 'budget-left-empty'), 'an empty category says so');
});
