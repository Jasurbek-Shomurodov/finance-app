import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { createRenderer, hostModule, language, text } from './helpers/component-tree.mjs';
const { drillFlows, accountChanges } = loadTS('lib/cash-flow-drill.ts');
const { cashFlowReport, sankeyFlows } = loadTS('lib/cash-flow-report.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
/** Pages the drill-down opens: a link closes the dialog and goes there. */
const router = { pushed: [], push(href) { this.pushed.push(href); } };
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
 const modules = { 'recharts': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), 'next/navigation': { useRouter: () => router }, '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
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

test('an account in the savings Sankey opens its own: income and transfers in, spending, transfers and debts out, the rest to its balance', () => {
 const records = [
  record('pay', 'EPAM', 'Salary', 3000, '2026-08-05', { account_id: 'card' }),
  record('food', 'Market', 'Living expense', 500, '2026-08-06', { account_id: 'card', custom_category_id: 'groceries' }),
  record('gift', 'Gift', 'Charity', 50, '2026-08-07', { account_id: 'save' }),
 ];
 const activity = [
  { id: 't1', action: 'transfer', account_id: 'card', target_id: 'save', amount: 1500, received: 1490, fee: 10, occurred_on: '2026-08-10', notes: '', before_balance: 0, after_balance: 0 },
  { id: 'r1', action: 'repayment', account_id: 'card', target_id: 'loan', amount: 300, received: 300, fee: 0, occurred_on: '2026-08-15', notes: '', before_balance: 0, after_balance: 0 },
 ];
 const ctx = { ...context(records, activity), label: key => key === 'groceries' ? 'Groceries' : key };
 const savings = drillFlows({ side: 'savings' }, 'Savings', 2450, ctx);
 assert.deepEqual(savings.nodes.filter(node => node.open).map(node => [node.name, node.open]), [['Savings', { side: 'cashflow' }], ['Savings account', { side: 'account', key: 'save' }], ['Card', { side: 'account', key: 'card' }], ['Car loan', { side: 'account', key: 'loan' }], ['Not traced', { side: 'untraced' }]], 'Savings opens the cash flow, every account and debt its own Sankey, Not traced its transfers');
 const card = drillFlows({ side: 'account', key: 'card' }, 'Card', 0, ctx);
 assert.deepEqual(shape(card), [['EPAM', 'Card', 3000], ['Card', 'Savings account', 1490], ['Card', 'Groceries', 500], ['Card', 'Car loan', 300], ['Card', 'Not traced', 10], ['Card', 'Balance', 700]]);
 assert.deepEqual(card.nodes.map(node => node.open?.side ?? null), ['merchant', 'link', 'account', 'expense', 'account', 'untraced', 'balance'], 'everything opens: sources, the account (Accounts), categories, other accounts, the transfer fee and its balance');
 // 20 October 2026: income came in by category (Rent income) rather than by its source (Airbnb payout).
 assert.deepEqual(card.nodes[0].open, { side: 'merchant', key: 'EPAM', income: true }, 'an income source opens its own Sankey');
 const save = drillFlows({ side: 'account', key: 'save' }, 'Savings account', 0, ctx);
 assert.deepEqual(shape(save), [['Card', 'Savings account', 1490], ['Savings account', 'Charity', 50], ['Savings account', 'Balance', 1440]]);
 const loan = drillFlows({ side: 'account', key: 'loan' }, 'Car loan', 0, ctx);
 assert.deepEqual(shape(loan), [['Card', 'Car loan', 300], ['Car loan', 'Principal', 300]], 'a repayment flows into the debt and pays its principal');
 const drawn = drillFlows({ side: 'account', key: 'card' }, 'Card', 0, context([record('food', 'Market', 'Living expense', 200, '2026-08-06', { account_id: 'card' })]));
 assert.deepEqual(shape(drawn), [['Balance', 'Card', 200], ['Card', 'Living expense', 200]], 'spending more than came in draws on the balance');
 const fx = drillFlows({ side: 'account', key: 'card' }, 'Card', 0, context([], [{ id: 't', action: 'transfer', account_id: 'card', target_id: 'eur', amount: 100, received: 220, fee: 0, occurred_on: '2026-08-10', notes: '', before_balance: 0, after_balance: 0 }], { data: { records: [...accounts, record('eur', 'Euro', 'Cash', 0, '2026-01-01', { frequency: 'Monthly', currency: 'EUR' })], activity: [{ id: 't', action: 'transfer', account_id: 'card', target_id: 'eur', amount: 100, received: 220, fee: 0, occurred_on: '2026-08-10', notes: '', before_balance: 0, after_balance: 0 }], investmentLinks: [] } }));
 assert.deepEqual(shape(fx), [['Balance', 'Card', 100], ['Card', 'Euro', 100]], 'EUR 220 at 0.5 per dollar is $110: the $10 exchange difference is not the card’s');
});

test('the drill-down dialog opens an account in place and Back returns to the Sankey before it', () => {
 const r = createRenderer();
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), 'next/navigation': { useRouter: () => router }, '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 const ctx = context([record('pay', 'EPAM', 'Salary', 1000, '2026-08-05', { account_id: 'card' })]);
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'savings' }, title: 'Savings', period: 'August 2026', savings: 1000, context: ctx, onClose() {} }));
 const title = () => r.find(item => item.type === 'DialogTitle').props.children[0];
 const back = () => r.all(item => item.type === 'Button' && item.props.className === 'cash-flow-drill-back');
 assert.equal(title(), 'Savings');
 assert.equal(back().length, 0, 'no Back on the first Sankey');
 const sankey = () => r.find(item => item.type === 'Sankey').props;
 const card = sankey().data.nodes.findIndex(node => node.name === 'Card');
 const tile = sankey().node({ x: 0, y: 0, width: 10, height: 20, index: card, payload: { name: 'Card', value: 1000 } });
 assert.equal(tile.props.role, 'button');
 r.fire(tile, 'onClick');
 assert.equal(title(), 'Card');
 assert.deepEqual(shape(sankey().data), [['EPAM', 'Card', 1000], ['Card', 'Balance', 1000]]);
 r.fire(back()[0], 'onClick');
 assert.equal(title(), 'Savings');
});

test('a merchant in a category Sankey opens its own: the accounts it was paid from and the categories it was spent on', () => {
 const records = [
  record('a', 'Costco', 'Living expense', 120, '2026-08-02', { account_id: 'card', custom_category_id: 'groceries' }),
  record('b', 'Costco', 'Living expense', 80, '2026-08-09', { custom_category_id: 'household' }),
  record('c', 'Costco', 'Living expense', 40, '2026-08-10', { account_id: 'card', currency: 'GBP' }),
  record('d', 'Cafe', 'Living expense', 50, '2026-08-10', { account_id: 'card', custom_category_id: 'groceries' }),
  record('e', 'EPAM', 'Salary', 2000, '2026-08-05', { account_id: 'save' }),
 ];
 const ctx = { ...context(records), label: key => ({ groceries: 'Groceries', household: 'Household' })[key] ?? key };
 const groceries = drillFlows({ side: 'expense', key: 'groceries' }, 'Groceries', 0, ctx);
 assert.deepEqual(groceries.nodes.map(node => node.open ?? null), [{ side: 'link', href: '/transactions' }, { side: 'merchant', key: 'Costco', income: false }, { side: 'merchant', key: 'Cafe', income: false }], 'each merchant opens its Sankey, the category Transactions');
 const costco = drillFlows({ side: 'merchant', key: 'Costco', income: false }, 'Costco', 0, ctx);
 assert.deepEqual(shape(costco), [['Card', 'Costco', 120], ['No account', 'Costco', 80], ['Costco', 'Groceries', 120], ['Costco', 'Household', 80]], 'across every category, never the GBP amount without a rate');
 assert.equal(costco.missing, 1);
 assert.deepEqual(costco.nodes.map(node => node.open?.side ?? null), ['account', 'account', 'link', 'expense', 'expense'], 'its accounts (No account too) and categories open, the merchant Transactions');
 const epam = drillFlows({ side: 'merchant', key: 'EPAM', income: true }, 'EPAM', 0, ctx);
 assert.deepEqual(shape(epam), [['Salary', 'EPAM', 2000], ['EPAM', 'Savings account', 2000]], 'a payer: its income category on the left, the account it landed in on the right');
 assert.deepEqual(shape(drillFlows({ side: 'merchant', key: 'Costco', income: true }, 'Costco', 0, ctx)), [], 'a merchant is never read as a payer');
});

test('a merchant Sankey lists its transactions as entered, newest first, and a tap opens one', () => {
 const records = [
  record('a', 'Costco', 'Living expense', 120, '2026-08-02', { account_id: 'card', custom_category_id: 'groceries' }),
  record('b', 'Costco', 'Living expense', 40, '2026-08-10', { currency: 'GBP' }),
  record('c', 'Cafe', 'Living expense', 50, '2026-08-11'),
  record('d', 'Costco', 'Other income', 30, '2026-08-12'),
 ];
 const ctx = { ...context(records), label: key => key === 'groceries' ? 'Groceries' : key };
 const { drillTransactions } = loadTS('lib/cash-flow-drill.ts');
 assert.deepEqual(drillTransactions({ side: 'merchant', key: 'Costco', income: false }, ctx).map(item => item.id), ['b', 'a'], 'newest first; a refund or income under the same name is not spending, and a GBP amount without a rate is still listed');
 const r = createRenderer();
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), 'next/navigation': { useRouter: () => router }, '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 const opened = [];
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'merchant', key: 'Costco', income: false }, title: 'Costco', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord: item => opened.push(item.id) }));
 const rows = r.all(node => node.type === 'button' && node.props['aria-label'] === 'View details for Costco');
 assert.equal(rows.length, 2);
 assert.match(r.html(), /10 August 2026/);
 assert.match(r.html(), /−£40/, 'as entered, in its own currency');
 assert.match(r.html(), /Groceries/);
 rows[1].props.onClick();
 assert.deepEqual(opened, ['a']);
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'expense', key: 'groceries' }, title: 'Groceries', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord() {} }));
 // A category lists its transactions too: the merchant's name first, then the date.
 assert.deepEqual(r.all(node => node.type === 'button' && node.props['aria-label']?.startsWith('View details')).map(node => node.props['aria-label']), ['View details for Costco'], 'only the transaction in the category');
 assert.match(r.html(), /<strong>Costco<\/strong><small>2 August 2026<\/small>/);
 assert.deepEqual(drillTransactions({ side: 'expense', key: 'Living expense' }, ctx).map(item => item.id), ['c', 'b'], 'a built-in category by kind, newest first');
 assert.deepEqual(drillTransactions({ side: 'income', key: 'Other income' }, ctx).map(item => item.id), ['d']);
 // A payer lists its income the same way, in green with a plus, and a tap opens it.
 assert.deepEqual(drillTransactions({ side: 'merchant', key: 'Costco', income: true }, ctx).map(item => item.id), ['d'], 'a payer lists its income, never spending under the same name');
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'merchant', key: 'Costco', income: true }, title: 'Costco', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord: item => opened.push(item.id) }));
 assert.match(r.html(), /12 August 2026/);assert.match(r.html(), /\+\$30/);
 r.all(node => node.type === 'button' && node.props['aria-label'] === 'View details for Costco')[0].props.onClick();
 assert.deepEqual(opened, ['a', 'd']);
});

