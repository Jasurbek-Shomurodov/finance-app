import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { mainTarget, mainFlows } = loadTS('lib/cash-flow-main.ts');
const { goalFlows, goalEventsIn } = loadTS('lib/cash-flow-goal.ts');
const { scheduleFlows, schedulePayments } = loadTS('lib/cash-flow-schedule.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const card = record('card', 'Card', 'Cash', 0, '2026-01-01', { frequency: 'Monthly' });
// The smallest context the drill-downs accept: no activity, links, categories, goals or goal history.
const context = (records, extra = {}) => ({ data: { records: [card, ...records] }, splits: [], months: ['2026-08'], currency: 'USD', today: '2026-08-31', rates: { USD: 1, EUR: 0.5 }, t: key => key, ...extra });
const shape = flows => flows.links.map(link => [flows.nodes[link.source].name, flows.nodes[link.target].name, link.value]);

test('a node of the main Cash flow Sankey opens its category, Savings, a merged Other or every income source', () => {
 assert.equal(mainTarget(undefined), null);
 assert.deepEqual(mainTarget({ kind: 'savings', name: 'Savings' }), { side: 'savings' });
 assert.deepEqual(mainTarget({ kind: 'total', name: 'Income', keys: ['Salary'] }), { side: 'group', income: true, keys: ['Salary'], by: 'merchant' });
 assert.equal(mainTarget({ kind: 'total', name: 'Income' }), null, 'an income total without sources opens nothing');
 assert.deepEqual(mainTarget({ kind: 'income', name: 'Salary', key: 'Salary' }), { side: 'income', key: 'Salary' });
 assert.deepEqual(mainTarget({ kind: 'expense', name: 'Food', key: 'Living expense' }), { side: 'expense', key: 'Living expense' });
 assert.deepEqual(mainTarget({ kind: 'expense', name: 'Other', keys: ['Charity', 'Rent expense'] }), { side: 'group', income: false, keys: ['Charity', 'Rent expense'], by: 'category' });
 assert.deepEqual(mainTarget({ kind: 'income', name: 'Other', keys: ['Gift'] }), { side: 'group', income: true, keys: ['Gift'], by: 'category' });
 assert.equal(mainTarget({ kind: 'expense', name: 'Other' }), null);
});

test('the main flows read a context without activity, links or categories, naming categories through t', () => {
 const flows = mainFlows(context([record('e', 'EPAM', 'Salary', 2000, '2026-08-05'), record('m', 'Market', 'Living expense', 500, '2026-08-06')]));
 assert.ok(flows.nodes.some(node => node.kind === 'savings' && node.open?.side === 'savings'));
 assert.ok(flows.nodes.some(node => node.kind === 'expense' && node.open?.side === 'expense'));
 assert.equal(flows.missing, 0);
});

const goal = (extra = {}) => ({ id: 'g', name: 'Holiday', allocated: 500, ...extra });
const event = (id, delta, occurred_on, extra = {}) => ({ id, goal_id: 'g', delta, occurred_on, event_type: 'contribution', ...extra });

test('a goal’s Sankey names each addition by its account, its source name or its kind, in the goal’s currency', () => {
 const events = [
  event('a', 200, '2026-08-02', { source_id: 'card' }), event('b', 50, '2026-08-03', { source_id: 'gone', source_name: '  Bonus  ' }),
  event('c', 30, '2026-08-04', { source_name: '   ' }), event('d', -80, '2026-08-05', { event_type: 'withdrawal' }),
  event('e', 100, '2026-09-02'), event('f', 999, '2026-08-01', { event_type: 'opening' }), event('x', 5, '2026-08-02', { goal_id: 'other' }),
 ];
 const flows = goalFlows('g', context([], { data: { records: [card], goals: [goal({ currency: 'EUR' })] }, goalEvents: events }));
 assert.deepEqual(shape(flows), [['Opening balance', 'Holiday', 400], ['Card', 'Holiday', 400], ['Bonus', 'Holiday', 100], ['contribution', 'Holiday', 60], ['Holiday', 'withdrawal', 160], ['Holiday', 'Saved', 800]],
  'EUR at 0.5 per dollar; a later addition is taken back from today’s balance, an opening event and another goal’s are left out');
 assert.deepEqual(flows.nodes.map(node => node.open?.side), ['link', 'account', 'link', 'link', 'link', 'link', 'link']);
});

test('a goal without its own currency counts in its account’s, else the display currency; an unknown goal draws nothing', () => {
 const eur = record('eur', 'Euro savings', 'Cash', 0, '2026-01-01', { currency: 'EUR' });
 const onAccount = goalFlows('g', context([eur], { data: { records: [card, eur], goals: [goal({ account_id: 'eur' })] } }));
 assert.deepEqual(shape(onAccount), [['Opening balance', 'Holiday', 1000], ['Holiday', 'Saved', 1000]], 'no history: it held the same all along');
 assert.deepEqual(shape(goalFlows('g', context([], { data: { records: [card], goals: [goal()] } }))), [['Opening balance', 'Holiday', 500], ['Holiday', 'Saved', 500]]);
 assert.deepEqual(goalFlows('g', context([])), { nodes: [], links: [], missing: 0 }, 'no goals at all');
 assert.equal(goalFlows('g', context([], { data: { records: [card], goals: [goal({ currency: 'GBP' })] } })).missing, 1);
});

test('a goal’s events in the period list newest first, each with its account’s name, its source name or nothing', () => {
 const events = [event('b', 10, '2026-08-03', { source_name: ' Gift ' }), event('a', 20, '2026-08-03', { source_id: 'card' }), event('c', 5, '2026-08-01'), event('d', 7, '2026-07-31')];
 const rows = goalEventsIn('g', context([], { data: { records: [card], goals: [goal()] }, goalEvents: events }));
 assert.deepEqual(rows.map(row => [row.event.id, row.source, row.currency]), [['a', 'Card', 'USD'], ['b', 'Gift', 'USD'], ['c', '', 'USD']]);
 assert.deepEqual(goalEventsIn('missing', context([])), [], 'an unknown goal without history lists nothing');
 assert.equal(rows[0].open.href, '/goals?view=history&goal=g');
});

test('a schedule’s Sankey counts a payment it cannot convert as missing, names an unnamed schedule by its kind, and an unknown one draws nothing', () => {
 const gym = record('gym', ' ', 'Living expense', 40, '2026-01-10', { frequency: 'Monthly' });
 const paid = (id, amount, currency, date) => record(id, 'Gym', 'Living expense', amount, date, { currency, account_id: 'card', occurrence_record_id: 'gym', occurrence_due_on: '2026-08-10' });
 const target = { side: 'schedule', key: 'gym', date: '2026-08-10', due: { amount: 40, currency: 'USD' }, direction: 'expense', open: true };
 const ctx = context([gym, paid('p1', 10, 'USD', '2026-08-10'), paid('p0', 5, 'USD', '2026-08-10'), paid('p2', 9, 'GBP', '2026-08-11')]);
 assert.deepEqual(schedulePayments(target, ctx).map(item => item.id), ['p2', 'p0', 'p1'], 'newest first, then by id');
 const flows = scheduleFlows(target, ctx);
 assert.deepEqual(shape(flows), [['Card', 'Living expense', 15], ['Remaining', 'Living expense', 25], ['Living expense', 'Living expense', 40]]);
 assert.equal(flows.missing, 1, 'the GBP payment has no rate');
 assert.deepEqual(scheduleFlows({ ...target, key: 'none' }, ctx), { nodes: [], links: [], missing: 0 });
});
