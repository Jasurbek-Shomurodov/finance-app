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
 assert.deepEqual(savings.nodes.filter(node => node.open).map(node => [node.name, node.open]), [['Savings account', { side: 'account', key: 'save' }], ['Card', { side: 'account', key: 'card' }], ['Car loan', { side: 'account', key: 'loan' }]], 'every account and debt opens its own Sankey');
 const card = drillFlows({ side: 'account', key: 'card' }, 'Card', 0, ctx);
 assert.deepEqual(shape(card), [['EPAM', 'Card', 3000], ['Card', 'Savings account', 1490], ['Card', 'Groceries', 500], ['Card', 'Car loan', 300], ['Card', 'Not traced', 10], ['Card', 'Balance', 700]]);
 assert.deepEqual(card.nodes.map(node => node.open?.side ?? null), ['merchant', null, 'account', 'expense', 'account', null, null], 'income sources, categories and other accounts open; the account itself, its balance and the gap do not');
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
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
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
 assert.deepEqual(groceries.nodes.map(node => node.open ?? null), [null, { side: 'merchant', key: 'Costco', income: false }, { side: 'merchant', key: 'Cafe', income: false }], 'each merchant opens; the category itself does not');
 const costco = drillFlows({ side: 'merchant', key: 'Costco', income: false }, 'Costco', 0, ctx);
 assert.deepEqual(shape(costco), [['Card', 'Costco', 120], ['No account', 'Costco', 80], ['Costco', 'Groceries', 120], ['Costco', 'Household', 80]], 'across every category, never the GBP amount without a rate');
 assert.equal(costco.missing, 1);
 assert.deepEqual(costco.nodes.map(node => node.open?.side ?? null), ['account', null, null, 'expense', 'expense'], 'its account and categories open; No account and the merchant do not');
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
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
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
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
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
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
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
 assert.match(details, /<dt>Amount<\/dt><dd>\$100<\/dd><dt>Received<\/dt><dd>€220<\/dd><dt>Transfer fee<\/dt><dd>\$2<\/dd><dt>Notes<\/dt><dd>Trip money<\/dd>/);
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
 const modules = { 'recharts': hostModule(), 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'), '@/components/ui/dialog': hostModule(), '@/components/ui/button': hostModule(), '@/lib/sankey-labels': { measureLabel: () => 0, sankeyLabelMargins: () => ({ left: 0, right: 0 }), sankeyMinWidth: () => 0 } };
 const { CashFlowDrillDialog } = r.load('components/cash-flow-sankey.tsx', modules);
 r.mount(React.createElement(CashFlowDrillDialog, { target: { side: 'account', key: 'save' }, title: 'Savings account', period: 'August 2026', savings: 0, context: ctx, onClose() {}, onOpenRecord() {} }));
 assert.match(r.html(), /<strong>Buy holding<\/strong><small>12 August 2026 · → VT<\/small><\/span><span>−\$300<\/span>/);
 assert.match(r.html(), /<strong>Transfer<\/strong><small>11 August 2026 · ← Card<\/small><\/span><span class="positive">\+\$495<\/span>/);
 r.fire(r.all(node => node.type === 'button' && node.props['aria-label'] === 'View details for Transfer')[0], 'onClick');
 assert.match(r.html(), /<dt>Amount<\/dt><dd>\$500<\/dd><dt>Received<\/dt><dd>\$495<\/dd><dt>Transfer fee<\/dt><dd>\$5<\/dd>/);
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
 assert.deepEqual(shape(drillFlows({ side: 'account', key: 'home' }, 'Home', 0, ctx)), [['Card', 'Home', 600], ['Home', 'Principal', 600]], 'only the principal reaches the mortgage; the interest is spending');
 const { drillTransactions } = loadTS('lib/cash-flow-drill.ts');
 const { accountOperations } = loadTS('lib/cash-flow-operations.ts');
 assert.deepEqual(drillTransactions({ side: 'account', key: 'home' }, ctx).map(item => item.id), ['mp'], 'the mortgage lists its payment');
 assert.deepEqual(drillTransactions({ side: 'account', key: 'card' }, ctx).map(item => item.id), ['mp', 'pay'], 'and so does the account that paid it');
 assert.deepEqual(accountOperations('loan', ctx).map(row => row.id), ['r1'], 'the loan lists its repayment');
});