test('an account Sankey lists the transactions recorded against it; a tap opens one', () => {
 const records = [
  record('pay', 'EPAM', 'Salary', 3000, '2026-08-05', { account_id: 'card' }),
  record('food', 'Market', 'Living expense', 500, '2026-08-06', { account_id: 'card', custom_category_id: 'groceries' }),
  record('cash', 'Taxi', 'Living expense', 100, '2026-08-07'),
  record('mp', 'Mortgage payment', 'Other expense', 1000, '2026-08-20', { mortgage_payment_id: 'mp', payment_interest: 400, payment_principal: 600 }),
 ];
 const activity = [{ id: 'mp', action: 'mortgage', account_id: 'card', target_id: 'home', amount: 1000, received: 1000, fee: 0, occurred_on: '2026-08-20', notes: '', before_balance: 0, after_balance: 0 }];
 const ctx = { ...context(records, activity), label: key => key === 'groceries' ? 'Groceries' : key };
 const { drillTransactions } = loadTS('lib/cash-flow-drill.ts');
 assert.deepEqual(drillTransactions({ side: 'account', key: 'card' }, ctx).map(item => item.id), ['mp', 'food', 'pay'], 'income and spending, a mortgage payment through its operation; never another account’s');
 assert.deepEqual(drillTransactions({ side: 'account', key: '' }, ctx).map(item => item.id), ['cash']);
 assert.deepEqual(drillTransactions({ side: 'savings' }, ctx).map(item => item.id), ['mp', 'cash', 'food', 'pay'], 'Savings lists all the income and spending it is made of, with or without an account');
 assert.deepEqual(drillTransactions({ side: 'savings' }, { ...ctx, months: ['2026-09'] }), [], 'only the period');
 const r = createRenderer();
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), 'next/navigation': { useRouter: () => router }, '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 const opened = [];
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'account', key: 'card' }, title: 'Card', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord: item => opened.push(item.id) }));
 const html = r.html();
 assert.match(html, /EPAM/);assert.match(html, /\+\$3,000/, 'income in green with a plus');assert.match(html, /6 August 2026 · Groceries/);
 r.all(node => node.type === 'button' && node.props['aria-label'] === 'View details for Market')[0].props.onClick();
 assert.deepEqual(opened, ['food']);
});

test('an account lists its transfers and repayments; a tap opens one with what was sent, what arrived and the fee', () => {
 const euro = record('eur', 'Euro', 'Cash', 0, '2026-01-01', { frequency: 'Monthly', currency: 'EUR' });
 const op = (id, action, account_id, target_id, amount, received, occurred_on, extra = {}) => ({ id, action, account_id, target_id, amount, received, fee: 0, occurred_on, notes: '', before_balance: 0, after_balance: 0, ...extra });
 const activity = [
  op('t1', 'transfer', 'card', 'eur', 100, 220, '2026-08-10', { fee: 2, notes: 'Trip money' }),
  op('t2', 'transfer', 'save', 'card', 50, 50, '2026-08-12'),
  op('r1', 'repayment', 'card', 'loan', 300, 300, '2026-08-15'),
  op('x', 'reconcile', 'card', 'card', 9, 9, '2026-08-16'),
  op('m', 'mortgage', 'card', 'home', 1000, 1000, '2026-08-17'),
  op('old', 'transfer', 'card', 'save', 10, 10, '2026-07-30'),
 ];
 const ctx = { ...context([record('pay', 'EPAM', 'Salary', 3000, '2026-08-05', { account_id: 'card' })], activity), data: { records: [...accounts, euro, record('pay', 'EPAM', 'Salary', 3000, '2026-08-05', { account_id: 'card' })], activity, investmentLinks: [] } };
 const { accountOperations, operationDetails, operationFlows } = loadTS('lib/cash-flow-operations.ts');
 assert.deepEqual(accountOperations('card', ctx).map(row => row.id), ['r1', 't2', 't1'], 'in and out, newest first; no reconciliation, no mortgage payment (listed as its transaction), only the period');
 const transfer = operationDetails('t1', ctx).row;
 assert.deepEqual([transfer.sent, transfer.received, transfer.fee], [{ amount: 100, currency: 'USD' }, { amount: 220, currency: 'EUR' }, 2], 'each side in its own account’s currency');
 assert.deepEqual(operationDetails('r1', ctx).row.received, { amount: 300, currency: 'USD' }, 'a repayment reaches its loan as sent');
 assert.equal(operationDetails('x', ctx), null);
 const flows = operationFlows('t1', ctx);
 assert.deepEqual(shape(flows), [['Card', 'Euro', 100]]);
 assert.deepEqual(flows.nodes.map(node => node.open), [{ side: 'account', key: 'card' }, { side: 'account', key: 'eur' }], 'both accounts open');
 assert.equal(operationFlows('t1', { ...ctx, currency: 'GBP' }).missing, 1, 'no rate: missing, never under the wrong currency');

 const r = createRenderer();
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), 'next/navigation': { useRouter: () => router }, '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'account', key: 'card' }, title: 'Card', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord() {} }));
 const html = r.html();
 assert.match(html, /<strong>Transfer<\/strong><small>12 August 2026 · ← Savings account<\/small><\/span><span class="positive">\+\$50<\/span>/);
 assert.match(html, /<strong>Transfer<\/strong><small>10 August 2026 · → Euro<\/small><\/span><span>−\$100<\/span>/);
 assert.match(html, /<strong>Repayment<\/strong><small>15 August 2026 · → Car loan<\/small>/);
 const rows = r.all(node => node.type === 'button' && node.props['aria-label'] === 'View details for Transfer');
 assert.equal(rows.length, 2);
 r.fire(rows[1], 'onClick');
 assert.equal(r.find(node => node.type === 'DialogTitle').props.children[0], 'Transfer');
 const details = r.html();
 assert.match(details, /<li><button type="button"><span>From<\/span><strong>Card<\/strong><\/button><\/li><li><button type="button"><span>To<\/span><strong>Euro<\/strong><\/button><\/li><li><button type="button"><span>Date<\/span><strong>10 August 2026<\/strong><\/button><\/li><li><button type="button"><span>Amount<\/span><strong>\$100<\/strong><\/button><\/li><li><button type="button"><span>Received<\/span><strong>€220<\/strong><\/button><\/li><li><button type="button"><span>Transfer fee<\/span><strong>\$2<\/strong><\/button><\/li><li><button type="button"><span>Notes<\/span><strong>Trip money<\/strong><\/button><\/li>/);
 // Every row opens something: the accounts their Sankeys, the fee the card's untraced amounts, the day and notes Accounts.
 const row = label => r.all(node => node.type === 'button' && text(node).startsWith(label))[0];
 r.fire(row('Received'), 'onClick');
 assert.equal(r.find(node => node.type === 'DialogTitle').props.children[0], 'Euro');
 r.fire(r.all(node => node.type === 'Button' && node.props.className === 'cash-flow-drill-back')[0], 'onClick');
 r.fire(row('Transfer fee'), 'onClick');
 assert.equal(r.find(node => node.type === 'DialogTitle').props.children[0], 'Not traced');
 assert.deepEqual(shape(r.find(node => node.type === 'Sankey').props.data), [['10 August 2026 · Transfer', 'Not traced', 340]], 'EUR 220 is worth $440, more than the $100 sent: the gap is the Euro account’s');
 r.fire(r.all(node => node.type === 'Button' && node.props.className === 'cash-flow-drill-back')[0], 'onClick');
 router.pushed.length = 0;
 row('Notes').props.onClick();
 assert.deepEqual(router.pushed, ['/accounts']);
 assert.deepEqual(shape(r.find(node => node.type === 'Sankey').props.data), [['Card', 'Euro', 100]]);
 r.fire(r.all(node => node.type === 'Button' && node.props.className === 'cash-flow-drill-back')[0], 'onClick');
 assert.equal(r.find(node => node.type === 'DialogTitle').props.children[0], 'Card');
});

test('transfers, buys and sales recorded on Accounts count in the Sankeys and open like any transfer', () => {
 // 20 October 2026: Accounts › Transfer money records an asset movement, which the drill-down did not read at all.
 const movement = (id, kind, source_id, target_id, source_value, target_value, occurred_on, extra = {}) => ({ id, kind, source_id, target_id, sent: source_value, received: target_value, source_value, target_value, fee: 0, occurred_on, notes: '', realized_gain: null, ...extra });
 const vt = record('vt', 'VT', 'Stock', 100, '2026-01-01', { frequency: 'Monthly', quantity: 3 });
 const movements = [
  movement('m1', 'transfer', 'card', 'save', 500, 495, '2026-08-11', { fee: 5 }),
  movement('m2', 'buy', 'save', 'vt', 300, 300, '2026-08-12', { sent: 300, received: 3 }),
  movement('m3', 'interest', 'save', 'save', 0, 4, '2026-08-13'),
  movement('m4', 'transfer', 'card', 'save', 70, 70, '2026-09-02'),
 ];
 const records = [...accounts, vt, record('pay', 'EPAM', 'Salary', 1000, '2026-08-05', { account_id: 'card' })];
 const ctx = { ...context([]), data: { records, activity: [], investmentLinks: [], movements } };
 assert.deepEqual(Object.fromEntries(accountChanges(ctx).changes), { card: 500, save: 195, vt: 300 }, 'card +1000 −500; savings +495 −300; the fee and the interest are not traced; September is outside the period');
 assert.deepEqual(shape(drillFlows({ side: 'savings' }, 'Savings', 1000, ctx)), [['Savings', 'Card', 500], ['Savings', 'VT', 300], ['Savings', 'Savings account', 195], ['Savings', 'Not traced', 5]]);
 const { accountOperations, operationDetails } = loadTS('lib/cash-flow-operations.ts');
 assert.deepEqual(accountOperations('save', ctx).map(row => [row.id, row.kind]), [['m2', 'buy'], ['m1', 'transfer']], 'no capitalized interest');
 assert.deepEqual(operationDetails('m2', ctx).row.received, { amount: 300, currency: 'USD' }, 'a holding’s side is its money value, not its quantity');
 const r = createRenderer();
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), 'next/navigation': { useRouter: () => router }, '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'account', key: 'save' }, title: 'Savings account', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord() {} }));
 assert.match(r.html(), /<strong>Buy holding<\/strong><small>12 August 2026 · → VT<\/small><\/span><span>−\$300<\/span>/);
 assert.match(r.html(), /<strong>Transfer<\/strong><small>11 August 2026 · ← Card<\/small><\/span><span class="positive">\+\$495<\/span>/);
 r.fire(r.all(node => node.type === 'button' && node.props['aria-label'] === 'View details for Transfer')[0], 'onClick');
 assert.match(r.html(), /<li><button type="button"><span>Amount<\/span><strong>\$500<\/strong><\/button><\/li><li><button type="button"><span>Received<\/span><strong>\$495<\/strong><\/button><\/li><li><button type="button"><span>Transfer fee<\/span><strong>\$5<\/strong><\/button><\/li>/);
});

