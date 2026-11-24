import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTS } from './helpers/load-ts.mjs';
const { netIncomeFlows, lineScope } = loadTS('lib/net-income-flows.ts');
const { savingsEnds } = loadTS('lib/cash-flow-drill.ts');

const labels = { principal: name => `${name}: Principal`, other: 'Other', accounts: 'Accounts' };
const node = (name, kind, drill = null) => ({ name, kind, drill, owner: null });
// Salary 1,000 in; Food 300 out; Net income 700.
const base = () => ({ nodes: [node('Income', 'total'), node('Salary', 'income'), node('Net income', 'savings', { savings: 700 }), node('Food', 'expense')], links: [{ source: 1, target: 0, value: 1000 }, { source: 0, target: 2, value: 700 }, { source: 0, target: 3, value: 300 }] });
const end = (name, kind, value, open = { side: 'account', key: name }) => ({ node: { name, kind, open }, value });
const flow = (data, from, to) => data.links.find(link => data.nodes[link.source].name === from && data.nodes[link.target].name === to)?.value;

test('Net income opens up into where the money went, right under it', () => {
 const data = netIncomeFlows(base(), 700, { left: [], right: [end('Card', 'account', 400), end('Bitcoin', 'holding', 200), end('Home loan', 'debt', 100)] }, labels);
 assert.deepEqual(data.nodes.map(item => item.name), ['Income', 'Salary', 'Net income', 'Card', 'Bitcoin', 'Home loan: Principal', 'Food']);
 assert.equal(flow(data, 'Net income', 'Card'), 400);
 assert.equal(flow(data, 'Net income', 'Bitcoin'), 200);
 assert.equal(flow(data, 'Net income', 'Home loan: Principal'), 100);
 // The flows that were there still join the same nodes after the insert.
 assert.equal(flow(data, 'Salary', 'Income'), 1000);
 assert.equal(flow(data, 'Income', 'Food'), 300);
 assert.equal(flow(data, 'Income', 'Net income'), 700);
 assert.deepEqual(data.nodes[4], { name: 'Bitcoin', kind: 'holding', owner: null, drill: { open: { target: { side: 'account', key: 'Bitcoin' }, title: 'Bitcoin' } } });
});

test('an account drawn down feeds Net income beside the income', () => {
 // 700 kept and 4,300 from Savings bought a 5,000 car.
 const data = netIncomeFlows(base(), 700, { left: [end('Savings', 'account', 4300)], right: [end('Car', 'holding', 5000)] }, labels);
 assert.equal(flow(data, 'Savings', 'Net income'), 4300);
 assert.equal(flow(data, 'Net income', 'Car'), 5000);
 assert.equal(data.nodes.at(-1).name, 'Savings', 'a source goes last, below the income sources');
});

test('an end that only leads to a page opens where the net income went', () => {
 const data = netIncomeFlows(base(), 700, { left: [], right: [end('Card', 'account', 700, { side: 'link', href: '/accounts' })] }, labels);
 assert.deepEqual(data.nodes[3].drill, { savings: 700 });
});

test('small ends merge into Other', () => {
 const right = Array.from({ length: 9 }, (_, index) => end('Account ' + index, 'account', 90 - index));
 const data = netIncomeFlows(base(), 765, { left: [], right }, labels, 4);
 assert.deepEqual(data.nodes.slice(3, 7).map(item => item.name), ['Account 0', 'Account 1', 'Account 2', 'Other']);
 assert.equal(flow(data, 'Net income', 'Other'), 87 + 86 + 85 + 84 + 83 + 82);
});

test('spending above income: the accounts cover it and still show what they paid', () => {
 const over = { nodes: [node('Income', 'total'), node('Salary', 'income'), node('Food', 'expense')], links: [{ source: 1, target: 0, value: 1000 }, { source: 0, target: 2, value: 1200 }] };
 const data = netIncomeFlows(over, -200, { left: [end('Card', 'account', 500)], right: [end('Home loan', 'debt', 300)] }, labels);
 assert.equal(flow(data, 'Card', 'Accounts'), 500);
 assert.equal(flow(data, 'Accounts', 'Income'), 200);
 assert.equal(flow(data, 'Accounts', 'Home loan: Principal'), 300);
});

test('nothing to add leaves the chart as it was', () => {
 const chart = base();
 assert.equal(netIncomeFlows(chart, 700, { left: [], right: [] }, labels), chart);
 const business = { nodes: [node('Shop', 'business'), node('Net profit', 'savings')], links: [{ source: 0, target: 1, value: 5 }] };
 assert.equal(netIncomeFlows(business, 5, { left: [], right: [end('Card', 'account', 5)] }, labels), business, 'a business alone has no household total');
});

test('lineScope keeps the lines in view, by record or by id', () => {
 const scope = lineScope([{ id: 'a', record: { id: 'r1' } }, { id: 'loose', record: null }], true);
 assert.equal(scope.keep({ id: 'r1' }, 'x'), true);
 assert.equal(scope.keep({ id: 'r2' }, 'x'), false);
 assert.equal(scope.keep(null, 'loose'), true);
 assert.equal(scope.keep(null, 'other'), false);
 assert.equal(scope.whole, true);
});

test('savingsEnds: income lands in the account it was recorded against', () => {
 const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
 const records = [record('card', 'Card', 'Cash', 0, '2026-01-01'), record('pay', 'Pay', 'Salary', 1000, '2026-10-05', { account_id: 'card' })];
 const ends = savingsEnds(1000, { data: { records, activity: [], investmentLinks: [], movements: [] }, splits: [], months: ['2026-10'], currency: 'USD', today: '2026-10-20', rates: 1, t: key => key });
 assert.deepEqual(ends.right.map(item => [item.node.name, item.value]), [['Card', 1000]]);
 assert.deepEqual(ends.left, []);
});
