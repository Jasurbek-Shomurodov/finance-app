import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, hostModule, stubs } from './helpers/component-tree.mjs';

// The Recurring page's "Debt repayments and deposit maturities" table and calendar chips follow the month shown (CR 2026-10-23, items 22 and 28).
const r = createRenderer();
const ui = stubs();
const { monthReminders } = r.load('components/planning/upcoming-page.tsx', {
 ...ui.modules, 'lucide-react': hostModule(), '@/components/display-money': { useDisplayMoney: () => ({ entered: () => '' }) }, '@/hooks/use-columns-fit': { useColumnsFit: () => null },
 ...Object.fromEntries(['category-icon', 'today-button', 'page-header', 'count', 'segmented'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])),
 ...Object.fromEntries(['./account-operation', './recurring-list', './recurring-rows', './delete-schedule-dialog', './recurring-details', './add-recurring-menu', './recurring-flow-button'].map(name => [name, hostModule()])),
});
const record = (id, kind, amount, date, extra = {}) => ({ id, name: id, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const data = { records: [
 record('Old debt', 'Debt', 300, '2026-09-01'), record('Savings', 'Deposit', 1000, '2026-10-15'), record('Car loan', 'Loan', 500, '2026-11-20'),
 // A loan paid monthly is listed by `monthOccurrences` as the month's installment row; it is not a reminder too.
 record('Flat', 'Mortgage', 90000, '2027-06-01', { estimated_monthly_payment: 800 }), record('Rent', 'Rent expense', 1200, '2026-01-01', { frequency: 'Monthly' }),
], occurrences: [], debtPayments: [] };
const shown = (month, today = '2026-10-10') => monthReminders(data, month, today).map(item => [item.record.id, item.date, item.type, item.overdue]);

test('the reminders are the shown month’s repayments and maturities, with earlier ones still open, never a loan installment or a scheduled bill', () => {
 assert.deepEqual(shown('2026-10'), [['Old debt', '2026-09-01', 'repayment', true], ['Savings', '2026-10-15', 'maturity', false]]);
 assert.deepEqual(shown('2026-11'), [['Old debt', '2026-09-01', 'repayment', true], ['Car loan', '2026-11-20', 'repayment', false]], 'stepping to November shows November’s, not the next 31 days from today');
 assert.deepEqual(shown('2026-12'), [['Old debt', '2026-09-01', 'repayment', true]], 'a month with nothing of its own keeps only what is overdue');
 assert.deepEqual(shown('2027-06'), [['Old debt', '2026-09-01', 'repayment', true], ['Flat', '2027-06-01', 'repayment', false]], 'the mortgage’s own due date is a reminder once; its monthly installments never are');
 assert.deepEqual(shown('2026-08'), [['Old debt', '2026-09-01', 'repayment', true]], 'a past month still lists what is overdue');
 assert.ok(monthReminders(data, '2026-10', '2026-10-10').every(item => item.type !== 'installment' && item.type !== 'scheduled'));
});