test('a holding in the savings Sankey is marked as one and opens its own: what was bought from where, kept as money invested', () => {
 const holding = (id, name, kind) => record(id, name, kind, 0, '2026-01-01', { frequency: 'Monthly' });
 const movements = [{ id: 'm', kind: 'buy', source_id: 'card', target_id: 'vt', sent: 300, received: 3, source_value: 300, target_value: 300, fee: 0, occurred_on: '2026-08-12', notes: '', realized_gain: null }];
 const investmentLinks = [{ id: 'l', account_id: 'card', account_currency: 'USD', amount: -200, investment_history: { occurred_on: '2026-08-13', record_id: 'btc', event_type: 'buy' } }];
 const ctx = { ...context([]), data: { records: [...accounts, holding('vt', 'VT', 'Stock'), holding('btc', 'Bitcoin', 'Crypto'), record('cd', 'CD', 'Deposit', 0, '2026-01-01', { frequency: 'Monthly' }), record('pay', 'EPAM', 'Salary', 1000, '2026-08-05', { account_id: 'card' })], activity: [], investmentLinks, movements } };
 const savings = drillFlows({ side: 'savings' }, 'Savings', 1000, ctx);
 assert.deepEqual(savings.nodes.map(node => [node.name, node.kind, node.open?.key ?? null]), [['Savings', 'savings', null], ['Card', 'account', 'card'], ['VT', 'holding', 'vt'], ['Bitcoin', 'holding', 'btc']], 'holdings open their own Sankey; cash stays an account');
 assert.deepEqual(shape(drillFlows({ side: 'account', key: 'vt' }, 'VT', 0, ctx)), [['Card', 'VT', 300], ['VT', 'Money invested', 300]]);
 assert.deepEqual(shape(drillFlows({ side: 'account', key: 'btc' }, 'Bitcoin', 0, ctx)), [['Card', 'Bitcoin', 200], ['Bitcoin', 'Money invested', 200]], 'a buy recorded in the Tracker too');
 const { accountNode } = loadTS('lib/cash-flow-drill.ts');
 assert.equal(accountNode('cd', new Map([['cd', { kind: 'Deposit', name: 'CD' }]]), key => key).kind, 'account', 'a deposit is where money is kept, not a holding');
 assert.equal(accountNode('home', new Map([['home', { kind: 'Mortgage', name: 'Home' }]]), key => key).kind, 'debt');
});

test('a debt in the savings Sankey opens its own: what paid it down, as principal, with its repayments and mortgage payments listed', () => {
 const records = [
  record('pay', 'EPAM', 'Salary', 3000, '2026-08-05', { account_id: 'card' }),
  record('mp', 'Mortgage payment', 'Other expense', 1000, '2026-08-20', { mortgage_payment_id: 'mp', payment_interest: 400, payment_principal: 600 }),
 ];
 const activity = [
  { id: 'r1', action: 'repayment', account_id: 'card', target_id: 'loan', amount: 300, received: 300, fee: 0, occurred_on: '2026-08-15', notes: '', before_balance: 0, after_balance: 0 },
  { id: 'mp', action: 'mortgage', account_id: 'card', target_id: 'home', amount: 1000, received: 1000, fee: 0, occurred_on: '2026-08-20', notes: '', before_balance: 0, after_balance: 0 },
 ];
 const ctx = context(records, activity);
 const savings = drillFlows({ side: 'savings' }, 'Savings', 2600, ctx);
 assert.deepEqual(savings.nodes.filter(node => node.kind === 'debt').map(node => [node.name, node.open]), [['Home', { side: 'account', key: 'home' }], ['Car loan', { side: 'account', key: 'loan' }]], 'every debt opens its own Sankey');
 assert.deepEqual(shape(drillFlows({ side: 'account', key: 'loan' }, 'Car loan', 0, ctx)), [['Card', 'Car loan', 300], ['Car loan', 'Principal', 300]]);
 // The whole payment passes through the mortgage: its principal stays as principal, its interest flows on to its category.
 const home = drillFlows({ side: 'account', key: 'home' }, 'Home', 0, ctx);
 assert.deepEqual(shape(home), [['Card', 'Home', 1000], ['Home', 'Other expense', 400], ['Home', 'Principal', 600]]);
 assert.deepEqual(home.nodes.map(node => node.open ?? null), [{ side: 'account', key: 'card' }, { side: 'link', href: '/loans-debts' }, { side: 'expense', key: 'Other expense' }, { side: 'principal', key: 'home' }], 'the interest category opens its own Sankey');
 const noRate = drillFlows({ side: 'account', key: 'home' }, 'Home', 0, { ...ctx, currency: 'GBP' });
 assert.deepEqual([shape(noRate), noRate.missing], [[], 5], 'without a rate nothing is drawn: the period’s four flows and the interest are missing, never shown under the wrong currency');
 assert.deepEqual(Object.fromEntries(accountChanges(ctx).changes).home, 600, 'Savings still counts only the principal against the mortgage');
 const { drillTransactions } = loadTS('lib/cash-flow-drill.ts');
 const { accountOperations } = loadTS('lib/cash-flow-operations.ts');
 assert.deepEqual(drillTransactions({ side: 'account', key: 'home' }, ctx).map(item => item.id), ['mp'], 'the mortgage lists its payment');
 assert.deepEqual(drillTransactions({ side: 'account', key: 'card' }, ctx).map(item => item.id), ['mp', 'pay'], 'and so does the account that paid it');
 assert.deepEqual(accountOperations('loan', ctx).map(row => row.id), ['r1'], 'the loan lists its repayment');
});

test('a debt’s principal opens the payments that paid it down; a mortgage payment opens its details, a repayment its transfer', () => {
 const records = [
  record('mp1', 'Mortgage payment', 'Other expense', 1000, '2026-08-20', { mortgage_payment_id: 'mp1', payment_interest: 400, payment_principal: 600 }),
  record('mp2', 'Mortgage payment', 'Other expense', 1000, '2026-08-05', { mortgage_payment_id: 'mp2', payment_interest: 410, payment_principal: 590 }),
  record('mp3', 'Mortgage payment', 'Other expense', 1000, '2026-07-05', { mortgage_payment_id: 'mp3', payment_interest: 420, payment_principal: 580 }),
 ];
 const op = (id, action, account_id, target_id, amount, occurred_on) => ({ id, action, account_id, target_id, amount, received: amount, fee: 0, occurred_on, notes: '', before_balance: 0, after_balance: 0 });
 const activity = [op('mp1', 'mortgage', 'card', 'home', 1000, '2026-08-20'), op('mp2', 'mortgage', 'save', 'home', 1000, '2026-08-05'), op('mp3', 'mortgage', 'card', 'home', 1000, '2026-07-05'), op('r1', 'repayment', 'card', 'loan', 300, '2026-08-15')];
 const ctx = { ...context(records, activity), locale: 'en-US' };
 const { principalPayments, principalFlows } = loadTS('lib/cash-flow-principal.ts');
 assert.deepEqual(principalPayments('home', ctx).map(payment => [payment.id, payment.principal.amount]), [['mp1', 600], ['mp2', 590]], 'newest first, only the period');
 const home = principalFlows('home', ctx);
 assert.deepEqual(shape(home), [['20 August 2026 · Card', 'Principal', 600], ['5 August 2026 · Savings account', 'Principal', 590]]);
 assert.deepEqual(home.nodes.map(node => node.open ?? null), [{ side: 'payment', key: 'mp1' }, { side: 'payment', key: 'mp2' }, { side: 'account', key: 'home' }], 'a mortgage payment opens its own Sankey, the principal its mortgage');
 const { paymentFlows } = loadTS('lib/cash-flow-principal.ts');
 const payment = paymentFlows('mp1', ctx);
 assert.deepEqual(shape(payment), [['Card', 'Mortgage payment', 1000], ['Mortgage payment', 'Principal', 600], ['Mortgage payment', 'Interest', 400]]);
 assert.deepEqual(payment.nodes.map(node => node.open ?? null), [{ side: 'account', key: 'card' }, { side: 'record', key: 'mp1' }, { side: 'account', key: 'home' }, { side: 'interest', key: 'home' }], 'the account, the payment (its details), the mortgage and the mortgage’s interest open');
 const { interestFlows, mortgageTransactions } = loadTS('lib/cash-flow-principal.ts');
 const interest = interestFlows('home', ctx);
 assert.deepEqual(shape(interest), [['20 August 2026 · Card', 'Interest', 400], ['5 August 2026 · Savings account', 'Interest', 410]], 'each payment’s interest in the period, newest first');
 assert.deepEqual(interest.nodes.map(node => node.open ?? null), [{ side: 'payment', key: 'mp1' }, { side: 'payment', key: 'mp2' }, { side: 'expense', key: 'Other expense' }], 'a payment opens its Sankey; the total opens the category the payments share');
 assert.deepEqual(mortgageTransactions('home', ctx).map(item => item.id), ['mp1', 'mp2']);
 const split = interestFlows('home', { ...ctx, data: { ...ctx.data, records: ctx.data.records.map(item => item.id === 'mp2' ? { ...item, custom_category_id: 'housing' } : item) } });
 assert.deepEqual(split.nodes.at(-1).open, { side: 'group', income: false, keys: ['Other expense', 'housing'], by: 'category' }, 'payments in two categories: the total opens both');
 assert.equal(interestFlows('home', { ...ctx, currency: 'GBP' }).missing, 2);
 assert.deepEqual([shape(paymentFlows('mp1', { ...ctx, currency: 'GBP' })), paymentFlows('mp1', { ...ctx, currency: 'GBP' }).missing], [[], 1]);
 assert.deepEqual(shape(paymentFlows('r1', ctx)), [], 'a repayment is not a mortgage payment');
 const loan = principalFlows('loan', ctx);
 assert.deepEqual([shape(loan), loan.nodes[0].open], [[['15 August 2026 · Card', 'Principal', 300]], { side: 'operation', key: 'r1' }]);
 assert.equal(principalFlows('home', { ...ctx, currency: 'GBP' }).missing, 2, 'no rate: missing, never drawn');

 const r = createRenderer();
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), 'next/navigation': { useRouter: () => router }, '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 const opened = [];
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'account', key: 'home' }, title: 'Home', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord: item => opened.push(item.id) }));
 const sankey = () => r.find(node => node.type === 'Sankey').props;
 const tap = name => { const index = sankey().data.nodes.findIndex(node => node.name === name); r.fire(sankey().node({ x: 0, y: 0, width: 10, height: 20, index, payload: { name, value: 1 } }), 'onClick'); };
 tap('Principal');
 assert.equal(r.find(node => node.type === 'DialogTitle').props.children[0], 'Principal');
 assert.equal(r.all(node => node.type === 'button' && node.props['aria-label'] === 'View details for Mortgage payment').length, 2, 'the payments are listed too');
 tap('20 August 2026 · Card');
 assert.equal(r.find(node => node.type === 'DialogTitle').props.children[0], '20 August 2026 · Card', 'a mortgage payment opens its own Sankey');
 assert.deepEqual(shape(sankey().data), [['Card', 'Mortgage payment', 1000], ['Mortgage payment', 'Principal', 600], ['Mortgage payment', 'Interest', 400]]);
 const details = r.all(node => node.type === 'button' && node.props['aria-label'] === 'View details for Mortgage payment');
 assert.equal(details.length, 1, 'its transaction is listed below, one tap from its details');
 details[0].props.onClick();
 assert.deepEqual(opened, ['mp1']);
 tap('Interest');
 assert.equal(r.find(node => node.type === 'DialogTitle').props.children[0], 'Interest', 'the interest opens the mortgage’s interest for the period');
 assert.deepEqual(shape(sankey().data), [['20 August 2026 · Card', 'Interest', 400], ['5 August 2026 · Savings account', 'Interest', 410]]);
 assert.equal(r.all(node => node.type === 'button' && node.props['aria-label'] === 'View details for Mortgage payment').length, 2, 'with its payments listed');
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'principal', key: 'loan' }, title: 'Principal', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord() {} }));
 assert.match(r.html(), /<strong>Repayment<\/strong><small>15 August 2026 · ← Card<\/small>/);
 tap('15 August 2026 · Card');
 assert.equal(r.find(node => node.type === 'DialogTitle').props.children[0], '15 August 2026 · Card', 'a repayment opens as a transfer');
 assert.match(r.html(), /<li><button type="button"><span>Amount<\/span><strong>\$300<\/strong><\/button><\/li>/);
});

