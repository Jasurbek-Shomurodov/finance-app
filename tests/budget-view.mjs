import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { isUnplanned, splitUnplanned, unplannedSuggestion, dueByCategory, rowState, leftShares, spendingPace } = loadTS('lib/budget-view.ts');

const row = (extra = {}) => ({ key: 'groceries', name: 'Groceries', custom: false, direction: 'expense', type: 'flexible', excluded: false, budget: 500, actual: 200, rolloverIn: 0, remaining: 300, progress: .4, missing: false, ...extra });
const record = (id, kind, amount, date, extra = {}) => ({ id, name: id, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });

test('unplanned spending is money out of a category with no budget, bill or fund behind it', () => {
 const supplies = row({ key: 'supplies', budget: 0, actual: 927, remaining: -927, progress: 1 });
 assert.equal(isUnplanned(supplies), true);
 assert.equal(isUnplanned(row()), false, 'a planned category');
 assert.equal(isUnplanned(row({ budget: 0, actual: 0, remaining: 0 })), false, 'nothing spent');
 assert.equal(isUnplanned({ ...supplies, rolloverIn: 40 }), false, 'a fund carried money in');
 assert.equal(isUnplanned({ ...supplies, rolloverIn: -40 }), false, 'an overspent fund is a plan exceeded');
 assert.equal(isUnplanned({ ...supplies, direction: 'income' }), false, 'income above plan is extra, not unplanned spending');
 assert.equal(isUnplanned({ ...supplies, excluded: true }), false);
 assert.equal(isUnplanned({ ...supplies, budget: null }), false, 'a flexible category in flex mode is planned by its bucket');
 assert.equal(isUnplanned({ ...supplies, budget: null, missing: true }), false, 'a plan no rate converts is unknown, not absent');
 const split = splitUnplanned([row(), supplies, row({ key: 'ads', budget: 0, actual: 309 }), row({ key: 'rent' })]);
 assert.deepEqual(split.planned.map(item => item.key), ['groceries', 'rent']);
 assert.deepEqual(split.unplanned.map(item => item.key), ['supplies', 'ads'], 'in the order they came');
 assert.equal(split.total, 1236);
});

test('Plan these suggests a whole amount, rounded up: what was spent or the monthly average, whichever is more', () => {
 assert.equal(unplannedSuggestion(926.4, 0), 927);
 assert.equal(unplannedSuggestion(120, 310.01), 311);
 assert.equal(unplannedSuggestion(309, 309), 309);
 assert.equal(unplannedSuggestion(13782.113487716848, 0), 13783, 'never a calculation tail');
 assert.equal(unplannedSuggestion(0, 0), 0);
});

test('a category is due on its first open scheduled date of the month', () => {
 const item = (kind, date, extra = {}) => ({ key: kind + date, record: record(kind + date, kind, 10, date, { frequency: 'Monthly', ...extra }), date, overdue: false, type: 'scheduled', amount: 10 });
 const due = dueByCategory([item('Living expense', '2026-11-20'), item('Living expense', '2026-11-05'), item('Other expense', '2026-11-09', { custom_category_id: 'gym' }), item('Salary', '2026-12-01'), { ...item('Loan', '2026-11-03'), type: 'installment' }], '2026-11');
 assert.deepEqual([...due], [['Living expense', '2026-11-05'], ['gym', '2026-11-09']], 'by budget category; other months and loan installments are not a category bill');
});

test('a row reads what was exceeded, what falls due, else how far its plan is used', () => {
 const today = '2026-11-14';
 assert.deepEqual(rowState(row(), undefined, today), { kind: 'progress', percent: 40 });
 assert.deepEqual(rowState(row({ actual: 0, remaining: 500, progress: 0 }), today, today), { kind: 'due_today' });
 assert.deepEqual(rowState(row({ actual: 0, remaining: 500, progress: 0 }), '2026-11-20', today), { kind: 'due', date: '2026-11-20' });
 assert.deepEqual(rowState(row({ actual: 0, remaining: 500, progress: 0 }), '2026-11-02', today), { kind: 'overdue' });
 assert.deepEqual(rowState(row(), '2026-11-02', today), { kind: 'progress', percent: 40 }, 'a part payment reads its progress');
 assert.deepEqual(rowState(row({ actual: 0, remaining: 500, progress: 0 }), undefined, today), { kind: 'progress', percent: 0 });
 assert.deepEqual(rowState(row({ actual: 540, remaining: -40, progress: 1.08 }), today, today), { kind: 'over', amount: 40 }, 'red only when a plan is exceeded');
 assert.deepEqual(rowState(row({ direction: 'income', budget: 1000, actual: 1200, remaining: -200, progress: 1.2 }), undefined, today), { kind: 'progress', percent: 120 }, 'income above plan is not overspending');
 assert.deepEqual(rowState(row({ direction: 'income', budget: 0, actual: 1443, remaining: -1443, progress: 1 }), undefined, today), { kind: 'not_planned' });
 assert.deepEqual(rowState(row({ budget: 0, actual: 0, remaining: 0, progress: 0 }), undefined, today), { kind: 'none' });
 assert.deepEqual(rowState(row({ budget: 0, rolloverIn: -40, actual: 10, remaining: -50, progress: 1 }), undefined, today), { kind: 'over', amount: 50 }, 'an overspent fund');
 assert.deepEqual(rowState(row({ budget: 0, rolloverIn: 100, actual: 25, remaining: 75, progress: .25 }), undefined, today), { kind: 'progress', percent: 25 }, 'a fund with only carried money');
 assert.deepEqual(rowState(row({ budget: null, remaining: null, missing: true }), today, today), { kind: 'none' }, 'an unknown plan has no state');
});

