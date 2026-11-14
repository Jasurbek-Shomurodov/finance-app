import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

const { debtPayoff, payoffPriority } = loadTS('lib/debt-payoff.ts');
const { debtProgress, payoffPlan, payoffSeries, payoffDay, planFor, plannedDebts, emptyDebtPlan } = loadTS('lib/debt-plan.ts');
const debt = (id, amount, rate, payment, extra = {}) => ({ id, name: id, kind: 'Loan', currency: 'USD', amount, rate, estimated_monthly_payment: payment, quantity: 1, cost: 0, date: '2030-01-01', frequency: 'Once', notes: '', ...extra });
const event = (record_id, occurred_on, event_type, amount, balance) => ({ id: record_id + occurred_on + event_type, record_id, occurred_on, created_at: occurred_on + 'T00:00:00Z', event_type, amount, balance, ownership_percentage: 100, principal: 0, interest: 0, notes: '' });

test('the payoff keeps what is owed month by month, from today to nothing', () => {
 const result = debtPayoff([{ id: 'a', balance: 100, annualRate: 0, minimum: 50 }, { id: 'b', balance: 500, annualRate: 0, minimum: 50 }], 0, 'snowball');
 assert.deepEqual(result.balances, [600, 500, 400, 300, 200, 100, 0]);
 assert.equal(result.balances.length, result.months + 1);
 const never = debtPayoff([{ id: 'a', balance: 1000, annualRate: 24, minimum: 10 }], 0, 'avalanche', 12);
 assert.equal(never.balances.length, 13);
 assert.ok(never.balances.at(-1) > 1000);
 assert.deepEqual(debtPayoff([], 0, 'avalanche').balances, [0]);
});

test('the extra payment goes to the highest rate or the smallest balance first', () => {
 const debts = [{ id: 'card', balance: 2300, annualRate: 21.9, minimum: 70 }, { id: 'car', balance: 500, annualRate: 5, minimum: 50 }, { id: 'paid', balance: 0, annualRate: 30, minimum: 0 }];
 assert.deepEqual(payoffPriority(debts, 'avalanche').map(row => row.id), ['card', 'car']);
 assert.deepEqual(payoffPriority(debts, 'snowball').map(row => row.id), ['car', 'card']);
});

test('a plan covers what is owed in its own currency, with saved minimums over the records\' own', () => {
 const records = [debt('card', 1200, 24, 100), debt('car', 600, 5, 100), debt('som', 9e6, 20, 1e6, { currency: 'UZS' }), debt('done', 0, 9, 50), { ...debt('lent', 500, 0, 0), kind: 'Money lent' }];
 assert.deepEqual(plannedDebts(records, 'USD').map(record => record.id), ['card', 'car']);
 const plain = payoffPlan(records, emptyDebtPlan('USD'));
 assert.equal(plain.result.budget, 200);
 assert.equal(plain.first, 'card');
 assert.equal(plain.result.months, plain.minimums.months, 'no extra: the plan is the minimums');
 const faster = payoffPlan(records, { currency: 'USD', extra: 200, method: 'snowball', payments: { card: 150 } });
 assert.equal(faster.result.budget, 450);
 assert.equal(faster.first, 'car');
 assert.ok(faster.result.months < faster.minimums.months && faster.result.interest < faster.minimums.interest);
 assert.equal(faster.alternative.budget, 450);
 // A plan saved for another display currency never applies.
 assert.deepEqual(planFor({ currency: 'EUR', extra: 9, method: 'snowball', payments: {} }, 'USD'), emptyDebtPlan('USD'));
 assert.equal(planFor({ currency: 'USD', extra: 9, method: 'snowball', payments: {} }, 'USD').extra, 9);
});

test('the debt-free day is the last day of its month, and never is null', () => {
 assert.equal(payoffDay('2026-11-14', 0), '2026-11-30');
 assert.equal(payoffDay('2026-11-14', 3), '2027-02-28');
 assert.equal(payoffDay('2026-11-14', null), null);
 assert.equal(payoffDay('2026-11-14', undefined), null);
});