test('every node opens something: No account, the main chart’s merged Other and Income total, a category’s Other merchants', () => {
 // 20 October 2026: the user asked node by node for the drill-down to respond; now every node with something behind it opens.
 const records = [
  record('pay', 'EPAM', 'Salary', 2000, '2026-08-05', { account_id: 'card' }),
  record('gig', 'Upwork', 'Other income', 300, '2026-08-06'),
  record('cash', 'Taxi', 'Living expense', 100, '2026-08-07'),
  record('cafe', 'Cafe', 'Living expense', 60, '2026-08-08', { account_id: 'card' }),
  record('gift', 'Gift', 'Charity', 50, '2026-08-09'),
  ...Array.from({ length: 11 }, (_, index) => record('s' + index, 'Shop ' + index, 'Other expense', 100 - index, '2026-08-10')),
 ];
 const ctx = context(records);
 const { accountNode } = loadTS('lib/cash-flow-drill.ts');
 assert.deepEqual(accountNode('', new Map(), key => key).open, { side: 'account', key: '' }, 'No account opens');
 assert.deepEqual(shape(drillFlows({ side: 'account', key: '' }, 'No account', 0, ctx)), [['Upwork', 'No account', 300], ['Balance', 'No account', 895], ['No account', 'Other expense', 1045], ['No account', 'Living expense', 100], ['No account', 'Charity', 50]], 'the transactions recorded against no account');
 const { drillTransactions } = loadTS('lib/cash-flow-drill.ts');
 assert.equal(drillTransactions({ side: 'account', key: '' }, ctx).length, 14);

 const report = cashFlowReport({ records, activity: [], investmentLinks: [], categories: [] }, [], ['2026-08'], 'USD', '2026-08-31', { USD: 1 });
 const main = sankeyFlows(report, key => key, 2);
 const other = main.nodes.find(node => node.name === 'Other expense' && node.keys);
 assert.deepEqual(other.keys, ['Living expense', 'Charity'], 'the merged Other knows its categories');
 assert.deepEqual(main.nodes.find(node => node.kind === 'total').keys, ['Salary', 'Other income']);
 const merged = drillFlows({ side: 'group', income: false, keys: other.keys, by: 'category' }, 'Other expense', 0, ctx);
 assert.deepEqual(shape(merged), [['Other expense', 'Living expense', 160], ['Other expense', 'Charity', 50]]);
 assert.deepEqual(merged.nodes.slice(1).map(node => node.open), [{ side: 'expense', key: 'Living expense' }, { side: 'expense', key: 'Charity' }], 'each category opens');
 const income = drillFlows({ side: 'group', income: true, keys: ['Salary', 'Other income'], by: 'merchant' }, 'Income', 0, ctx);
 assert.deepEqual(shape(income), [['EPAM', 'Income', 2000], ['Upwork', 'Income', 300]], 'the Income total by source');
 assert.deepEqual(income.nodes[0].open, { side: 'merchant', key: 'EPAM', income: true });
 assert.deepEqual(drillTransactions({ side: 'group', income: false, keys: other.keys, by: 'category' }, ctx).map(item => item.id), ['gift', 'cafe', 'cash']);

 const shops = drillFlows({ side: 'expense', key: 'Other expense' }, 'Other expense', 0, ctx);
 const rest = shops.nodes.at(-1);
 assert.equal(rest.name, 'Other');
 assert.deepEqual(rest.open, { side: 'group', income: false, keys: ['Other expense'], by: 'merchant', skip: ['Shop 0', 'Shop 1', 'Shop 2', 'Shop 3', 'Shop 4', 'Shop 5', 'Shop 6', 'Shop 7', 'Shop 8'] }, 'a category’s Other opens the merchants it folds');
 assert.deepEqual(shape(drillFlows(rest.open, 'Other', 0, ctx)), [['Other', 'Shop 9', 91], ['Other', 'Shop 10', 90]]);
 assert.deepEqual(drillTransactions(rest.open, ctx).map(item => item.id).sort(), ['s10', 's9']);
});

test('an account’s balance opens where it stands today: opening balance and the period’s change, then its goals and what is available', () => {
 const card = record('card', 'Card', 'Cash', 2500, '2026-01-01', { frequency: 'Monthly' });
 const records = [card, ...accounts.filter(item => item.id !== 'card'), record('pay', 'EPAM', 'Salary', 1000, '2026-08-05', { account_id: 'card' }), record('food', 'Market', 'Living expense', 200, '2026-08-06', { account_id: 'card' })];
 const goals = [{ id: 'g1', name: 'Holiday', account_id: 'card', allocated: 600, target: 1000, target_date: null, archived: false }, { id: 'g2', name: 'Old', account_id: 'card', allocated: 50, target: 50, target_date: null, archived: true }, { id: 'g3', name: 'Euro trip', account_id: 'card', allocated: 100, currency: 'EUR', target: 500, target_date: null, archived: false }];
 const ctx = { ...context([]), data: { records, activity: [], investmentLinks: [], goals } };
 const account = drillFlows({ side: 'account', key: 'card' }, 'Card', 0, ctx);
 assert.deepEqual(account.nodes.find(node => node.name === 'Balance').open, { side: 'balance', key: 'card' }, 'Balance opens, in a period running to this month');
 assert.deepEqual(drillFlows({ side: 'account', key: 'card' }, 'Card', 0, { ...ctx, today: '2026-10-20', throughToday: false }).nodes.find(node => node.name === 'Balance').open, { side: 'link', href: '/accounts' }, 'when the data stops before today the balance at the period’s end cannot be told: it opens Accounts');
 const { balanceFlows } = loadTS('lib/cash-flow-balance.ts');
 assert.deepEqual(shape(balanceFlows('card', ctx)), [['Opening balance', 'Card', 1700], ['This period', 'Card', 800], ['Card', 'Holiday', 600], ['Card', 'Euro trip', 200], ['Card', 'Available', 1700]], '$2,500 today: $1,700 before the period’s $800; goals hold $800 (EUR 100 at 0.5), archived ones nothing');
 const spent = { ...ctx, data: { ...ctx.data, records: [card, record('food', 'Market', 'Living expense', 300, '2026-08-06', { account_id: 'card' })], goals: [] } };
 assert.deepEqual(shape(balanceFlows('card', spent)), [['Opening balance', 'Card', 2800], ['Card', 'This period', 300], ['Card', 'Current balance', 2500]], 'a period that used money; no goals: the current balance');
 assert.equal(balanceFlows('card', { ...ctx, currency: 'GBP' }).links.length, 0, 'no rate: nothing drawn');

 const r = createRenderer();
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), 'next/navigation': { useRouter: () => router }, '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'account', key: 'card' }, title: 'Card', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord() {} }));
 const sankey = () => r.find(node => node.type === 'Sankey').props;
 const index = sankey().data.nodes.findIndex(node => node.name === 'Balance');
 r.fire(sankey().node({ x: 0, y: 0, width: 10, height: 20, index, payload: { name: 'Balance', value: 800 } }), 'onClick');
 assert.equal(r.find(node => node.type === 'DialogTitle').props.children[0], 'Balance');
 assert.equal(r.all(node => node.type === 'button' && node.props['aria-label']?.startsWith('View details')).length, 2, 'with the account’s transactions listed');
});

test('money invested opens where the holding stands: what it cost, what the period invested, its gain, its value', () => {
 const vt = record('vt', 'VT', 'Stock', 120, '2026-01-01', { frequency: 'Monthly', quantity: 5, cost: 100 });
 const movements = [{ id: 'm', kind: 'buy', source_id: 'card', target_id: 'vt', sent: 200, received: 2, source_value: 200, target_value: 200, fee: 0, occurred_on: '2026-08-12', notes: '', realized_gain: null }];
 const ctx = { ...context([]), data: { records: [...accounts, vt], activity: [], investmentLinks: [], movements } };
 const holding = drillFlows({ side: 'account', key: 'vt' }, 'VT', 0, ctx);
 assert.deepEqual(holding.nodes.find(node => node.name === 'Money invested').open, { side: 'balance', key: 'vt' });
 const { balanceFlows } = loadTS('lib/cash-flow-balance.ts');
 const stood = balanceFlows('vt', ctx);
 assert.deepEqual(shape(stood), [['Purchase cost', 'VT', 300], ['This period', 'VT', 200], ['Gain/loss', 'VT', 100], ['VT', 'Current value', 600]], '5 units cost $500, $200 of it this period; at $120 they are worth $600');
 assert.deepEqual(stood.nodes.map(node => node.open?.side ?? null), ['link', 'account', 'link', 'link', 'link'], 'the period opens the holding’s flows; the holding, its cost, gain and value open Investments');
 const fallen = balanceFlows('vt', { ...ctx, data: { ...ctx.data, records: [...accounts, { ...vt, amount: 80 }] } });
 assert.deepEqual(shape(fallen), [['Purchase cost', 'VT', 300], ['This period', 'VT', 200], ['VT', 'Current value', 400], ['VT', 'Gain/loss', 100]], 'a loss flows out');
});

