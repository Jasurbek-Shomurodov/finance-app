import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTS } from './helpers/load-ts.mjs';
const { netIncomeFlows, lineScope } = loadTS('lib/net-income-flows.ts');
const { savingsEnds } = loadTS('lib/cash-flow-drill.ts');

const labels = { principal: name => `${name}: Principal`, other: 'Other' };
const node = (name, kind, drill = null) => ({ name, kind, drill, owner: null });
// Salary 1,000 in; Food 300 out; Net income 700.
const base = () => ({ nodes: [node('Income', 'total'), node('Salary', 'income'), node('Net income', 'savings', { savings: 700 }), node('Food', 'expense')], links: [{ source: 1, target: 0, value: 1000 }, { source: 0, target: 2, value: 700 }, { source: 0, target: 3, value: 300 }] });
const end = (name, kind, value, open = { side: 'account', key: name }) => ({ node: { name, kind, open }, value });
const flow = (data, from, to) => data.links.find(link => data.nodes[link.source].name === from && data.nodes[link.target].name === to)?.value;

test('where the rest went stands in Net income\'s place, beside the spending', () => {
 const data = netIncomeFlows(base(), { left: [], right: [end('Card', 'account', 400), end('Bitcoin', 'holding', 200), end('Home loan', 'debt', 100)] }, labels);
 assert.deepEqual(data.nodes.map(item => item.name), ['Income', 'Salary', 'Card', 'Bitcoin', 'Home loan: Principal', 'Food']);
 assert.equal(flow(data, 'Income', 'Card'), 400);
 assert.equal(flow(data, 'Income', 'Bitcoin'), 200);
 assert.equal(flow(data, 'Income', 'Home loan: Principal'), 100);
 // The flows that were there still join the same nodes.
 assert.equal(flow(data, 'Salary', 'Income'), 1000);
 assert.equal(flow(data, 'Income', 'Food'), 300);
 assert.equal(data.links.length, 5, 'the flow into Net income is gone with its node');
 assert.deepEqual(data.nodes[3], { name: 'Bitcoin', kind: 'holding', owner: null, drill: { open: { target: { side: 'account', key: 'Bitcoin' }, title: 'Bitcoin' } } });
});

test('an account drawn down is a source beside the income: every flow runs left to right through the total', () => {
 // 700 kept and 4,300 from Savings bought a 5,000 car.
 const data = netIncomeFlows(base(), { left: [end('Savings', 'account', 4300)], right: [end('Car', 'holding', 5000)] }, labels);
 assert.equal(flow(data, 'Savings', 'Income'), 4300);
 assert.equal(flow(data, 'Income', 'Car'), 5000);
 assert.equal(data.nodes.at(-1).name, 'Savings', 'it goes last, below the income sources');
 const into = data.links.filter(link => data.nodes[link.target].kind === 'total').reduce((sum, link) => sum + link.value, 0), out = data.links.filter(link => data.nodes[link.source].kind === 'total').reduce((sum, link) => sum + link.value, 0);
 assert.equal(into, out, 'what comes in is what goes out');
});

test('an end that only leads to a page opens where the net income went', () => {
 const data = netIncomeFlows(base(), { left: [], right: [end('Card', 'account', 700, { side: 'link', href: '/accounts' })] }, labels);
 assert.deepEqual(data.nodes[2].drill, { savings: 700 });
});

test('small ends merge into Other', () => {
 const right = Array.from({ length: 9 }, (_, index) => end('Account ' + index, 'account', 90 - index));
 const data = netIncomeFlows(base(), { left: [], right }, labels, 4);
 assert.deepEqual(data.nodes.slice(2, 6).map(item => item.name), ['Account 0', 'Account 1', 'Account 2', 'Other']);
 assert.equal(flow(data, 'Income', 'Other'), 87 + 86 + 85 + 84 + 83 + 82);
});

test('spending above income: the accounts drawn down feed the total and still show what they paid', () => {
 const over = { nodes: [node('Income', 'total'), node('Salary', 'income'), node('Food', 'expense')], links: [{ source: 1, target: 0, value: 1000 }, { source: 0, target: 2, value: 1200 }] };
 const data = netIncomeFlows(over, { left: [end('Card', 'account', 500)], right: [end('Home loan', 'debt', 300)] }, labels);
 assert.equal(flow(data, 'Card', 'Income'), 500);
 assert.equal(flow(data, 'Income', 'Home loan: Principal'), 300);
 assert.equal(flow(data, 'Income', 'Food'), 1200);
});

test('nothing to add leaves the chart as it was', () => {
 const chart = base();
 assert.equal(netIncomeFlows(chart, { left: [], right: [] }, labels), chart);
 const business = { nodes: [node('Shop', 'business'), node('Net profit', 'savings')], links: [{ source: 0, target: 1, value: 5 }] };
 assert.equal(netIncomeFlows(business, { left: [], right: [end('Card', 'account', 5)] }, labels), business, 'a business alone has no household total');
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
