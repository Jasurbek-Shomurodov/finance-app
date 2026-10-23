import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byLabel, byType, createRenderer, stubs, text } from './helpers/component-tree.mjs';

const { formatSignedMoney, formatDate } = loadTS('lib/format.ts');
const r = createRenderer();
const ui = stubs();
const RowMenu = Object.assign(({ items }) => React.createElement('menu', null, items.map(item => React.createElement('li', { key: item.label }, item.label))), { displayName: 'RowMenu' });
const { RecurringList } = r.load('components/planning/recurring-list.tsx', { ...ui.modules, '@/components/presentation-foundation/row-menu': { RowMenu } });

const food = { id: 'cat-food', name: 'Groceries', direction: 'expense' };
const record = (id, kind, extra = {}) => ({ id, name: id, kind, currency: 'USD', amount: 100, frequency: 'Monthly', date: '2026-01-05', ...extra });
const item = (record, date, status, direction, amount) => ({ key: `${record.id}:${date}`, record, date, status, direction, amount });
const salary = record('salary', 'Salary', { amount: 3000 });
const rent = record('rent', 'Rent expense', { amount: 900 });
const groceries = record('groceries', 'Other expense', { amount: 400, custom_category_id: food.id });
const gym = record('gym', 'Living expense', { amount: 50 });
const items = [
 item(salary, '2026-10-01', 'paid', 'income', 3000),
 item(rent, '2026-10-01', 'paid', 'expense', 900),
 item(groceries, '2026-10-10', 'due', 'expense', 400),
 item(gym, '2026-10-20', 'skipped', 'expense', 50),
];
const carried = [item(rent, '2026-09-01', 'overdue', 'expense', 900)];
const row = (entry, dated, byCategory) => React.createElement('li', { key: entry.key, className: 'row', 'data-dated': dated, 'data-by-category': byCategory }, entry.record.name);
const usd = value => formatSignedMoney(value, 'USD', 'en-US');

/** Each heading as [label, count, total] and the rows under it. */
const outline = view => {
 const groups = [];
 // Headings are rendered by GroupHeading, which stays in the tree above its li; rows come from the test's own `row`.
 for (const node of view.all(byType('li'), view.find(byType('ul')))) {
  if (node.props?.className === 'transaction-day-heading') groups.push({ heading: view.find(byType('h3'), node).children.filter(child => typeof child === 'string').join(''), count: text(view.find(byType('span'), node)), total: node.children.length > 1 ? text(node.children[1]) : null, rows: [] });
  else if (node.props?.className === 'row') groups.at(-1).rows.push([text(node), node.props['data-dated'], node.props['data-by-category']]);
 }
 return groups;
};
const mount = props => (r.mount(React.createElement(RecurringList, { items, carried, categories: [food], listRef: () => {}, row, ...props })), r);
const groupBy = (view, label) => { view.fire(view.find(node => node.type === 'button' && text(node) === label), 'onClick'); return view; };

test('by date (the default): open payments from earlier months first, then each day with its count and signed total', () => {
 const view = mount();
 const groups = outline(view);
 assert.deepEqual(groups.map(group => [group.heading, group.count, group.total]), [
  ['Open from earlier months', '1', usd(-900)],
  [formatDate('2026-10-01', 'en-US'), '2', usd(2100)],
  [formatDate('2026-10-10', 'en-US'), '1', usd(-400)],
  [formatDate('2026-10-20', 'en-US'), '1', null],
 ], 'a skipped item is counted but adds nothing to the total');
 assert.deepEqual(groups.map(group => group.rows), [[['rent', true, false]], [['salary', false, false], ['rent', false, false]], [['groceries', false, false]], [['gym', false, false]]], 'a carried row shows its day; a row under a day heading does not');
 assert.equal(view.find(node => node.type === 'button' && text(node) === 'Date').props['aria-pressed'], true);
 assert.deepEqual(view.all(node => node.type === 'button').map(text), ['Date', 'Type', 'Category', 'Status']);
});

test('by type: income before expenses, every row dated', () => {
 const groups = outline(groupBy(mount(), 'Type'));
 assert.deepEqual(groups.map(group => [group.heading, group.count, group.total, group.rows.map(row => row[0])]), [
  ['Open from earlier months', '1', usd(-900), ['rent']],
  ['Income', '1', usd(3000), ['salary']],
  ['Expenses', '3', usd(-1300), ['rent', 'groceries', 'gym']],
 ]);
 assert.ok(groups.slice(1).every(group => group.rows.every(row => row[1] === true && row[2] === false)));
});

test('by category: a custom category by its name, others by their kind, in name order; rows drop the category and keep the day', () => {
 const groups = outline(groupBy(mount(), 'Category'));
 assert.deepEqual(groups.map(group => [group.heading, group.rows.map(row => row[0])]), [
  ['Open from earlier months', ['rent']], ['Groceries', ['groceries']], ['Living expense', ['gym']], ['Rent expense', ['rent']], ['Salary', ['salary']],
 ]);
 assert.ok(groups.slice(1).every(group => group.rows.every(row => row[1] === true && row[2] === true)));
});

test('by status: overdue, upcoming, paid, skipped; switching back to date restores the day headings', () => {
 const view = groupBy(mount(), 'Status');
 assert.deepEqual(outline(view).map(group => [group.heading, group.rows.map(row => row[0])]), [
  ['Open from earlier months', ['rent']], ['Upcoming', ['groceries']], ['Paid', ['salary', 'rent']], ['Skipped', ['gym']],
 ]);
 assert.equal(view.find(node => node.type === 'button' && text(node) === 'Status').props['aria-pressed'], true);
 assert.deepEqual(outline(groupBy(view, 'Date')).map(group => group.heading)[1], formatDate('2026-10-01', 'en-US'));
});

test('a total mixing currencies without a display rate reads as a dash; with nothing scheduled the list is an empty state', () => {
 const uzs = item(record('bus', 'Living expense', { currency: 'UZS', amount: 50000 }), '2026-10-01', 'due', 'expense', 50000);
 const view = mount({ items: [items[0], uzs], carried: [] });
 assert.deepEqual(outline(view).map(group => [group.count, group.total]), [['2', '—']]);
 const empty = mount({ items: [], carried: [] });
 assert.equal(empty.all(byType('ul')).length, 0);
 assert.match(text(empty.tree), /Nothing is scheduled this month/);
 assert.ok(empty.all(byLabel('Recurring')).length === 1);
});