test('a past period’s balance is today’s less what moved since; Cash flow and Not traced open, and page links close the dialog', () => {
 const card = record('card', 'Card', 'Cash', 2500, '2026-01-01', { frequency: 'Monthly' });
 const records = [card, ...accounts.filter(item => item.id !== 'card'), record('pay', 'EPAM', 'Salary', 1000, '2026-08-05', { account_id: 'card' }), record('later', 'Market', 'Living expense', 300, '2026-09-10', { account_id: 'card' })];
 const activity = [{ id: 't', action: 'transfer', account_id: 'card', target_id: 'save', amount: 100, received: 95, fee: 5, occurred_on: '2026-08-20', notes: '', before_balance: 0, after_balance: 0 }];
 const ctx = { ...context([], activity), today: '2026-09-20', data: { records, activity, investmentLinks: [], goals: [{ id: 'g', name: 'Holiday', account_id: 'card', allocated: 500, target: 900, target_date: null, archived: false }] } };
 const { balanceFlows } = loadTS('lib/cash-flow-balance.ts');
 assert.deepEqual(shape(balanceFlows('card', ctx)), [['Opening balance', 'Card', 1900], ['This period', 'Card', 900], ['Card', 'Balance', 2800]], 'August ended at $2,800: today’s $2,500 plus September’s $300; goals are today’s, so not split');

 const { mainFlows } = loadTS('lib/cash-flow-main.ts');
 const main = mainFlows({ ...ctx, data: { ...ctx.data, categories: [] } });
 assert.deepEqual(shape(main), [['Salary', 'Income', 1000], ['Income', 'Savings', 1000]], 'Cash flow opens the period’s income and spending');
 assert.deepEqual(main.nodes.map(node => node.open?.side ?? null), ['income', 'group', 'savings']);
 const savings = drillFlows({ side: 'savings' }, 'Savings', 1000, ctx);
 assert.deepEqual(savings.nodes.find(node => node.name === 'Cash flow')?.open ?? null, null, 'no feeding column when nothing was drawn down');

 const { untracedFlows, untracedTransfers } = loadTS('lib/cash-flow-untraced.ts');
 assert.deepEqual(untracedTransfers('card', ctx).map(item => [item.operation.id, item.value]), [['t', 5]]);
 assert.deepEqual(untracedTransfers('loan', ctx), [], 'only the account’s own transfers');
 const notTraced = untracedFlows(undefined, 1000, ctx);
 assert.deepEqual(shape(notTraced), [['20 August 2026 · Transfer', 'Not traced', 5]]);
 assert.deepEqual(notTraced.nodes[0].open, { side: 'operation', key: 't' });

 const r = createRenderer();
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), 'next/navigation': { useRouter: () => router }, '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 let closed = 0;
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'balance', key: 'card' }, title: 'Balance', period: 'August 2026', savings: 0, context: ctx, onClose() { closed += 1; }, onOpenRecord() {} }));
 const sankey = r.find(node => node.type === 'Sankey').props;
 const index = sankey.data.nodes.findIndex(node => node.name === 'Opening balance');
 router.pushed.length = 0;
 sankey.node({ x: 0, y: 0, width: 10, height: 20, index, payload: { name: 'Opening balance', value: 1 } }).props.onClick();
 assert.deepEqual([router.pushed, closed], [['/accounts'], 1], 'a page link closes the dialog and opens Accounts');
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'untraced', key: 'card' }, title: 'Not traced', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord() {} }));
 assert.match(r.html(), /<strong>Transfer<\/strong><small>20 August 2026 · → Savings account<\/small>/, 'Not traced lists its transfers');
});

test('a goal in the balance Sankey opens its own: its balance at the start, what each account added or took, what it holds at the end', () => {
 const card = record('card', 'Card', 'Cash', 2500, '2026-01-01', { frequency: 'Monthly' });
 const goals = [{ id: 'g', name: 'Holiday', account_id: 'card', allocated: 700, target: 1000, target_date: null, archived: false }];
 const event = (id, occurred_on, delta, event_type, extra = {}) => ({ id, goal_id: 'g', operation_id: null, occurred_on, delta, balance: 0, event_type, notes: '', source_name: null, ...extra });
 const goalEvents = [
  event('e0', '2026-01-01', 300, 'opening'),
  event('e1', '2026-07-10', 200, 'contribution', { source_id: 'card' }),
  event('e2', '2026-08-05', 300, 'contribution', { source_id: 'card' }),
  event('e3', '2026-08-09', 150, 'contribution', { source_id: 'save' }),
  event('e4', '2026-08-20', -100, 'withdrawal', { source_name: 'Old wallet' }),
  event('e5', '2026-09-02', 50, 'contribution', { source_id: 'card' }),
 ];
 const ctx = { ...context([]), today: '2026-09-20', goalEvents, data: { records: [card, ...accounts.filter(item => item.id !== 'card')], activity: [], investmentLinks: [], goals } };
 const { balanceFlows } = loadTS('lib/cash-flow-balance.ts');
 const current = balanceFlows('card', { ...ctx, months: ['2026-09'] });
 assert.deepEqual(current.nodes.find(node => node.name === 'Holiday').open, { side: 'goal', key: 'g' }, 'a goal opens its own Sankey');
 const { goalFlows } = loadTS('lib/cash-flow-goal.ts');
 const holiday = goalFlows('g', ctx);
 assert.deepEqual(shape(holiday), [['Opening balance', 'Holiday', 300], ['Card', 'Holiday', 300], ['Savings account', 'Holiday', 150], ['Holiday', 'Old wallet', 100], ['Holiday', 'Saved', 650]], 'August: it held $300, took $450 in and $100 out, and held $650 (today’s $700 less September’s $50)');
 assert.deepEqual(holiday.nodes.map(node => node.open?.side ?? null), ['link', 'account', 'account', 'link', 'link', 'link'], 'the accounts open; the goal and its balances open Goals');
 assert.equal(goalFlows('g', { ...ctx, currency: 'GBP' }).missing, 1, 'no rate: missing');
 assert.deepEqual(shape(goalFlows('g', { ...ctx, goalEvents: [] })), [['Opening balance', 'Holiday', 700], ['Holiday', 'Saved', 700]], 'without a history it held the same all along');
});

test('every node of every drill-down Sankey opens something', () => {
 // 20 October 2026: the user asked node by node for the Sankeys to respond; this walks every view a tap can reach.
 const { operationFlows } = loadTS('lib/cash-flow-operations.ts');
 const { principalFlows, paymentFlows, interestFlows } = loadTS('lib/cash-flow-principal.ts');
 const { balanceFlows } = loadTS('lib/cash-flow-balance.ts');
 const { mainFlows } = loadTS('lib/cash-flow-main.ts');
 const { untracedFlows } = loadTS('lib/cash-flow-untraced.ts');
 const { goalFlows } = loadTS('lib/cash-flow-goal.ts');
 const holding = record('vt', 'VT', 'Stock', 120, '2026-01-01', { frequency: 'Monthly', quantity: 5, cost: 100 });
 const records = [...accounts.map(item => item.id === 'card' ? { ...item, amount: 2500 } : item), holding,
  record('pay', 'EPAM', 'Salary', 3000, '2026-08-05', { account_id: 'card' }), record('gig', 'Upwork', 'Other income', 300, '2026-08-06'),
  record('food', 'Market', 'Living expense', 500, '2026-08-06', { account_id: 'card', custom_category_id: 'groceries' }), record('cash', 'Taxi', 'Living expense', 100, '2026-08-07'),
  record('mp', 'Mortgage payment', 'Other expense', 1000, '2026-08-20', { mortgage_payment_id: 'mp', payment_interest: 400, payment_principal: 600 }),
  ...Array.from({ length: 11 }, (_, index) => record('s' + index, 'Shop ' + index, 'Charity', 20 - index, '2026-08-10'))];
 const op = (id, action, account_id, target_id, amount, received, occurred_on, fee = 0) => ({ id, action, account_id, target_id, amount, received, fee, occurred_on, notes: '', before_balance: 0, after_balance: 0 });
 const activity = [op('t', 'transfer', 'card', 'save', 500, 490, '2026-08-10', 10), op('r', 'repayment', 'card', 'loan', 300, 300, '2026-08-15'), op('mp', 'mortgage', 'card', 'home', 1000, 1000, '2026-08-20')];
 const movements = [{ id: 'm', kind: 'buy', source_id: 'save', target_id: 'vt', sent: 200, received: 2, source_value: 200, target_value: 200, fee: 0, occurred_on: '2026-08-12', notes: '', realized_gain: null }];
 const goals = [{ id: 'g', name: 'Holiday', account_id: 'card', allocated: 700, target: 1000, target_date: null, archived: false }];
 const goalEvents = [{ id: 'e', goal_id: 'g', operation_id: null, occurred_on: '2026-08-05', delta: 300, balance: 700, event_type: 'contribution', notes: '', source_name: null, source_id: 'card' }];
 const ctx = { ...context([]), label: key => key, goalEvents, data: { records, activity, investmentLinks: [], movements, goals, categories: [] } };
 const savings = 3000 + 300 - 500 - 100 - 400 - 155;
 const view = target => target.side === 'operation' ? operationFlows(target.key, ctx) : target.side === 'principal' ? principalFlows(target.key, ctx) : target.side === 'payment' ? paymentFlows(target.key, ctx)
  : target.side === 'interest' ? interestFlows(target.key, ctx) : target.side === 'balance' ? balanceFlows(target.key, ctx) : target.side === 'cashflow' ? mainFlows(ctx)
  : target.side === 'untraced' ? untracedFlows(target.key, savings, ctx) : target.side === 'goal' ? goalFlows(target.key, ctx) : drillFlows(target, 'View', savings, ctx);
 const seen = new Set(), queue = [{ side: 'cashflow' }, { side: 'savings' }], silent = [];
 while (queue.length) {
  const target = queue.shift(), id = JSON.stringify(target);
  if (seen.has(id) || target.side === 'link' || target.side === 'record') continue;
  seen.add(id);
  const flows = view(target);
  for (const node of flows.nodes) if (node.open) queue.push(node.open); else silent.push(`${target.side} ${target.key ?? ''}: ${node.name}`);
 }
 assert.deepEqual(silent, [], 'nodes that open nothing');
 for (const side of ['savings', 'cashflow', 'account', 'income', 'expense', 'group', 'merchant', 'operation', 'principal', 'payment', 'interest', 'balance', 'untraced', 'goal']) assert.ok([...seen].some(id => JSON.parse(id).side === side), 'reached a ' + side + ' view');
});

