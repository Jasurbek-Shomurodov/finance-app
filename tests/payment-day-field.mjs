import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

// A mortgage saved without a start date pays on the day it was added (17 September); its day can be chosen.
const field = () => loadTS('components/record-dialog/payment-day-field.tsx', {
 '@/components/presentation-foundation/month-day-field': { MonthDayField: props => props },
 '@/lib/deposit-interest': { depositToday: () => '2026-10-13' },
});
const mortgage = { id: 'm', name: 'Mortgage', kind: 'Mortgage', currency: 'USD', amount: 86061, quantity: 1, cost: 0, rate: 14, date: '2032-05-05', frequency: 'Once', notes: '', estimated_monthly_payment: 1600, opened_on: null, created_at: '2026-09-17T08:00:00Z' };

test('a loan without a start date shows the day it pays on and moves its start date to the chosen day', () => {
 const { PaymentDayField } = field();
 const moved = [];
 const props = PaymentDayField({ record: mortgage, onChange: date => moved.push(date) }).props;
 assert.equal(props.date, '2026-09-17', 'the day the record was added');
 props.onChange('2026-09-05');
 assert.deepEqual(moved, ['2026-09-05']);
 // A start date it already has decides; a day still ahead this month falls in the month before.
 const current = PaymentDayField({ record: { ...mortgage, opened_on: '2026-10-01' }, onChange: date => moved.push(date) }).props;
 assert.equal(current.date, '2026-10-01');
 current.onChange('2026-10-20');
 assert.equal(moved.at(-1), '2026-09-20');
 assert.equal(PaymentDayField({ record: { ...mortgage, estimated_monthly_payment: 0 }, onChange() {} }), null, 'no monthly payment, no day');
});
