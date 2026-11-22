import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

const { safeToSpend, obligationsDue, whereItGoes, improvements } = loadTS('lib/dashboard-glance.ts');
const { convertAmount } = loadTS('lib/market.ts');
const { upcomingPayments } = loadTS('lib/planning.ts');

const month = '2026-11', today = '2026-11-10';
const usd = (amount, currency) => currency === 'USD' ? amount : null;
const record = (id, kind, amount, extra = {}) => ({ id, name: id, kind, amount, currency: 'USD', frequency: 'Monthly', date: '2026-11-20', notes: '', quantity: 1, cost: 0, rate: 0, ...extra });
const due = (id, kind, amount, { record: fields, ...extra } = {}) => ({ key: id + ':2026-11-20', record: record(id, kind, amount, fields), date: '2026-11-20', overdue: false, type: 'scheduled', amount, ...extra });
const noIncome = { received: null, expected: null, spent: null };
const budget = (extra = {}) => ({ plan: 2000, spent: 800, covered: new Set(['Rent expense', 'Living expense']), unknown: false, ...extra });

test('a bill of a budgeted category is inside the plan and is never taken off a second time', () => {
 // Rent (900) is still due, and Rent expense has a plan: the 2,000 plan already holds it.
 const rent = due('rent', 'Rent expense', 900);
 const safe = safeToSpend({ month, budget: budget(), due: [rent], income: noIncome, convert: usd });
 assert.deepEqual(safe, { basis: 'budget', limit: 2000, spent: 800, due: 0, amount: 1200 }, '2,000 planned − 800 spent, and nothing more for the rent');
 // The same bill in a custom category counts by that category, not by its kind.
 const gym = due('gym', 'Other expense', 60, { record: { custom_category_id: 'gym' } });
 assert.equal(safeToSpend({ month, budget: budget({ covered: new Set(['gym']) }), due: [gym], income: noIncome, convert: usd }).amount, 1200);
 assert.equal(safeToSpend({ month, budget: budget({ covered: new Set(['Other expense']) }), due: [gym], income: noIncome, convert: usd }).amount, 1140, 'its kind having a plan does not cover a bill filed under its own category');
});

test('what no budget category covers comes off: loan and mortgage installments, and bills of categories without a plan', () => {
 const items = [
  due('rent', 'Rent expense', 900),
  due('car', 'Loan', 300, { type: 'installment', key: 'car:installment:2026-11-20' }),
  due('home', 'Mortgage', 700, { type: 'installment', key: 'home:installment:2026-11-20' }),
  due('club', 'Charity', 40),
  // Money on its way in is never due, and next month's payment is not this month's.
  due('pay', 'Salary', 5000),
  due('lent', 'Money lent', 250, { type: 'repayment' }),
  due('later', 'Loan', 300, { type: 'installment', date: '2026-12-20', key: 'car:installment:2026-12-20' }),
 ];
 assert.equal(obligationsDue(items, month, budget().covered, usd), 1040, '300 + 700 + 40');
 const safe = safeToSpend({ month, budget: budget(), due: items, income: noIncome, convert: usd });
 assert.equal(safe.amount, 160, '2,000 − 800 − 1,040');assert.equal(safe.due, 1040);
 // A payment whose date has passed is still owed this month.
 const late = due('old', 'Debt', 100, { type: 'repayment', date: '2026-10-28', overdue: true });
 assert.equal(obligationsDue([late], month, new Set(), usd), 100);
});

test('over the plan is a negative figure, which the tile shows as Over by', () => {
 const safe = safeToSpend({ month, budget: budget({ spent: 2300 }), due: [due('car', 'Loan', 300, { type: 'installment' })], income: noIncome, convert: usd });
 assert.equal(safe.amount, -600, '2,000 − 2,300 − 300');
 assert.equal(safeToSpend({ month, budget: budget({ spent: 2000 }), due: [], income: noIncome, convert: usd }).amount, 0, 'spent to the plan exactly');
});