test('the balance chart runs to the slower payoff, reads zero once the plan is done, and thins long plans', () => {
 const debts = [{ id: 'a', balance: 1000, annualRate: 0, minimum: 100 }];
 const plan = debtPayoff(debts, 100, 'avalanche'), minimums = debtPayoff(debts, 0, 'avalanche');
 const points = payoffSeries('2026-11-14', plan, minimums);
 assert.equal(points.length, 11);
 assert.deepEqual(points[0], { month: '2026-11', plan: 1000, minimums: 1000 });
 assert.deepEqual(points[5], { month: '2027-04', plan: 0, minimums: 500 });
 assert.deepEqual(points.at(-1), { month: '2027-09', plan: 0, minimums: 0 });
 // Without a comparison the chart ends with the plan.
 assert.equal(payoffSeries('2026-11-14', plan, null).length, 6);
 assert.ok(payoffSeries('2026-11-14', plan, null).every(point => point.minimums === null));
 // Minimums that never clear the debt: the line stops being drawn at twice the plan, not at fifty years.
 const growing = [{ id: 'a', balance: 1000, annualRate: 24, minimum: 10 }];
 const cut = payoffSeries('2026-11-14', debtPayoff(growing, 200, 'avalanche'), debtPayoff(growing, 0, 'avalanche'));
 assert.equal(cut.length, debtPayoff(growing, 200, 'avalanche').months * 2 + 1);
 // Thirty years of months become at most ~120 points, the last month kept.
 const long = debtPayoff([{ id: 'a', balance: 361000, annualRate: 0, minimum: 1000 }], 0, 'avalanche');
 const thinned = payoffSeries('2026-11-14', long, null);
 assert.ok(thinned.length <= 122, String(thinned.length));
 assert.equal(thinned.at(-1).plan, 0);
});

test('paid off is measured from the first recorded balance plus later borrowing, and is absent without history', () => {
 const loan = { id: 'loan', amount: 18500 };
 assert.equal(debtProgress(loan, []), null);
 assert.equal(debtProgress(loan, [event('other', '2025-01-01', 'valuation', 0, 24300)]), null);
 const paid = debtProgress(loan, [event('loan', '2025-06-01', 'withdrawal', 500, null), event('loan', '2025-01-01', 'baseline', 0, 24300)]);
 assert.deepEqual({ paid: paid.paid, total: paid.total }, { paid: 5800, total: 24300 });
 assert.ok(Math.abs(paid.share - 5800 / 24300 * 100) < 1e-9);
 // Borrowing more raises what there is to pay off.
 assert.equal(debtProgress(loan, [event('loan', '2025-01-01', 'baseline', 0, 20000), event('loan', '2025-03-01', 'contribution', 5000, 25000)]).total, 25000);
 // Money lent from an account is saved at zero and funded by a contribution; a purchase counts once.
 assert.deepEqual(debtProgress({ id: 'lent', amount: 2000 }, [event('lent', '2026-01-01', 'baseline', 0, 0), event('lent', '2026-01-01', 'contribution', 3000, 3000)]).paid, 1000);
 assert.equal(debtProgress({ id: 'x', amount: 100 }, [event('x', '2026-01-01', 'contribution', 400, 400)]).total, 400);
 // A balance above where it started is nothing paid, never a negative bar; a zero start has no bar at all.
 assert.equal(debtProgress({ id: 'loan', amount: 30000 }, [event('loan', '2025-01-01', 'baseline', 0, 24300)]).share, 0);
 assert.equal(debtProgress({ id: 'loan', amount: 0 }, [event('loan', '2025-01-01', 'baseline', 0, 24300)]).share, 100);
 assert.equal(debtProgress(loan, [event('loan', '2025-01-01', 'baseline', 0, 0)]), null);
});