test('a goal lists its additions and withdrawals as entered; a row opens the goal’s history on Goals', () => {
 const goals = [{ id: 'g', name: 'Holiday', account_id: 'card', allocated: 700, target: 1000, target_date: null, archived: false }];
 const event = (id, occurred_on, delta, event_type, extra = {}) => ({ id, goal_id: 'g', operation_id: null, occurred_on, delta, balance: 0, event_type, notes: '', source_name: null, ...extra });
 const goalEvents = [event('e1', '2026-08-05', 300, 'contribution', { source_id: 'card' }), event('e2', '2026-08-20', -100, 'withdrawal', { source_name: 'Old wallet' }), event('e0', '2026-01-01', 400, 'opening'), event('e3', '2026-09-02', 50, 'contribution', { source_id: 'card' })];
 const ctx = { ...context([]), today: '2026-09-20', goalEvents, data: { records: accounts, activity: [], investmentLinks: [], goals } };
 const { goalEventsIn } = loadTS('lib/cash-flow-goal.ts');
 const history = { side: 'link', href: '/goals?view=history&goal=g' };
 assert.deepEqual(goalEventsIn('g', ctx).map(row => [row.event.id, row.source, row.open]), [['e2', 'Old wallet', history], ['e1', 'Card', history]], 'the period only, newest first, never the opening');
 const r = createRenderer();
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), 'next/navigation': { useRouter: () => router }, '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 let closed = 0;
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'goal', key: 'g' }, title: 'Holiday', period: 'August 2026', savings: 0, context: ctx, onClose() { closed += 1; }, onOpenRecord() {} }));
 // The test language returns keys as they are; en.json writes them "Contribution" and "Withdrawal".
 assert.match(r.html(), /<strong>contribution<\/strong><small>5 August 2026 · ← Card<\/small><\/span><span class="positive">\+\$300<\/span>/);
 assert.match(r.html(), /<strong>withdrawal<\/strong><small>20 August 2026 · → Old wallet<\/small><\/span><span>−\$100<\/span>/);
 router.pushed.length = 0;
 r.all(node => node.type === 'button' && node.props['aria-label'] === 'View details for contribution')[0].props.onClick();
 assert.deepEqual([router.pushed, closed], [['/goals?view=history&goal=g'], 1], 'a row closes the dialog and opens the goal’s history');
 const holiday = r.find(node => node.type === 'Sankey').props.data.nodes;
 assert.deepEqual(holiday.filter(node => node.open?.side === 'link').map(node => node.open.href), Array(holiday.filter(node => node.open?.side === 'link').length).fill('/goals?view=history&goal=g'), 'the goal, its balances and accountless sources open its history too');
});

test('a goal history row links to Cash flow, which opens the goal’s Sankey for that month', () => {
 const { goalSankeyHref, drillLink } = loadTS('lib/cash-flow-link.ts');
 const href = goalSankeyHref('g 1', '2026-08');
 assert.equal(href, '/income-expenses?open=goal&key=g%201&month=2026-08');
 assert.deepEqual(drillLink(href.slice(href.indexOf('?'))), { target: { side: 'goal', key: 'g 1' }, month: '2026-08' });
 assert.equal(drillLink('?open=goal&key=g&month=2026-13'), null, 'never an impossible month');
 assert.equal(drillLink('?tag=x'), null);

 const r = createRenderer();
 const modules = {
  'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), 'next/navigation': { useRouter: () => router },
  ...Object.fromEntries(['stat-tile', 'segmented', 'panel-title', 'inline-error', 'loading-placeholder'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])),
  '@/components/ui/dialog': hostModule(), '@/components/ui/button': hostModule(),
  '@/components/category-icons-context': { useCategoryHue: () => key => key },
  '@/hooks/use-owner-resource': { useOwnerResource: () => ({ data: { records: [], events: [] } }) },
  '@/hooks/use-location-search': { useLocationSearch: () => '?open=goal&key=g&month=2026-08' },
  '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 },
 };
 const { CashFlowReport } = r.load('components/cash-flow-report.tsx', modules);
 const goals = [{ id: 'g', name: 'Holiday', account_id: 'card', allocated: 700, target: 1000, target_date: null, archived: false }];
 r.mount(React.createElement(CashFlowReport, { owner: null, demo: true, revision: 0, data: { categories: [], activity: [], investmentLinks: [], records: accounts, goals }, splits: [], month: '2026-10', currency: 'USD', market: { rates: { USD: 1 }, quotes: {} } }));
 r.update();
 const title = r.find(node => node.type === 'DialogTitle').props.children;
 assert.deepEqual([title[0], text(title[2])], ['Holiday', 'August 2026'], 'the goal’s Sankey for the row’s month, not the page’s');
});

test('every Accounts › Recent activity row opens its Sankey in the Cash flow drill-down, for its month', () => {
 const { drillHref, drillLink, linkedTitle, readRange } = loadTS('lib/cash-flow-link.ts');
 for (const target of [{ side: 'goal', key: 'g' }, { side: 'account', key: 'card' }, { side: 'merchant', key: 'EPAM', income: true }, { side: 'merchant', key: 'Cafe', income: false }, { side: 'operation', key: 't' }, { side: 'payment', key: 'mp' }]) {
  const href = drillHref(target, '2026-08');
  assert.deepEqual(drillLink(href.slice(href.indexOf('?'))), { target, month: '2026-08' }, target.side + ' survives the link');
 }
 assert.equal(drillLink('?open=savings&key=x&month=2026-08'), null, 'only what another page links to');
 const data = { records: [...accounts, record('mp', 'Mortgage payment', 'Other expense', 1000, '2026-08-20')], goals: [], activity: [{ id: 'r', action: 'repayment' }], movements: [{ id: 'm', kind: 'buy' }] };
 assert.deepEqual([{ side: 'account', key: 'card' }, { side: 'payment', key: 'mp' }, { side: 'operation', key: 'r' }, { side: 'operation', key: 'm' }, { side: 'merchant', key: 'Cafe', income: false }].map(target => linkedTitle(target, data, key => key)), ['Card', 'Mortgage payment', 'Repayment', 'Buy holding', 'Cafe']);
 assert.deepEqual(readRange('2026-10', '2026-10-20'), { first: '2025-01', readTo: '2026-10', throughToday: true }, 'the year view’s two calendar years');
 assert.deepEqual(readRange('2026-10', '2026-10-20', '2024-12'), { first: '2024-12', readTo: '2026-10', throughToday: true }, 'back to a linked month');
 assert.deepEqual(readRange('2026-10', '2026-10-20', '2024-10'), { first: '2025-01', readTo: '2026-10', throughToday: true }, 'never past two years');
 assert.deepEqual(readRange('2025-03', '2026-10-20'), { first: '2024-01', readTo: '2025-03', throughToday: false }, 'an early month reads to itself when today is too far');

 const r = createRenderer();
 const pushed = [];
 const modules = { '@/components/language-provider': language('en-US'), 'next/navigation': { useRouter: () => ({ push: href => pushed.push(href) }) }, 'next/link': hostModule(), '@/hooks/use-owner-resource': { useOwnerResource: () => ({ data: { records: [] }, initialLoading: false, error: '' }) }, ...Object.fromEntries(['resource-state', 'panel-title', 'pagination'].map(name => ['@/components/presentation-foundation/' + name, { [name === 'resource-state' ? 'ResourceState' : name === 'panel-title' ? 'PanelTitle' : 'Pagination']: ({ children }) => children ?? null }])) };
 const { AccountActivity } = r.load('components/planning/accounts/account-activity.tsx', modules);
 const op = (id, action, extra = {}) => ({ id, action, account_id: 'card', target_id: 'save', amount: 10, received: 10, fee: 0, occurred_on: '2026-08-10', notes: '', before_balance: 0, after_balance: 0, ...extra });
 const planning = { records: [...accounts, record('pay', 'EPAM', 'Salary', 100, '2026-07-05', { account_id: 'card' })], categories: [], goals: [], occurrences: [],
  activity: [op('t', 'transfer'), op('mp', 'mortgage', { target_id: 'home' }), op('x', 'reconcile', { target_id: null })],
  movements: [{ id: 'm', kind: 'buy', source_id: 'card', target_id: 'save', sent: 5, received: 5, source_value: 5, target_value: 5, fee: 0, occurred_on: '2026-08-11', notes: '', realized_gain: null }, { id: 'i', kind: 'interest', source_id: 'save', target_id: 'save', sent: 0, received: 1, source_value: 0, target_value: 1, fee: 0, occurred_on: '2026-08-12', notes: '', realized_gain: null }],
  investmentLinks: [{ id: 'l', account_id: 'card', amount: -50, investment_history: { occurred_on: '2026-06-03', record_id: 'save', event_type: 'buy' } }] };
 r.mount(React.createElement(AccountActivity, { data: planning, owner: null, currency: 'USD' }));
 const rows = r.all(node => node.type === 'tr' && node.props.className === 'clickable-row');
 for (const row of rows) row.props.onClick();
 assert.deepEqual(pushed.sort(), [
  '/income-expenses?open=account&key=card&month=2026-08', '/income-expenses?open=account&key=save&month=2026-06', '/income-expenses?open=account&key=save&month=2026-08',
  '/income-expenses?open=merchant&key=EPAM&month=2026-07&income=1', '/income-expenses?open=operation&key=m&month=2026-08', '/income-expenses?open=operation&key=t&month=2026-08', '/income-expenses?open=payment&key=mp&month=2026-08',
 ], 'a transfer and a buy their transfer view, a mortgage payment its Sankey, a reconciliation and capitalized interest their account, income its payer, cash for an investment its holding');
 pushed.length = 0;
 rows[0].props.onKeyDown({ key: 'Enter', preventDefault() {} });
 rows[0].props.onKeyDown({ key: 'Tab', preventDefault() {} });
 assert.equal(pushed.length, 1, 'Enter opens a row; other keys do not');
});