test('with no budget set it is the expected income minus what was spent and everything still due', () => {
 const items = [due('rent', 'Rent expense', 900), due('car', 'Loan', 300, { type: 'installment' }), due('pay', 'Salary', 5000)];
 const safe = safeToSpend({ month, budget: budget({ plan: 0, spent: 0, covered: new Set() }), due: items, income: { received: 3000, expected: 2000, spent: 1400 }, convert: usd });
 assert.deepEqual(safe, { basis: 'income', limit: 5000, spent: 1400, due: 1200, amount: 2400 }, '3,000 received + 2,000 expected − 1,400 spent − 900 rent − 300 loan');
 // Nothing covers a bill here, even if a covered set were passed along: there is no plan for it to be inside.
 assert.equal(safeToSpend({ month, budget: budget({ plan: 0, covered: new Set(['Rent expense']) }), due: items, income: { received: 3000, expected: 2000, spent: 1400 }, convert: usd }).amount, 2400);
 assert.equal(safeToSpend({ month, budget: budget({ plan: 0 }), due: [], income: { received: 1000, expected: 0, spent: 1500 }, convert: usd }).amount, -500, 'spent more than the month brings');
});

test('an amount no rate converts leaves the figure unknown, never a partial total', () => {
 const euro = due('fee', 'Loan', 300, { type: 'installment', record: { currency: 'EUR' } });
 const missing = safeToSpend({ month, budget: budget(), due: [euro], income: noIncome, convert: usd });
 assert.equal(missing.amount, null);assert.equal(missing.due, null);
 assert.equal(safeToSpend({ month, budget: budget({ plan: null }), due: [], income: noIncome, convert: usd }).amount, null, 'a plan without a rate');
 assert.equal(safeToSpend({ month, budget: budget({ unknown: true }), due: [], income: noIncome, convert: usd }).amount, null, 'spending with an amount left out');
 const income = { received: 3000, expected: 2000, spent: 1400 }, none = budget({ plan: 0, covered: new Set() });
 for (const key of ['received', 'expected', 'spent']) assert.equal(safeToSpend({ month, budget: none, due: [], income: { ...income, [key]: null }, convert: usd }).amount, null, key);
 assert.equal(safeToSpend({ month, budget: none, due: [euro], income, convert: usd }).amount, null);
 // A euro bill of a covered category is inside the plan, so its missing rate does not matter here.
 assert.equal(safeToSpend({ month, budget: budget(), due: [due('rent', 'Rent expense', 900, { record: { currency: 'EUR' } })], income: noIncome, convert: usd }).amount, 1200);
});

test('amounts in other currencies are converted to the display currency before they are added', () => {
 const rates = { USD: 1, UZS: 12500, EUR: 0.5 };
 const convert = (amount, from) => convertAmount(amount, from, 'USD', rates);
 const items = [due('car', 'Loan', 2500000, { type: 'installment', record: { currency: 'UZS' } }), due('fee', 'Debt', 50, { type: 'repayment', record: { currency: 'EUR' } })];
 assert.equal(obligationsDue(items, month, new Set(), convert), 300, '2,500,000 UZS is 200 USD and 50 EUR is 100 USD');
 assert.equal(safeToSpend({ month, budget: budget(), due: items, income: noIncome, convert }).amount, 900);
 // In sums the display currency decides: the same plan read in UZS takes the dollars off in UZS.
 const inSom = (amount, from) => convertAmount(amount, from, 'UZS', rates);
 assert.equal(safeToSpend({ month, budget: budget({ plan: 25000000, spent: 10000000 }), due: items, income: noIncome, convert: inSom }).amount, 25000000 - 10000000 - 2500000 - 1250000);
});

test('the real schedule reads feed it: an open bill, an unpaid installment and a salary, through upcomingPayments', () => {
 const records = [
  record('rent', 'Rent expense', 900),
  record('car', 'Loan', 12000, { frequency: 'Once', date: '2026-01-15', estimated_monthly_payment: 300, term_months: 48 }),
  record('pay', 'Salary', 5000, { date: '2026-11-25' }),
 ];
 const items = upcomingPayments(records, [], today, '2026-11-30', []);
 const safe = safeToSpend({ month, budget: budget(), due: items, income: noIncome, convert: usd });
 assert.equal(safe.basis, 'budget');
 assert.equal(safe.due, items.filter(item => item.record.id === 'car' && item.date <= '2026-11-30').reduce((sum, item) => sum + item.amount, 0), 'only the loan is outside the plan');
 assert.equal(safe.amount, 1200 - safe.due);
});