test('planned income splits into spending, goals and what is left; an unknown figure draws no bar', () => {
 assert.deepEqual(leftShares({ income: 20000, expenses: 6000, contributions: 8000, left: 6000 }), { spending: 30, goals: 40, left: 30 });
 assert.deepEqual(leftShares({ income: 1000, expenses: 900, contributions: 300, left: -200 }), { spending: 75, goals: 25, left: 0 }, 'planned past income: nothing is left');
 assert.equal(leftShares({ income: null, expenses: 100, contributions: 0, left: null }), null);
 assert.equal(leftShares({ income: 100, expenses: 100, contributions: null, left: null }), null);
 assert.equal(leftShares({ income: 0, expenses: 0, contributions: 0, left: 0 }), null, 'nothing planned');
});

test('spending pace: the month so far day by day beside the plan spread evenly, without excluded categories', () => {
 const records = [record('a', 'Living expense', 100, '2026-11-02'), record('b', 'Other expense', 50, '2026-11-02', { custom_category_id: 'gym' }), record('c', 'Living expense', 30, '2026-11-10'), record('pay', 'Salary', 5000, '2026-11-05'),
  record('late', 'Living expense', 999, '2026-11-20'), record('old', 'Living expense', 999, '2026-10-31'), record('bill', 'Living expense', 400, '2026-11-01', { frequency: 'Monthly' }), record('som', 'Living expense', 125000, '2026-11-03', { currency: 'UZS' }), record('odd', 'Living expense', 7, '2026-11-04', { currency: 'XYZ' })];
 const read = { currency: 'USD', today: '2026-11-14', rates: { USD: 1, UZS: 12500 } };
 const pace = spendingPace({ records }, [], '2026-11', 600, read);
 assert.equal(pace.points.length, 30);assert.equal(pace.days, 30);assert.equal(pace.day, 14);
 assert.deepEqual(pace.points[0], { date: '2026-11-01', spent: 0, pace: 20 });
 assert.equal(pace.points[1].spent, 150);
 assert.equal(pace.points[2].spent, 160, 'another currency counts at its rate');
 assert.equal(pace.points[3].spent, 160, 'an amount no rate converts is left out, never added as it stands');
 assert.equal(pace.points[13].spent, 190);assert.equal(pace.points[13].pace, 280);
 assert.equal(pace.points[14].spent, null, 'days not reached carry no spending');
 assert.equal(pace.points[29].pace, 600, 'the even pace ends on the plan');
 assert.equal(pace.spent, 190, 'income, schedules, other months and later days are not spending so far');
 assert.equal(pace.status, 'on_pace');
 assert.equal(spendingPace({ records }, [], '2026-11', 300, read).status, 'above_pace', '190 spent against 140 by day 14');
 assert.equal(spendingPace({ records }, [], '2026-11', 150, read).status, 'over_plan');
 assert.equal(spendingPace({ records }, [], '2026-11', 0, read).status, null, 'no plan, no pace');
 const unknown = spendingPace({ records }, [], '2026-11', null, read);
 assert.equal(unknown.status, null);assert.equal(unknown.points[0].pace, null);
 assert.equal(spendingPace({ records }, [], '2026-11', 600, { ...read, excluded: new Set(['gym']) }).spent, 140, 'an excluded category is left out, as in the budget totals');
 // A past month is whole and has no status; a split counts in its parts.
 const past = spendingPace({ records }, [{ record_id: 'old', category_id: 'gym', amount: 99 }, { record_id: 'old', category_id: 'Living expense', amount: 900 }], '2026-10', 600, { ...read, excluded: new Set(['gym']) });
 assert.equal(past.day, 31);assert.equal(past.status, null);assert.equal(past.points[30].spent, 900);
 assert.equal(spendingPace({ records }, [], '2026-12', 600, read).day, 0);
});
