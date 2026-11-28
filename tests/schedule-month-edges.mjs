import test from 'node:test';
import assert from 'node:assert/strict';
import { monthly, scheduleDates } from '../lib/finance.ts';
import { loadTS } from './helpers/load-ts.mjs';

const bill = (extra = {}) => ({ id: 'b', name: 'Rent', kind: 'Rent expense', currency: 'USD', amount: 900, quantity: 1, cost: 0, rate: 0, notes: '', date: '2026-01-25', frequency: 'Monthly', ...extra });

test('a monthly bill that ends before its day in a month pays nothing that month, as Recurring shows it', () => {
 const ended = bill({ end_date: '2026-11-10' });
 assert.equal(scheduleDates(ended, '2026-11-01', '2026-11-30').length, 0);
 assert.equal(monthly(ended, '2026-11'), 0);
 assert.equal(monthly(ended, '2026-10'), 900);
 assert.equal(monthly(ended, '2026-12'), 0);
 const last = bill({ end_date: '2026-11-25' });
 assert.equal(monthly(last, '2026-11'), 900, 'ending on its payment day still pays that day');
 assert.equal(monthly(bill(), '2026-11'), 900);
 assert.equal(monthly(bill({ end_date: '2026-11-10' })), 900, 'an average month is unchanged');
});

test('a monthly bill on the 31st pays on the last day of a shorter month', () => {
 const late = bill({ date: '2026-01-31', end_date: '2026-02-28' });
 assert.deepEqual(scheduleDates(late, '2026-02-01', '2026-02-28'), ['2026-02-28']);
 assert.equal(monthly(late, '2026-02'), 900);
});

test('auto-filled whole amounts round up without overshooting on a floating-point tail', () => {
 const { wholeUp } = loadTS('lib/decimal-amounts.ts');
 assert.equal(10.3 - 7.3 > 3, true, 'the tail this guards against');
 assert.equal(wholeUp(10.3 - 7.3), 3);
 assert.equal(wholeUp(3.2), 4);
 assert.equal(wholeUp(2.9999), 3);
 assert.equal(wholeUp(0), 0);
 const { goalSummary, reachedIn } = loadTS('lib/goal-projection.ts');
 // 3.000000000000001 left over one month needs 3, not 4.
 assert.equal(goalSummary({ target: 10.3, target_date: '2026-12-31' }, 7.3, '2026-11-28').needed, 3);
 assert.equal(reachedIn(10.3 - 7.3, 3, '2026-11-28'), '2026-12', 'one month, not two');
});