test('where it is going ranks categories, gives each its share and its change, and flags the biggest increase', () => {
 const current = [{ id: 'Living expense', amount: 600 }, { id: 'Rent expense', amount: 900 }, { id: 'gym', amount: 60 }, { id: 'Charity', amount: 0 }, { id: 'pets', amount: 240 }, { id: 'fun', amount: 150 }, { id: 'books', amount: 50 }];
 const previous = [{ id: 'Living expense', amount: 380 }, { id: 'Rent expense', amount: 900 }, { id: 'gym', amount: 80 }, { id: 'travel', amount: 500 }];
 const where = whereItGoes(current, previous);
 assert.equal(where.total, 2000);
 assert.deepEqual(where.rows.map(row => row.key), ['Rent expense', 'Living expense', 'pets', 'fun', 'gym', '\u0000other'], 'largest first, the rest as one Other row');
 assert.deepEqual(where.rows.map(row => row.share), [0.45, 0.3, 0.12, 0.075, 0.03, 0.025]);
 assert.equal(where.rows.reduce((sum, row) => sum + row.amount, 0), 2000, 'the rows add up to the total');
 assert.deepEqual(where.rows.map(row => row.change), [0, 220, 240, 150, -20, 50]);
 assert.deepEqual(where.rows.filter(row => row.mover).map(row => row.key), ['pets'], 'one mover: the biggest increase');
 assert.equal(where.mover.key, 'pets');assert.equal(where.mover.change, 240);
 assert.equal(where.rows[1].previous, 380);
 // Nothing grew: no mover. Nothing spent: no rows.
 assert.equal(whereItGoes([{ id: 'a', amount: 10 }], [{ id: 'a', amount: 10.2 }]).mover, null);
 assert.deepEqual(whereItGoes([], previous), { total: 0, rows: [], mover: null });
 // The biggest increase may sit outside the rows shown; it is still named.
 const tail = whereItGoes([{ id: 'a', amount: 500 }, { id: 'b', amount: 100 }], [{ id: 'a', amount: 500 }], 1);
 assert.equal(tail.mover.key, 'b');assert.deepEqual(tail.rows.map(row => [row.key, row.change, row.mover]), [['a', 0, false], ['\u0000other', 100, false]]);
});

test('what to improve: the most pressing three, each naming its item, and nothing when all is well', () => {
 const overdue = [{ record: { id: 'rent', name: 'Rent' }, date: '2026-11-01' }, { record: { id: 'gym', name: 'Gym' }, date: '2026-11-05' }];
 const over = [{ key: 'fun', amount: 20 }, { key: 'pets', amount: 120 }, { key: 'tiny', amount: 0.2 }];
 const all = improvements({ overdue, belowZero: '2026-12-03', over, mover: { key: 'Living expense', change: 220 } });
 assert.deepEqual(all, [
  { kind: 'overdue', recordId: 'rent', name: 'Rent', date: '2026-11-01', count: 2 },
  { kind: 'below_zero', date: '2026-12-03' },
  { kind: 'over_budget', key: 'pets', amount: 120 },
 ], 'three lines at most: late payments, cash below zero, then the category furthest over');
 assert.deepEqual(improvements({ overdue: [], belowZero: null, over, mover: { key: 'Living expense', change: 220 } }).map(line => [line.kind, line.key]), [['over_budget', 'pets'], ['over_budget', 'fun'], ['mover', 'Living expense']]);
 assert.deepEqual(improvements({ overdue: [], belowZero: null, over: [{ key: 'pets', amount: 120 }], mover: { key: 'pets', change: 240 } }), [{ kind: 'over_budget', key: 'pets', amount: 120 }], 'a category over budget is not listed again as the mover');
 assert.deepEqual(improvements({ overdue: [], belowZero: null, over: [], mover: null }), [], 'nothing to say');
});