test('a transaction row opens its Sankey over the page: its payer or merchant for its month, its details one tap away', () => {
 const r = createRenderer();
 const opened = [], read = [];
 let drilling = record('food', 'Market', 'Living expense', 120, '2026-08-06', { account_id: 'card', custom_category_id: 'groceries' }), closed = 0;
 const workspace = () => ({ drilling, setDrilling: value => { closed += value === null ? 1 : 0; drilling = value; }, setViewing: item => opened.push(item.id), storedRecord: item => item, user: null, demo: true, reload: 0,
  planning: { data: { records: [...accounts, drilling ?? record('x', 'x', 'Cash', 0, '2026-01-01')], activity: [], investmentLinks: [], categories: [{ id: 'groceries', name: 'Groceries' }], goals: [], occurrences: [] } },
  transactionTools: { data: { splits: [] } }, currency: 'USD', market: { rates: { USD: 1 }, quotes: {} } });
 const modules = { '@/components/language-provider': language('en-US'), '@/components/workspace/workspace-provider': { useWorkspace: workspace }, 'next/navigation': { useRouter: () => router },
  '@/components/cash-flow-drill-lazy': hostModule(), '@/hooks/use-owner-resource': { useOwnerResource: url => { read.push(url); return { data: { records: [], events: [] } }; } } };
 const { TransactionSankey } = r.load('components/workspace/transaction-sankey.tsx', modules);
 r.mount(React.createElement(TransactionSankey));
 const dialog = r.find(node => node.type === 'CashFlowDrillDialog').props;
 assert.deepEqual([dialog.target, dialog.title, dialog.period, dialog.context.months], [{ side: 'merchant', key: 'Market', income: false }, 'Market', 'August 2026', ['2026-08']]);
 assert.equal(dialog.context.label('groceries'), 'Groceries');
 dialog.onOpenRecord({ id: 'food' });
 assert.deepEqual(opened, ['food'], 'the transaction in its list opens the details');
 dialog.onClose();
 assert.equal(closed, 1);
 const lazy = fs.readFileSync('components/cash-flow-drill-lazy.tsx', 'utf8');
 assert.match(lazy, /dynamic\(\(\) => import\('@\/components\/cash-flow-sankey'\)/, 'the shell loads the charts only when a row opens one');
 r.mount(React.createElement(TransactionSankey));
 assert.equal(r.all(node => node.type === 'CashFlowDrillDialog').length, 0, 'nothing open, nothing drawn');
 const { useCashFlowData } = loadTS('components/cash-flow-data.ts', { react: r.react, '@/hooks/use-owner-resource': { useOwnerResource: url => { read.push(url); return { data: { records: [], events: [] } }; } } });
 read.length = 0;
 const Probe = () => { useCashFlowData({ owner: 'me', demo: false, revision: 0, provided: { records: [] }, month: '2026-10', today: '2026-10-20', linked: '2025-06' }); return null; };
 r.mount(React.createElement(Probe));
 assert.deepEqual(read, ['/api/planning?scope=budget&month=2026-10&from=2025-01', '/api/goal-tools'], 'signed in, it reads the budget read for the bars and the goals’ history');
});

test('a recent transaction on the dashboard opens its Sankey by click, Enter or Space; without a handler it stays plain', () => {
 const r = createRenderer();
 const modules = { '@/components/language-provider': language('en-US'), '@/lib/deposit-interest': { ...loadTS('lib/deposit-interest.ts'), depositToday: () => '2026-08-31' },
  '@/hooks/use-owner-resource': { useOwnerResource: (url, owner, enabled, revision, empty) => ({ data: empty, loading: false }) }, 'next/link': hostModule(), 'lucide-react': hostModule(),
  '@/components/display-money': { useDisplayMoney: () => ({ entered: (amount, currency) => `${currency} ${amount}` }) } };
 const { RecentTransactionsCard } = r.load('components/dashboard-cards.tsx', modules);
 const data = { records: [record('pay', 'EPAM', 'Salary', 3000, '2026-08-05'), record('food', 'Market', 'Living expense', 50, '2026-08-06')], categories: [], goals: [], occurrences: [], activity: [] };
 const opened = [];
 r.mount(React.createElement(RecentTransactionsCard, { data, onOpen: item => opened.push(item.id) }));
 const rows = r.all(node => node.type === 'li' && node.props.role === 'button');
 assert.deepEqual(rows.map(row => row.props['aria-label']), ['Open Market', 'Open EPAM'], 'newest first, each a button');
 rows[0].props.onClick();
 rows[1].props.onKeyDown({ key: 'Enter', preventDefault() {} });
 rows[1].props.onKeyDown({ key: ' ', preventDefault() {} });
 rows[1].props.onKeyDown({ key: 'Tab', preventDefault() {} });
 assert.deepEqual(opened, ['food', 'pay', 'pay']);
 r.mount(React.createElement(RecentTransactionsCard, { data }));
 assert.equal(r.all(node => node.type === 'li' && node.props.role === 'button').length, 0);
 assert.match(fs.readFileSync('components/workspace/screens/overview-screen.tsx', 'utf8'), /<RecentTransactionsCard [^\n]*onOpen=\{record => setDrilling\(storedRecord\(record\)\)\}\/>/, 'the dashboard opens the shared transaction Sankey');
});

test('an upcoming or recurring payment opens its schedule’s Sankey: what paid it and what is still due, its details from there', () => {
 const rent = record('rent', 'Rent', 'Rent expense', 1000, '2026-01-05', { frequency: 'Monthly' });
 const salary = record('sal', 'EPAM', 'Salary', 3000, '2026-01-01', { frequency: 'Monthly' });
 const records = [...accounts, rent, salary,
  record('p1', 'Rent', 'Rent expense', 600, '2026-08-05', { account_id: 'card', occurrence_record_id: 'rent', occurrence_due_on: '2026-08-05' }),
  record('p2', 'Rent', 'Rent expense', 100, '2026-08-07', { occurrence_record_id: 'rent', occurrence_due_on: '2026-08-05' }),
  record('p3', 'Rent', 'Rent expense', 999, '2026-07-05', { account_id: 'card', occurrence_record_id: 'rent', occurrence_due_on: '2026-07-05' }),
  record('s1', 'EPAM', 'Salary', 3000, '2026-08-01', { account_id: 'save', occurrence_record_id: 'sal', occurrence_due_on: '2026-08-01' })];
 const ctx = { ...context([]), data: { records, activity: [], investmentLinks: [] } };
 const { scheduleFlows, schedulePayments, recurringTarget, dueTarget } = loadTS('lib/cash-flow-schedule.ts');
 const due = recurringTarget({ record: rent, date: '2026-08-05', amount: 1000, direction: 'expense', status: 'due' });
 assert.deepEqual(due, { side: 'schedule', key: 'rent', date: '2026-08-05', due: { amount: 1000, currency: 'USD' }, direction: 'expense', open: true });
 const bill = scheduleFlows(due, ctx);
 assert.deepEqual(shape(bill), [['Card', 'Rent', 600], ['No account', 'Rent', 100], ['Remaining', 'Rent', 300], ['Rent', 'Rent expense', 1000]], 'its own due date only, by account, with what is still due');
 assert.deepEqual(bill.nodes.map(node => node.open?.side ?? null), ['account', 'account', 'details', 'details', 'expense'], 'the schedule and what is still due open its details');
 assert.deepEqual(schedulePayments(due, ctx).map(item => item.id), ['p2', 'p1']);
 const paid = scheduleFlows({ ...due, open: false }, ctx);
 assert.ok(!paid.nodes.some(node => node.name === 'Remaining'), 'paid or skipped: nothing remains');
 const pay = scheduleFlows(recurringTarget({ record: salary, date: '2026-08-01', amount: 3000, direction: 'income', status: 'paid' }), ctx);
 assert.deepEqual(shape(pay), [['Salary', 'EPAM', 3000], ['EPAM', 'Savings account', 3000]], 'income: its category in, the account it reached out');
 assert.deepEqual(recurringTarget({ record: accounts[2], date: '2026-08-10', amount: 300, direction: 'expense', status: 'due', installment: true }), { side: 'account', key: 'loan' }, 'a loan’s payment opens the loan');
 assert.deepEqual(dueTarget({ record: rent, date: '2026-08-05', amount: 1000, type: 'scheduled' }).side, 'schedule');
 assert.deepEqual(dueTarget({ record: accounts[2], date: '2026-08-10', amount: 300, type: 'repayment' }), { side: 'account', key: 'loan' });
 const noRate = scheduleFlows(due, { ...ctx, currency: 'GBP' });
 assert.deepEqual([noRate.links.length, noRate.missing], [0, 1], 'without a rate for the due amount nothing is drawn, and it is counted as missing');

 const r = createRenderer();
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), 'next/navigation': { useRouter: () => router }, '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 let details = 0;
 r.mount(React.createElement(CashFlowDrillDialog, { target: due, title: 'Rent', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord() {}, onDetails: () => { details += 1; } }));
 const sankey = r.find(node => node.type === 'Sankey').props, hub = sankey.data.nodes.findIndex(node => node.name === 'Rent');
 sankey.node({ x: 0, y: 0, width: 10, height: 20, index: hub, payload: { name: 'Rent', value: 1 } }).props.onClick();
 assert.equal(details, 1, 'the schedule opens its details');
 r.fire(r.all(node => node.type === 'Button' && node.props.className === 'cash-flow-drill-details')[0], 'onClick');
 assert.equal(details, 2, 'and so does the Details button, there even when nothing was paid or recorded');
 assert.equal(r.all(node => node.type === 'button' && node.props['aria-label'] === 'View details for Rent').length, 2, 'its payments are listed');
 r.mount(React.createElement(CashFlowDrillDialog, { target: due, title: 'Rent', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord() {} }));
 const plain = r.find(node => node.type === 'Sankey').props;
 assert.equal(plain.node({ x: 0, y: 0, width: 10, height: 20, index: hub, payload: { name: 'Rent', value: 1 } }).props.role, undefined, 'without details to open, the schedule is plain');
 const page = fs.readFileSync('components/planning/upcoming-page.tsx', 'utf8');
 assert.match(page, /const open = \(item: RecurringItem\) => onSankey \? onSankey\(\{ target: recurringTarget\(item\), title: item\.record\.name, month: item\.date\.slice\(0, 7\), onDetails: \(\) => details\.open\(item\) \}\) : details\.open\(item\);/);
 assert.match(page, /<tr key=\{item\.key\} \{\.\.\.reminderRow\(onSankey, item\)\}>/, 'debt repayments and deposit maturities open their account');
 assert.match(fs.readFileSync('components/overview-page.tsx', 'utf8'), /<li key=\{item\.key\} \{\.\.\.dueRow\(onSankey, item, /, 'the dashboard’s upcoming payments too');
});

test('a schedule opened from the dashboard, where its history is not at hand, opens Recurring from its own node', () => {
 const r = createRenderer();
 let sankey = { target: { side: 'schedule', key: 'rent', date: '2026-08-05', due: { amount: 1000, currency: 'USD' }, direction: 'expense', open: true }, title: 'Rent', month: '2026-08' }, closed = 0;
 const workspace = () => ({ drilling: null, sankey, setSankey: value => { closed += value === null ? 1 : 0; sankey = value; }, setViewing() {}, storedRecord: item => item, user: null, demo: true, reload: 0,
  planning: { data: { records: accounts, activity: [], investmentLinks: [], categories: [], goals: [], occurrences: [] } }, transactionTools: { data: { splits: [] } }, currency: 'USD', market: { rates: { USD: 1 }, quotes: {} } });
 const modules = { '@/components/language-provider': language('en-US'), '@/components/workspace/workspace-provider': { useWorkspace: workspace }, 'next/navigation': { useRouter: () => router },
  '@/components/cash-flow-drill-lazy': hostModule(), '@/hooks/use-owner-resource': { useOwnerResource: () => ({ data: { records: [], events: [] } }) } };
 const { TransactionSankey } = r.load('components/workspace/transaction-sankey.tsx', modules);
 r.mount(React.createElement(TransactionSankey));
 const dialog = r.find(node => node.type === 'CashFlowDrillDialog').props;
 assert.deepEqual([dialog.title, dialog.period], ['Rent', 'August 2026']);
 router.pushed.length = 0;
 dialog.onDetails();
 assert.deepEqual([router.pushed, closed], [['/upcoming'], 1]);
 sankey = { target: { side: 'account', key: 'loan' }, title: 'Car loan', month: '2026-08', onDetails: () => {} };
 r.mount(React.createElement(TransactionSankey));
 assert.equal(r.find(node => node.type === 'CashFlowDrillDialog').props.onDetails, sankey.onDetails, 'a page that has the details opens them itself');
});

test('a subscription row opens its merchant’s Sankey; its menu and Restore button do only their own thing', () => {
 const r = createRenderer();
 const charge = record('n3', 'Netflix', 'Living expense', 18, '2026-10-11', { account_id: 'card' });
 const item = { id: 'netflix', merchant: 'netflix', currency: 'USD', record: charge, cadence: 'monthly', amount: 18, yearly: 216, next: '2026-11-11', missed: false, priceIncrease: null };
 const modules = { '@/components/language-provider': language('en-US'), 'lucide-react': hostModule(), '@/components/display-money': { useDisplayMoney: () => ({ entered: (amount, currency) => `${currency} ${amount}`, showSum: () => '' }) },
  ...Object.fromEntries(['category-icon', 'count', 'empty-state', 'error-popup', 'panel-title', 'row-menu'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])),
  '@/components/presentation-foundation/resource-state': { ResourceState: ({ children }) => children }, '@/components/ui/button': hostModule(), '@/hooks/use-columns-fit': { useColumnsFit: () => null },
  '@/lib/recurring-insights': { applySubscriptionDecisions: () => ({ active: [item], hidden: [{ item: { ...item, id: 'gym', record: { ...charge, id: 'g1', name: 'Gym' } }, decision: { status: 'cancelled' } }] }), detectSubscriptions: () => [], subscriptionTotals: () => [], cadenceLabels: { monthly: 'Every month' }, recurringPlanDraft: () => ({}) } };
 const { SubscriptionsPanel } = r.load('components/planning/subscriptions-panel.tsx', modules);
 const opened = [];
 r.mount(React.createElement(SubscriptionsPanel, { records: [], decisions: [], loading: false, onRetry() {}, decide: async () => {}, restore: async () => {}, onTrack() {}, onOpen: found => opened.push(found.id) }));
 const rows = r.all(node => node.type === 'li' && node.props['data-clickable']);
 assert.deepEqual(rows.map(row => row.props['aria-label']), ['Open Netflix', 'Open Gym'], 'active and hidden subscriptions');
 const inside = { closest: () => null }, onButton = { closest: () => ({}) };
 const event = target => ({ target, currentTarget: { contains: () => true } });
 rows[0].props.onClick(event(inside));
 rows[0].props.onClick(event(onButton));
 rows[1].props.onKeyDown({ key: 'Enter', target: 1, currentTarget: 1, preventDefault() {} });
 assert.deepEqual(opened, ['n3', 'g1'], 'its last charge, which the transaction Sankey opens for its merchant and month');
 r.mount(React.createElement(SubscriptionsPanel, { records: [], decisions: [], loading: false, onRetry() {}, decide: async () => {}, restore: async () => {}, onTrack() {} }));
 assert.equal(r.all(node => node.type === 'li' && node.props['data-clickable']).length, 0, 'without a handler the rows stay plain');
 assert.match(fs.readFileSync('components/workspace/screens/upcoming-screen.tsx', 'utf8'), /<SubscriptionsPanel [^\n]*onOpen=\{record => setDrilling\(record\)\}\/>/);
});

test('a Budget row opens its category’s Sankey for the month or the year to date, its details from the category', () => {
 const screen = fs.readFileSync('components/workspace/screens/budget-screen.tsx', 'utf8');
 assert.match(screen, /onOpen=\{openSankey\}/);
 assert.match(screen, /target: row\.key === flexBucketKey \? \{ side: 'group', income: false, keys: categories\.filter\(item => item\.direction === 'expense' && item\.type === 'flexible' && !item\.excluded\)\.map\(item => item\.key\), by: 'category' \} : \{ side: row\.direction === 'income' \? 'income' : 'expense', key: row\.key \}/, 'the flexible bucket opens its categories together');
 assert.match(screen, /months: view === 'year' \? periodMonths\(month, 'year'\) : undefined/);
 const r = createRenderer();
 let sankey = { target: { side: 'expense', key: 'Living expense' }, title: 'Living expense', month: '2026-08', months: ['2026-01', '2026-02', '2026-08'], period: '2026', onDetails() {} };
 const workspace = () => ({ drilling: null, sankey, setSankey: value => { sankey = value; }, setViewing() {}, storedRecord: item => item, user: null, demo: true, reload: 0,
  planning: { data: { records: accounts, activity: [], investmentLinks: [], categories: [], goals: [], occurrences: [] } }, transactionTools: { data: { splits: [] } }, currency: 'USD', market: { rates: { USD: 1 }, quotes: {} } });
 const reads = [];
 const modules = { '@/components/language-provider': language('en-US'), '@/components/workspace/workspace-provider': { useWorkspace: workspace }, 'next/navigation': { useRouter: () => router },
  '@/components/cash-flow-drill-lazy': hostModule(), '@/hooks/use-owner-resource': { useOwnerResource: url => { reads.push(url); return { data: { records: [], events: [] } }; } } };
 const { TransactionSankey } = r.load('components/workspace/transaction-sankey.tsx', modules);
 r.mount(React.createElement(TransactionSankey));
 const dialog = r.find(node => node.type === 'CashFlowDrillDialog').props;
 assert.deepEqual([dialog.period, dialog.context.months, dialog.onDetails], ['2026', ['2026-01', '2026-02', '2026-08'], sankey.onDetails], 'the year to date, labelled by its year, with the category’s details');
});

test('a Reports row narrows the transactions and opens its Sankey for the report’s period', () => {
 const { reportDrillTarget } = loadTS('lib/cash-flow-link.ts');
 assert.deepEqual(reportDrillTarget({ direction: 'expense', category: 'groceries', business: 'shop' }), { side: 'expense', key: 'groceries' }, 'a category, from any tab');
 assert.deepEqual(reportDrillTarget({ direction: 'income', merchant: 'EPAM' }), { side: 'merchant', key: 'EPAM', income: true });
 assert.deepEqual(reportDrillTarget({ direction: 'expense', categories: ['a', 'b'] }), { side: 'group', income: false, keys: ['a', 'b'], by: 'category' }, 'a merged Other');
 assert.equal(reportDrillTarget({ business: 'shop' }), null, 'a business alone only narrows');
 assert.equal(reportDrillTarget({ direction: 'expense', categories: [] }), null);
 const screen = fs.readFileSync('components/workspace/screens/reports-screen.tsx', 'utf8');
 assert.match(screen, /if \(target\) setSankey\(\{ target, title: label, month: end\.slice\(0, 7\), months: monthsBetween\(range\.from\.slice\(0, 7\), end\.slice\(0, 7\)\), period: rangeLabel \}\);/);
});

test('a Loans & debts row opens its Sankey for this month, its Details editing it', () => {
 const table = fs.readFileSync('components/workspace/records-table.tsx', 'utf8');
 assert.match(table, /const openRecord = \(r: Entry\) => setSankey\(\{ target: \{ side: 'account', key: r\.id \}, title: shownName\(r, t, categoryOf\(r\)\), month: depositToday\(\)\.slice\(0, 7\), onDetails: \(\) => editRecord\(r\) \}\);/);
 assert.match(table, /:\{className:'clickable-row',tabIndex:0,'aria-label':t\('Open \{name\}'[^}]*\}\),onClick:\(event:ReactMouseEvent\)=>\{const target=event\.target as HTMLElement;if\(event\.currentTarget\.contains\(target\)&&!target\.closest\('button,a,input'\)\)openRecord\(r\);\}/, 'by click, never from its menu or buttons');
 assert.match(table, /openRecord\(r\);\}\}\}\)\}>/, 'and by Enter or Space');
});

test('an Investments card opens its holding’s Sankey, a holding account its holdings together', () => {
 const vt = record('vt', 'VT', 'Stock', 120, '2026-01-01', { frequency: 'Monthly', quantity: 5, cost: 100, holding_account_id: 'broker' });
 const btc = record('btc', 'Bitcoin', 'Crypto', 60000, '2026-01-01', { frequency: 'Monthly', quantity: 0.01, holding_account_id: 'broker' });
 const movement = (id, kind, source_id, target_id, value, occurred_on) => ({ id, kind, source_id, target_id, sent: value, received: value, source_value: value, target_value: value, fee: 0, occurred_on, notes: '', realized_gain: null });
 const movements = [movement('m1', 'buy', 'card', 'vt', 300, '2026-08-10'), movement('m2', 'buy', 'save', 'btc', 200, '2026-08-11'), movement('m3', 'transfer', 'vt', 'btc', 50, '2026-08-12'), movement('m4', 'sell', 'btc', 'card', 80, '2026-08-13')];
 const ctx = { ...context([]), data: { records: [...accounts, vt, btc], activity: [], investmentLinks: [], movements } };
 const { holdingsFlows } = loadTS('lib/cash-flow-holdings.ts');
 const broker = holdingsFlows({ side: 'holdings', keys: ['vt', 'btc'] }, 'Broker', ctx);
 assert.deepEqual(shape(broker), [['Card', 'Broker', 220], ['Savings account', 'Broker', 200], ['Broker', 'VT', 250], ['Broker', 'Bitcoin', 170]], 'bought $500, sold $80 back to the card; the $50 between its own holdings stays inside');
 assert.deepEqual(broker.nodes.map(node => node.open?.side ?? null), ['account', 'account', 'link', 'account', 'account'], 'each source and holding opens; the account itself opens Accounts');

 const r = createRenderer();
 const { AssetCard } = r.load('components/presentation-foundation/asset-card.tsx', { '@/components/language-provider': language('en-US'), 'lucide-react': hostModule(), '@/components/presentation-foundation/asset-icon': hostModule(), '@/components/presentation-foundation/category-badge': hostModule() });
 let opened = 0;
 r.mount(React.createElement(AssetCard, { record: vt, label: 'Stock', worth: '$600', share: 50, detailsLabel: 'Details', details: null, onOpen: () => { opened += 1; } }));
 const card = r.find(node => node.type === 'article').props;
 assert.equal(card['aria-label'], 'Open VT');
 card.onClick({ target: { closest: () => null } });
 card.onClick({ target: { closest: () => ({}) } });
 card.onKeyDown({ key: ' ', target: 1, currentTarget: 1, preventDefault() {} });
 assert.equal(opened, 2, 'a tap on the card and Space open it; one on its menu, details or buttons does not');
 r.mount(React.createElement(AssetCard, { record: vt, label: 'Stock', worth: '$600', share: 50, detailsLabel: 'Details', details: null }));
 assert.equal(r.find(node => node.type === 'article').props['data-clickable'], undefined, 'without onOpen it only shows');
 const screen = fs.readFileSync('components/workspace/screens/assets-screen.tsx', 'utf8');
 assert.match(screen, /const openHolding = \(record: Entry\) => setSankey\(\{ target: \{ side: 'account', key: record\.id \}, title: record\.name, month, onDetails: \(\) => editRecord\(record\) \}\);/);
 assert.match(screen, /const openAccount = \(account: HoldingAccount, holdings: string\[\]\) => setSankey\(\{ target: \{ side: 'holdings', keys: holdings \}, title: account\.name, month \}\);/);
 assert.match(screen, /onOpen=\{openHolding\} onOpenAccount=\{openAccount\}/);
});
