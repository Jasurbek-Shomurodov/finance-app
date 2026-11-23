import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, event, host, stubs, text } from './helpers/component-tree.mjs';

// The one Record payment dialog. Each kind of obligation must send exactly what the form it replaced sent: the
// strings below were printed by the old forms (MortgagePaymentDialog, and AccountOperation's repayment, mortgage and
// occurrence actions) for the same entries, before they were deleted, with the id and the dates made stable.
const sentBefore = {
 mortgage: '{"id":"ID","mortgage_id":"m1","principal":1200,"interest":300,"date":"TODAY","notes":"October","account_id":"c1"}',
 mortgageFx: '{"id":"ID","mortgage_id":"m1","principal":1000,"interest":200,"date":"TODAY","notes":"","account_id":"c2","exchange_rate":2}',
 recurringMortgage: 'mortgage {"id":"ID","account_id":"c1","target_id":"m1","date":"TODAY","amount":1200,"fee":300,"notes":"October","received":0}',
 repayment: 'repayment {"id":"ID","account_id":"c1","target_id":"l1","date":"TODAY","amount":450,"fee":20,"notes":"Part","received":0}',
 repaymentCarried: 'repayment {"id":"ID","account_id":"c1","target_id":"l1","date":"DUE","amount":450,"fee":0,"notes":"","received":0}',
 repaymentFx: 'repayment {"id":"ID","account_id":"c2","target_id":"l1","date":"TODAY","amount":450,"fee":0,"notes":"","exchange_rate":2,"received":0}',
 lent: 'repayment {"id":"ID","account_id":"c1","target_id":"lent","date":"TODAY","amount":300,"fee":15,"notes":"","received":0}',
 occurrence: 'occurrence {"id":"ID","account_id":"c1","target_id":"epam","date":"DUE","paid_on":"DUE","amount":3450,"fee":0,"notes":"","received":0}',
 occurrencePart: 'occurrence {"id":"ID","account_id":"c1","target_id":"epam","date":"DUE","paid_on":"DUE","amount":1000,"fee":0,"notes":"First half","received":0}',
 occurrenceZero: 'occurrence {"id":"ID","account_id":"c1","target_id":"epam","date":"DUE","paid_on":"DUE","amount":0,"fee":0,"notes":"","received":0}',
 occurrenceFx: 'occurrence {"id":"ID","account_id":"sum","target_id":"epam","date":"DUE","paid_on":"DUE","amount":3450,"fee":0,"notes":"","exchange_rate":0.0001,"received":0}',
 occurrenceInAccountCurrency: 'occurrence {"id":"ID","account_id":"sum","target_id":"epam","date":"DUE","paid_on":"DUE","amount":30155000,"fee":0,"notes":"","currency":"UZS","received":0}',
 occurrenceOtherCurrency: 'occurrence {"id":"ID","account_id":"c1","target_id":"epam","date":"DUE","paid_on":"DUE","amount":13320000,"fee":0,"notes":"","currency":"UZS","exchange_rate":10000,"received":0}',
 occurrenceEarly: 'occurrence {"id":"ID","account_id":"c1","target_id":"epam","date":"AHEAD","paid_on":"TODAY","amount":3450,"fee":0,"notes":"","received":0}',
 // The Tracker's repayment form, as Loans, the records table and the expense form opened it.
 tracked: '/api/investment-history {"id":"ID","record_id":"l1","type":"withdrawal","date":"TODAY","amount":450,"balance":null,"notes":"Part","account_id":"c1"}',
 trackedFx: '/api/investment-history/exchange {"id":"ID","record_id":"l1","type":"withdrawal","date":"TODAY","amount":450,"balance":null,"notes":"","account_id":"c2","exchange_rate":2}',
 trackedLent: '/api/investment-history {"id":"ID","record_id":"lent","type":"withdrawal","date":"TODAY","amount":300,"balance":null,"notes":"","account_id":"c1"}',
 occurrenceExtra: 'occurrence {"id":"ID","account_id":"c1","target_id":"epam","date":"DUE","paid_on":"DUE","amount":450,"fee":0,"notes":"","extra":true,"received":0}',
};

const { depositToday } = loadTS('lib/deposit-interest.ts');
const { shiftDay } = loadTS('lib/calendar-days.ts');
const { formatDate, formatMoney } = loadTS('lib/format.ts');
const { paymentFields } = loadTS('lib/mortgage-payment-edit.ts');
const today = depositToday(), due = shiftDay(today, -3), ahead = shiftDay(today, 4);
const stable = value => JSON.stringify({ ...value, id: 'ID' }).replaceAll(today, 'TODAY').replaceAll(due, 'DUE').replaceAll(ahead, 'AHEAD');
const money = (amount, currency = 'USD') => formatMoney(amount, currency, 'en-US');

const fx = { rates: { EURUSD: 2, UZSUSD: 0.0001, USDUZS: 10000 }, loading: false, retries: 0 };
const guard = { closes: [] };
const focused = [];
const r = createRenderer({ attach: () => ({ querySelector: selector => ({ focus() { focused.push(selector); } }) }) });
const ui = stubs();
const named = (name, render) => Object.assign(render, { displayName: name });
const CurrencySelect = named('CurrencySelect', ({ value }) => React.createElement('i', { 'data-currency': value }));
const CategoryChoiceButton = named('CategoryChoiceButton', ({ value }) => React.createElement('i', { 'data-category': value.category_id ?? value.kind }));
const modules = {
 ...ui.modules,
 '@/hooks/use-dated-exchange-rate': { useDatedExchangeRate: (from, to) => ({ rate: !from || !to ? null : from === to ? 1 : fx.loading ? null : fx.rates[from + to] ?? null, loading: fx.loading, retry() { fx.retries++; } }) },
 '@/components/discard-changes': { useDiscardChanges: (dirty, onClose, busy) => ({ close: () => { guard.closes.push({ dirty, busy }); if (!busy) onClose(); }, confirmation: null }) },
 '@/components/planning/recurring-rows': { useDueLabel: () => (from, day) => day === from ? 'Today' : 'another day' },
 '@/components/transactions/pickers': { CategoryChoiceButton },
 '@/components/presentation-foundation/category-icon': { CategoryIcon: () => null },
 '@/components/presentation-foundation/currency-select': { CurrencySelect },
 '@/components/ui/textarea': { Textarea: host('textarea') },
};
const { PaymentForm } = r.load('components/payments/payment-form.tsx', modules);
const { PaymentDialog } = r.load('components/payments/payment-dialog.tsx', modules);
const plans = loadTS('lib/payment-plan.ts');

const records = [
 { id: 'c1', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 5000, date: '2026-01-01' },
 { id: 'c2', name: 'Euro account', kind: 'Cash', currency: 'EUR', amount: 1000, date: '2026-01-01' },
 { id: 'sum', name: 'Cash', kind: 'Cash', currency: 'UZS', amount: 50000000, date: '2026-01-01' },
 { id: 'm1', name: 'Home loan', kind: 'Mortgage', currency: 'USD', amount: 100000, opened_on: '2026-01-15', date: '2030-01-01' },
 { id: 'l1', name: 'Car loan', kind: 'Loan', currency: 'USD', amount: 3000, date: '2030-01-01' },
 { id: 'lent', name: 'Lent to Ali', kind: 'Money lent', currency: 'USD', amount: 800, date: '2030-01-01' },
 { id: 'epam', name: 'EPAM Systems', kind: 'Salary', currency: 'USD', amount: 3450, date: '2026-01-05', frequency: 'Monthly' },
];
const record = id => records.find(entry => entry.id === id);
const data = { records, occurrences: [], debtPayments: [], categories: [] };
const item = (date, extra = {}) => ({ key: 'epam:' + date, record: record('epam'), date, status: 'overdue', direction: 'income', amount: 3450, ...extra });

// Where the workspace posts a Tracker repayment (`recordRepayment`).
const trackerRoute = update => update.exchange_rate !== undefined ? '/api/investment-history/exchange' : '/api/investment-history';
/** Opens the form for a request and returns the controls a person uses. */
function open(request, props = {}, source = data) {
 const calls = { saved: [], done: [], closed: 0 };
 const plan = plans.planPayment(request, source, today);
 const saves = { tracker: async update => { calls.saved.push(trackerRoute(update) + ' ' + stable(update)); }, mortgage: async payment => { calls.saved.push(stable(paymentFields(payment))); calls.payment = payment; }, planning: async (action, payload) => { calls.saved.push(action + ' ' + stable(payload)); calls.payload = payload; }, ...props.saves };
 r.mount(React.createElement(PaymentForm, { plan, data: source, currencies: ['USD', 'UZS'], onSaved: draft => calls.done.push(draft), onClose: () => calls.closed++, ...props, saves }));
 const field = name => r.find(node => node.props?.['data-field'] === name);
 const numbers = within => r.all(byType(ui.FormattedNumberInput), within ? [within] : undefined);
 const view = {
  plan, calls, field,
  html: () => r.html(),
  amount: value => r.fire(numbers(field('amount'))[0], 'onValueChange', value, false),
  account: id => r.fire(r.find(byType(ui.NativeSelect), [field('account')]), 'onChange', { target: { value: id } }),
  currency: code => r.fire(r.find(byType(CurrencySelect)), 'onChange', code),
  split: (index, value) => r.fire(numbers(field('split'))[index], 'onValueChange', value, false),
  interest: value => r.fire(numbers(r.find(byType('details')))[0], 'onValueChange', value, false),
  notes: value => r.fire(r.find(byType('textarea')), 'onChange', { target: { value } }),
  date: value => r.fire(r.find(byType(ui.DatePicker)), 'onChange', value),
  button: () => r.all(byType(ui.Button)).at(-1),
  save: () => props.inline ? r.fireAsync(view.button(), 'onClick') : r.fireAsync(r.find(byType('form')), 'onSubmit', event()),
  errors: () => r.all(node => node.type === 'small' && node.props.role === 'alert').map(text),
 };
 return view;
}
const pay = async (request, steps = {}, props) => {
 const view = open(request, props);
 if (steps.account) view.account(steps.account);
 if (steps.currency) view.currency(steps.currency);
 if (steps.amount !== undefined) view.amount(steps.amount);
 if (steps.principal !== undefined) view.split(0, steps.principal);
 if (steps.splitInterest !== undefined) view.split(1, steps.splitInterest);
 if (steps.interest !== undefined) view.interest(steps.interest);
 if (steps.notes) view.notes(steps.notes);
 await view.save();
 return view.calls;
};

test('a mortgage payment is sent as the mortgage form sent it, also from an account in another currency', async () => {
 assert.equal((await pay({ record: record('m1') }, { account: 'c1', principal: 1200, splitInterest: 300, notes: 'October' })).saved[0], sentBefore.mortgage);
 const fxCalls = await pay({ record: record('m1') }, { account: 'c2', principal: 1000, splitInterest: 200 });
 assert.equal(fxCalls.saved[0], sentBefore.mortgageFx);
 assert.equal('category' in fxCalls.payment, false, 'the category travels only when the person chose one');
});

test('a mortgage paid from Recurring reaches the same database action with the same values as its old form', async () => {
 const { payment } = await pay({ item: { key: 'm1:installment:' + today, record: record('m1'), date: today, status: 'due', direction: 'expense', amount: 1500, installment: true } }, { account: 'c1', principal: 1200, splitInterest: 300, notes: 'October' });
 // What /api/mortgage-payments hands to planning_action 'mortgage' for this payment.
 const action = { id: payment.id, account_id: payment.account_id, target_id: payment.mortgage_id, amount: payment.principal, received: 0, fee: payment.interest, date: payment.date, notes: payment.notes };
 assert.deepEqual({ ...action, id: 'ID', date: 'TODAY' }, JSON.parse(sentBefore.recurringMortgage.slice('mortgage '.length)));
});

test('a loan, a debt carried from an earlier month, one in another currency and money lent are sent as Record repayment sent them', async () => {
 assert.equal((await pay({ record: record('l1') }, { account: 'c1', amount: 450, interest: 20, notes: 'Part' })).saved[0], sentBefore.repayment);
 // A loan month left open in an earlier month is paid on its own due date.
 const carried = { key: 'l1:installment:' + due, record: record('l1'), date: shiftDay(today, -40), status: 'overdue', direction: 'expense', amount: 200, installment: true };
 const view = open({ item: carried });
 assert.equal(view.plan.date, carried.date);
 assert.equal((await pay({ record: record('l1'), date: due }, { account: 'c1', amount: 450 })).saved[0], sentBefore.repaymentCarried);
 assert.equal((await pay({ record: record('l1') }, { account: 'c2', amount: 450 })).saved[0], sentBefore.repaymentFx);
 assert.equal((await pay({ record: record('lent') }, { account: 'c1', amount: 300, interest: 15 })).saved[0], sentBefore.lent);
});

test('a loan opened from its own row is kept in its Tracker history as before; interest makes it a repayment action', async () => {
 assert.equal((await pay({ record: record('l1'), tracked: true }, { account: 'c1', amount: 450, notes: 'Part' })).saved[0], sentBefore.tracked);
 assert.equal((await pay({ record: record('l1'), tracked: true }, { account: 'c2', amount: 450 })).saved[0], sentBefore.trackedFx);
 assert.equal((await pay({ record: record('lent'), tracked: true }, { account: 'c1', amount: 300 })).saved[0], sentBefore.trackedLent);
 // Only the repayment action records interest, so a payment with interest goes there from any screen.
 assert.equal((await pay({ record: record('l1'), tracked: true }, { account: 'c1', amount: 450, interest: 20, notes: 'Part' })).saved[0], sentBefore.repayment);
 // A mortgage has one path whatever opened it.
 assert.equal(plans.planPayment({ record: record('m1'), tracked: true }, data, today).tracked, undefined);
});

test('the workspace posts a Tracker repayment to the Tracker\'s own routes and refuses it in the sample workspace', async () => {
 const posts = [], refreshed = [];
 const actions = demo => loadTS('components/workspace/state/use-record-actions.ts', { '@/lib/api-client': { requestJson: async (url, options) => { posts.push([url, options.body]); } }, '@/lib/feedback': { showSaved() {} } })
  .useRecordActions({ demo, rows: [], setRows() {}, refreshRecords: () => refreshed.push(true), splits: [], categories: [], household: {}, demoHoldingAccounts: [], setDemoHoldingAccounts() {}, stopping: null });
 await actions(false).recordRepayment({ id: 'a', amount: 1 });
 await actions(false).recordRepayment({ id: 'b', amount: 1, exchange_rate: 2 });
 assert.deepEqual(posts.map(([url]) => url), ['/api/investment-history', '/api/investment-history/exchange']);
 assert.equal(refreshed.length, 2);
 await assert.rejects(actions(true).recordRepayment({ id: 'c' }), /Sign in to save planning changes\./);
 assert.equal(posts.length, 2);
});

test('a scheduled payment is sent as before: in full, in part, as zero, converted, in the account currency, early and as a later payment', async () => {
 assert.equal((await pay({ item: item(due) }, { account: 'c1' })).saved[0], sentBefore.occurrence);
 assert.equal((await pay({ item: item(due) }, { account: 'c1', amount: 1000, notes: 'First half' })).saved[0], sentBefore.occurrencePart);
 assert.equal((await pay({ item: item(due) }, { account: 'c1', amount: 0 })).saved[0], sentBefore.occurrenceZero);
 assert.equal((await pay({ item: item(due) }, { account: 'sum' })).saved[0], sentBefore.occurrenceFx);
 assert.equal((await pay({ item: item(due) }, { account: 'sum', currency: 'UZS', amount: 30155000 })).saved[0], sentBefore.occurrenceInAccountCurrency);
 assert.equal((await pay({ item: item(due) }, { account: 'c1', currency: 'UZS', amount: 13320000 })).saved[0], sentBefore.occurrenceOtherCurrency);
 assert.equal((await pay({ item: item(ahead, { status: 'due' }) }, { account: 'c1' })).saved[0], sentBefore.occurrenceEarly);
 assert.equal((await pay({ item: item(due, { status: 'paid', recorded: 3000 }) }, { account: 'c1' })).saved[0], sentBefore.occurrenceExtra);
});

test('every kind shows the same fields in the same order, with what is still due in its own currency', () => {
 const order = () => r.all(node => typeof node.type === 'string' && (node.props['data-field'] || node.type === 'details' || node.props.className === 'payment-summary')).map(node => node.props['data-field'] ?? node.type);
 const schedule = open({ item: item(due) });
 assert.deepEqual(order(), ['div', 'amount', 'date', 'account', 'details']);
 assert.ok(schedule.html().includes(`<strong>EPAM Systems</strong><small>Still due: ${money(3450)}</small>`));
 assert.match(schedule.html(), /Received into/);
 assert.ok(schedule.html().includes(`<option value="${due}">${formatDate(due, 'en-US')} · another day</option>`));
 assert.equal(r.all(byType(ui.NativeSelect))[1].props.value, due, 'the due date of the row it was opened from');
 // The currency it arrived in: the schedule's, then the preferred ones; the schedule's own brings its amount back.
 assert.deepEqual(r.find(byType(CurrencySelect)).props.currencies, ['USD', 'UZS']);
 schedule.currency('UZS');
 assert.equal(r.find(byType(ui.FormattedNumberInput)).props.value, 0);
 schedule.currency('USD');
 assert.equal(r.find(byType(ui.FormattedNumberInput)).props.value, 3450);
 const loan = open({ record: record('l1') });
 assert.deepEqual(order(), ['div', 'amount', 'date', 'account', 'details']);
 assert.ok(loan.html().includes(`<small>Outstanding balance: ${money(3000)}</small>`));
 assert.match(loan.html(), /Paid from/);
 assert.match(loan.html(), /Interest paid · USD/);
 assert.match(open({ record: record('lent') }).html(), /Received into.*Interest received · USD/s);
 open({ record: record('m1') });
 assert.deepEqual(order(), ['div', 'amount', 'date', 'account', 'split', 'details']);
 assert.equal(r.find(byType(ui.DatePicker)).props.min, '2026-01-15');
 assert.equal(r.find(byType(ui.DatePicker)).props.max, today);
});

test('the account starts as the one that last paid this obligation', () => {
 const paid = { ...data, debtPayments: [{ record_id: 'l1', date: '2026-09-01', account_id: 'c2' }] };
 open({ record: record('l1') }, {}, paid);
 assert.equal(r.find(byType(ui.NativeSelect)).props.value, 'c2');
 // Without a payment to learn from, the only account in its currency.
 open({ record: record('l1') });
 assert.equal(r.find(byType(ui.NativeSelect)).props.value, 'c1');
});

test('a mortgage starts as a normal month, and its amount and split follow each other', () => {
 const home = { ...record('m1'), rate: 12, estimated_monthly_payment: 1500 };
 const view = open({ record: home });
 const values = () => r.all(byType(ui.FormattedNumberInput)).slice(0, 3).map(node => node.props.value);
 assert.deepEqual(values(), [1500, 500, 1000]);
 view.amount(2000);
 assert.deepEqual(values(), [2000, 1000, 1000], 'the interest stays and the rest is principal');
 view.amount(400);
 assert.deepEqual(values(), [400, 0, 400]);
 view.split(0, 100.1); view.split(1, 0.2);
 assert.deepEqual(values(), [100.3, 100.1, 0.2], 'added exactly');
 assert.ok(view.html().includes(`Remaining balance: ${money(100000 - 100.1)}`));
 assert.ok(view.html().includes(`Cash balance after update: ${money(5000 - 100.3)}`));
});

test('problems show under their fields, the first one takes the focus and nothing is sent', async () => {
 focused.length = 0;
 const view = open({ record: record('l1') }, {}, { ...data, records: records.filter(entry => !['c1', 'c2', 'sum'].includes(entry.id)) });
 assert.deepEqual(view.errors(), [], 'nothing is wrong before a save was tried');
 assert.equal(view.button().props.disabled, false, 'Save is never switched off for a field problem');
 await view.save();
 assert.deepEqual(view.errors(), ['Enter an amount greater than zero.', 'Choose a cash account.']);
 assert.deepEqual(focused, ['[data-field="amount"] input:not([disabled])']);
 assert.equal(view.calls.saved.length, 0);
 assert.equal(r.find(byType(ui.NativeSelect)).props['aria-invalid'], true);
 assert.equal(r.find(byType(ui.FormattedNumberInput)).props.invalid, true);
 assert.match(view.html(), /Add a cash account to record this transaction\./);
});

test('a repayment over the balance, a principal over what is owed, too little cash and a date before the start are refused in words', async () => {
 const loan = open({ record: record('l1') });
 assert.equal(r.find(byType(ui.FormattedNumberInput)).props.max, 3000);
 loan.amount(3000.5);
 await loan.save();
 assert.deepEqual(loan.errors(), ['Repayment cannot exceed the outstanding balance.']);
 loan.amount(3000); loan.interest(2500);
 assert.deepEqual(loan.errors(), ['Not enough money in the selected cash account.'], 'the messages follow the form as it is corrected');
 loan.interest(0);
 assert.deepEqual(loan.errors(), []);

 focused.length = 0;
 const mortgage = open({ record: { ...record('m1'), amount: 900 } });
 mortgage.split(0, 950);
 await mortgage.save();
 assert.deepEqual(mortgage.errors(), ['Principal exceeds the outstanding balance.']);
 assert.deepEqual(focused, ['[data-field="split"] input:not([disabled])']);
 mortgage.split(0, 900); mortgage.date('2026-01-01');
 assert.deepEqual(mortgage.errors(), ['Payment date cannot precede the start date.']);
 mortgage.date(shiftDay(today, 1));
 assert.deepEqual(mortgage.errors(), ['Actual income and expenses cannot be dated in the future.']);
 assert.equal(mortgage.calls.saved.length, 0);
 // A scheduled payment of nothing is a real payment; only its account is needed.
 const schedule = open({ item: item(due) });
 schedule.account(''); schedule.amount(0);
 await schedule.save();
 assert.deepEqual(schedule.errors(), ['Choose a cash account.']);
});

test('Save waits only for the day\'s rate and says so; a rate that cannot be found is a problem of the account', async () => {
 fx.loading = true;
 const view = open({ record: record('l1') });
 view.account('c2'); view.amount(100);
 assert.equal(view.button().props.disabled, true);
 assert.equal(r.find(byType(ui.FormFooter)).props.blocked, 'Loading exchange rate for the selected date…');
 await view.save();
 assert.equal(view.calls.saved.length, 0);
 fx.loading = false;
 r.update();
 assert.equal(view.button().props.disabled, false);
 assert.equal(r.find(byType(ui.FormFooter)).props.blocked, undefined);
 assert.ok(view.html().includes(`Account amount: ${money(50, 'EUR')}`));
 delete fx.rates.EURUSD;
 r.update();
 await view.save();
 assert.deepEqual(view.errors(), ['Exchange rate unavailable.']);
 fx.rates.EURUSD = 2;
});

test('an unknown outcome locks the form on what was sent so Retry repeats it; a refusal unlocks it', async () => {
 let failure = Object.assign(Error('Network lost'), { confirmedFailure: false });
 const attempts = [];
 fx.retries = 0;
 const view = open({ record: record('l1') }, { saves: { planning: async (action, payload) => { attempts.push(payload); if (failure) throw failure; } } });
 view.account('c2'); view.amount(100);
 await view.save();
 assert.equal(r.find(byType('fieldset')).props.disabled, true);
 assert.equal(text(view.button()), 'Retry');
 assert.match(view.html(), /role="alert" data-detail="Retry the same payment to avoid duplicates.">Network lost</);
 failure = Object.assign(Error('Repayment cannot exceed the outstanding balance.'), { confirmedFailure: true });
 await view.save();
 assert.equal(attempts[1].id, attempts[0].id, 'the retry is the same payment');
 assert.equal(r.find(byType('fieldset')).props.disabled, false);
 assert.equal(text(view.button()), 'Save payment');
 assert.equal(fx.retries, 1, 'the rate is read again after a refusal');
 failure = null;
 view.amount(90);
 await view.save();
 assert.equal(attempts[2].amount, 90);
 assert.equal(view.calls.done.length, 1);
});

test('the button shows progress and a second press while saving sends nothing', async () => {
 let finish;
 const sent = [];
 const view = open({ record: record('l1') }, { saves: { planning: payload => { sent.push(payload); return new Promise(resolve => { finish = resolve; }); } } });
 view.amount(10);
 const pending = r.find(byType('form')).props.onSubmit(event());
 r.update();
 assert.equal(text(view.button()), 'Saving…');
 assert.equal(view.button().props.disabled, true);
 await r.find(byType('form')).props.onSubmit(event());
 assert.equal(sent.length, 1);
 finish(); await pending;
});

test('inside the expense form it is the same fields without a form of its own: Enter and the button save it', async () => {
 const drafts = [];
 const view = open({ record: record('l1') }, { inline: true, onDraftState: (dirty, busy) => drafts.push([dirty, busy]) });
 assert.equal(r.all(byType('form')).length, 0);
 assert.equal(view.button().props.type, 'button');
 assert.deepEqual(drafts, [[false, false]]);
 view.amount(75);
 assert.deepEqual(drafts.at(-1), [true, false]);
 const wrapper = r.find(node => node.props?.className === 'record-form payment-form');
 const key = (name, tagName, extra = {}) => event({ key: name, target: { tagName }, ...extra });
 for (const ignored of [key('Enter', 'TEXTAREA'), key('Enter', 'BUTTON'), key('a', 'INPUT'), key('Enter', 'INPUT', { shiftKey: true })]) wrapper.props.onKeyDown(ignored);
 await r.flush();
 assert.equal(view.calls.saved.length, 0);
 const enter = key('Enter', 'INPUT');
 wrapper.props.onKeyDown(enter);
 await r.flush();
 assert.equal(enter.defaultPrevented, true);
 assert.equal(view.calls.saved.length, 1);
 r.find(byType(ui.FormFooter)).props.onCancel();
 assert.equal(view.calls.closed, 1);
});

test('changing a recorded mortgage payment opens on its values, counts back what it took and saves under its id', async () => {
 const editing = { id: 'p1', mortgage_id: 'm1', principal: 400, interest: 1200, date: '2026-10-01', notes: 'October', account_id: 'c1' };
 const edited = [];
 const source = { ...data, records: records.map(entry => entry.id === 'm1' ? { ...entry, amount: 99600 } : entry.id === 'c1' ? { ...entry, amount: 3400 } : entry), categories: [{ id: 'housing', name: 'Housing', direction: 'expense' }] };
 const view = open({ record: source.records.find(entry => entry.id === 'm1'), editing, category: { kind: 'Other expense', category_id: 'housing' } }, { saves: { edit: async payment => { edited.push(payment); } } }, source);
 assert.deepEqual(r.all(byType(ui.FormattedNumberInput)).slice(0, 3).map(node => node.props.value), [1600, 400, 1200]);
 assert.equal(r.all(byType(ui.FormattedNumberInput))[1].props.max, 100000, 'the mortgage owed 100,000 before this payment');
 assert.ok(view.html().includes(`Outstanding balance: ${money(100000)}`));
 assert.ok(view.html().includes(`Cash balance after update: ${money(3400)}`), 'the wallet held 5,000 before it');
 assert.match(view.html(), /<details class="record-optional-details" open="">/, 'a payment with a note opens its details');
 assert.match(view.html(), /data-category="housing"/);
 view.split(1, 4601);
 await view.save();
 assert.deepEqual(view.errors(), ['Not enough money in the selected cash account.']);
 view.split(0, 500); view.split(1, 1000);
 r.fire(r.find(byType(CategoryChoiceButton)), 'onChange', { kind: 'Charity', category_id: null });
 r.fire(r.find(byType(CategoryChoiceButton)), 'onChange', null);
 assert.match(view.html(), /data-category="Charity"/, 'clearing the field keeps the last choice');
 await view.save();
 assert.deepEqual(edited, [{ id: 'p1', mortgage_id: 'm1', principal: 500, interest: 1000, date: '2026-10-01', notes: 'October', account_id: 'c1', category: { kind: 'Charity', category_id: null } }]);
 assert.equal(view.calls.saved.length, 0, 'an edit never records a second payment');
});

test('an edited payment from an account in another currency leaves the balance check to the server', async () => {
 const editing = { id: 'p1', mortgage_id: 'm1', principal: 400, interest: 1200, date: '2026-10-01', notes: '', account_id: 'c2' };
 const edited = [];
 const view = open({ record: record('m1'), editing }, { saves: { edit: async payment => { edited.push(payment); } } }, { ...data, records: records.map(entry => entry.id === 'c2' ? { ...entry, amount: 100 } : entry) });
 await view.save();
 assert.deepEqual(view.errors(), []);
 assert.equal(edited[0].exchange_rate, 2);
});

/** Opens the whole dialog and returns how it was closed and what it told the screen behind it. */
function dialog(request, source) {
 const calls = { closed: 0, paid: [], saved: [] };
 const plan = plans.planPayment(request, source, today);
 r.mount(React.createElement(PaymentDialog, { plan, data: source, currencies: ['USD'], saves: { mortgage: async payment => { calls.saved.push(payment); }, planning: async (action, payload) => { calls.saved.push(payload); } }, onPaid: (paidPlan, draft) => calls.paid.push([paidPlan.kind, draft.due]), onClose: () => calls.closed++ }));
 return calls;
}
const submit = () => r.fireAsync(r.find(byType('form')), 'onSubmit', event());

test('the dialog has one title, focuses the amount, and closes through the discard question', async () => {
 const calls = dialog({ record: record('l1') }, data);
 assert.match(r.html(), /<h2>Record payment<\/h2>/);
 const content = r.find(byType(ui.DialogContent));
 const opened = event({ currentTarget: { querySelector: selector => ({ focus() { focused.push('open:' + selector); } }) } });
 focused.length = 0;
 content.props.onOpenAutoFocus(opened);
 assert.deepEqual(focused, ['open:[data-field="amount"] input:not([disabled])']);
 assert.equal(opened.defaultPrevented, true);
 r.fire(r.find(byType(ui.Dialog)), 'onOpenChange', true);
 assert.equal(calls.closed, 0);
 r.fire(r.find(byType(ui.Dialog)), 'onOpenChange', false);
 assert.equal(calls.closed, 1);
 assert.equal(guard.closes.at(-1).busy, false);
 dialog({ record: record('m1') }, data);
 assert.match(r.html(), /<h2>Record payment<i data-hint="Enter principal and interest/);
});

test('Record another is offered only while the obligation has another open due date', async () => {
 // A salary with two dates still open: the one paid, and an older one.
 const older = shiftDay(due, -30);
 const salary = { ...record('epam'), date: older, frequency: 'Monthly' };
 const source = { ...data, records: [...records.filter(entry => entry.id !== 'epam'), salary] };
 const { openDueDates } = loadTS('lib/recurring.ts');
 const open = openDueDates(source.records, [], 'epam', today);
 assert.ok(open.length >= 2);
 const last = open.at(-1);
 const calls = dialog({ item: { ...item(last), record: salary } }, source);
 await submit();
 assert.equal(calls.closed, 0);
 assert.deepEqual(calls.paid, [['schedule', last]]);
 assert.match(r.html(), /<p role="status">Saved\.<\/p>/);
 assert.ok(r.html().includes(`EPAM Systems · Due ${formatDate(open[0], 'en-US')}`));
 assert.equal(r.find(byType(ui.FormFooter)).props.cancelLabel, 'Done');
 await r.fireAsync(r.find(byType(ui.Button, 'Record another')), 'onClick');
 // The next form is for the oldest open date and no longer offers the one just paid.
 const dues = r.all(byType('option')).map(option => option.props.value).filter(value => /^\d{4}-/.test(value));
 assert.equal(r.find(node => node.type === ui.NativeSelect && node.props.value === open[0]).props.value, open[0]);
 assert.equal(dues.includes(last), false);
 assert.notEqual(calls.saved[0].id, undefined);
 await submit();
 assert.notEqual(calls.saved[1].id, calls.saved[0].id, 'another payment, not a retry');
 assert.equal(calls.saved[1].date, open[0]);

 // A later payment for a recorded date, and a loan with no other unpaid month, simply close.
 const extra = dialog({ item: item(due, { status: 'paid', recorded: 3000 }) }, data);
 await submit();
 assert.equal(extra.closed, 1);
 const loan = dialog({ record: record('l1') }, data);
 r.fire(r.find(byType(ui.FormattedNumberInput)), 'onValueChange', 100, false);
 await submit();
 assert.equal(loan.closed, 1);
 assert.deepEqual(loan.paid, [['debt', today]]);
});

test('a loan with another unpaid month offers it, dated on that month when it is past', async () => {
 const started = shiftDay(today, -75);
 const loan = { ...record('l1'), estimated_monthly_payment: 200, created_at: started + 'T00:00:00Z', opened_on: started, date: shiftDay(today, 400) };
 const source = { ...data, records: [...records.filter(entry => entry.id !== 'l1'), loan] };
 const { upcomingPayments } = loadTS('lib/planning.ts');
 const unpaid = upcomingPayments(source.records, [], today, today, []).filter(entry => entry.type === 'installment' && entry.record.id === 'l1');
 const draft = { ...plans.paymentDraft(plans.planPayment({ record: loan }, source, today), 'x', 'c1', today), amount: 200 };
 const next = plans.nextPayment(plans.planPayment({ record: loan }, source, today), draft, source, today);
 const others = unpaid.filter(entry => entry.date.slice(0, 7) !== today.slice(0, 7));
 if (others.length) {
  assert.equal(next.kind, 'debt');
  assert.equal(next.due, 2800);
  assert.equal(next.date, others[0].date.slice(0, 7) < today.slice(0, 7) ? others[0].date : today);
 } else assert.equal(next, null);
 // Paid off, or without the payments read, there is nothing more to offer.
 assert.equal(plans.nextPayment(plans.planPayment({ record: loan }, source, today), { ...draft, amount: 3000 }, source, today), null);
 assert.equal(plans.nextPayment(plans.planPayment({ record: loan }, source, today), draft, { ...source, debtPayments: undefined }, today), null);
});

test('a link names a due date, a loan month or a debt; a skipped date or a missing record opens nothing', () => {
 const linked = plans.planPayment({ recordId: 'epam', date: plans.planPayment({ item: item(due) }, data, today).dues[0] }, data, today);
 assert.equal(linked.kind, 'schedule');
 assert.equal(linked.amount, 3450);
 assert.equal(plans.planPayment({ recordId: 'l1', date: today }, data, today).kind, 'debt');
 assert.equal(plans.planPayment({ recordId: 'm1', date: today }, data, today).category.kind, 'Other expense', 'a new mortgage payment starts in the latest payment\'s category');
 assert.equal(plans.planPayment({ recordId: 'lent', date: today }, data, today), null, 'money that arrives by itself is not paid from a link');
 assert.equal(plans.planPayment({ recordId: 'gone', date: today }, data, today), null);
 assert.equal(plans.planPayment({ item: item(due, { status: 'skipped' }) }, data, today), null);
 const skipped = { ...data, occurrences: [{ id: 'o1', record_id: 'epam', due_on: linked.date, status: 'dismissed' }] };
 assert.equal(plans.planPayment({ recordId: 'epam', date: linked.date }, skipped, today), null);
});

test('a confirmed loan or mortgage payment is noted for the screen behind: its month and the principal owed less', () => {
 const loan = plans.planPayment({ record: record('l1') }, data, today);
 assert.deepEqual(plans.debtPaymentNote(loan, { ...plans.paymentDraft(loan, 'x', 'c1', today), amount: 450, interest: 20 }),
  { payment: { record_id: 'l1', date: today, amount: 470, currency: 'USD', account_id: 'c1' }, principal: 450 });
 const mortgage = plans.planPayment({ record: record('m1') }, data, today);
 assert.deepEqual(plans.debtPaymentNote(mortgage, plans.withSplit(plans.paymentDraft(mortgage, 'x', 'c1', today), { principal: 1200, interest: 300 })),
  { payment: { record_id: 'm1', date: today, amount: 1500, currency: 'USD', account_id: 'c1' }, principal: 1200 });
 const schedule = plans.planPayment({ item: item(due) }, data, today);
 assert.equal(plans.debtPaymentNote(schedule, plans.paymentDraft(schedule, 'x', 'c1', today)), null);
 assert.equal(plans.debtPaymentNote({ ...mortgage, editing: { id: 'p' } }, plans.paymentDraft(mortgage, 'x', 'c1', today)), null);
});

test('a #pay link opens Record payment once, after the records arrive, and clears the address', () => {
 const listeners = {}, replaced = [], opened = [];
 globalThis.window = { location: { hash: '#pay=epam:2026-10-05', pathname: '/upcoming', search: '?a=1' }, history: { replaceState: (state, title, url) => { replaced.push(url); window.location.hash = ''; } },
  addEventListener: (name, listener) => { listeners[name] = listener; }, removeEventListener: name => { delete listeners[name]; } };
 const link = createRenderer();
 const { usePayLink } = link.load('components/workspace/payment-host.tsx', { '@/components/workspace/workspace-lazy': { PaymentDialog: () => null }, '@/components/workspace/workspace-provider': { useWorkspace: () => ({}) } });
 const Reader = ({ ready }) => { usePayLink(ready, request => opened.push(request)); return null; };
 link.mount(React.createElement(Reader, { ready: false }));
 assert.deepEqual(opened, [], 'it waits for the records');
 link.render(React.createElement(Reader, { ready: true }));
 assert.deepEqual(opened, [{ recordId: 'epam', date: '2026-10-05' }]);
 assert.deepEqual(replaced, ['/upcoming?a=1']);
 link.render(React.createElement(Reader, { ready: true }));
 assert.equal(opened.length, 1, 'a later render does not open it again');
 // A link followed while the page is open arrives as a hash change.
 window.location.hash = '#pay=l1:2026-11-01';
 listeners.hashchange();
 assert.deepEqual(opened.at(-1), { recordId: 'l1', date: '2026-11-01' });
 window.location.hash = '#forecast';
 listeners.hashchange();
 assert.equal(opened.length, 2);
 link.unmount();
 assert.equal('hashchange' in listeners, false);
 delete globalThis.window;
});

test('the workspace renders the dialog for the payment that was opened and notes a loan payment in the planning data', async () => {
 const noted = [], closed = [];
 globalThis.window = { location: { hash: '', pathname: '/', search: '' }, history: { replaceState() {} }, addEventListener() {}, removeEventListener() {} };
 const shell = createRenderer();
 const Dialog = named('PaymentDialog', () => null);
 const workspace = { paying: null, setPaying: value => closed.push(value), openPayment() {}, planning: { data, save: async () => {}, noteDebtPayment: (payment, principal) => noted.push([payment.record_id, principal]) }, preferencesData: { currencies: ['USD'] }, recordMortgagePayment: async () => {}, recordRepayment: async () => {} };
 const { WorkspacePayment } = shell.load('components/workspace/payment-host.tsx', { '@/components/workspace/workspace-lazy': { PaymentDialog: Dialog }, '@/components/workspace/workspace-provider': { useWorkspace: () => workspace } });
 shell.mount(React.createElement(WorkspacePayment));
 assert.equal(shell.all(byType(Dialog)).length, 0);
 workspace.paying = plans.planPayment({ record: record('l1') }, data, today);
 shell.mount(React.createElement(WorkspacePayment));
 const props = shell.find(byType(Dialog)).props;
 assert.equal(props.plan, workspace.paying);
 assert.equal(props.saves.planning, workspace.planning.save);
 assert.equal(props.saves.mortgage, workspace.recordMortgagePayment);
 assert.equal(props.saves.tracker, workspace.recordRepayment);
 props.onPaid(workspace.paying, { ...plans.paymentDraft(workspace.paying, 'x', 'c1', today), amount: 450 });
 props.onPaid(plans.planPayment({ item: item(due) }, data, today), plans.paymentDraft(plans.planPayment({ item: item(due) }, data, today), 'x', 'c1', today));
 assert.deepEqual(noted, [['l1', 450]]);
 props.onClose();
 assert.deepEqual(closed, [null]);
 delete globalThis.window;
});

test('no screen keeps a payment form of its own: every entry point goes through the workspace opener', async () => {
 const fs = await import('node:fs');
 const read = file => fs.readFileSync(file, 'utf8');
 for (const gone of ['components/mortgage-payment-dialog.tsx']) assert.equal(fs.existsSync(gone), false, gone);
 assert.match(read('components/loans/loans-list.tsx'), /liabilities\.includes\(shown\.kind\) \? \(\) => \{ openPayment\(\{ record: saved, tracked: true \}\); \} : undefined;/);
 assert.match(read('components/workspace/records-table.tsx'), /openPayment\(\{ record: storedRecord\(r\), tracked: true \}\)/);
 assert.match(read('components/workspace/screens/cash-flow-screen.tsx'), /onPay=\{record => \{ openPayment\(\{ record \}\); \}\}/);
 assert.match(read('components/workspace/screens/upcoming-screen.tsx'), /onPay=\{request => \{ openPayment\(request\); \}\}/);
 assert.match(read('components/workspace/screens/overview-screen.tsx'), /onPay: \(recordId, date\) => \{ openPayment\(\{ recordId, date \}\); \}/);
 assert.match(read('components/workspace/workspace-dialogs.tsx'), /<WorkspacePayment\/>/);
 assert.match(read('components/record-dialog/expense-form.tsx'), /<PaymentForm inline key=\{plan\.target\.id\}/);
 const operation = read('components/planning/account-operation.tsx');
 assert.match(operation, /export type Operation = \{ action: 'reconcile'/);
 assert.doesNotMatch(operation, /'repayment'|'occurrence'|'transfer'|'mortgage'/, 'Adjust balance is all it does');
 for (const screen of ['components/planning/upcoming-page.tsx', 'components/loans/loans-list.tsx', 'components/workspace/records-table.tsx', 'components/monthly-mortgage-payments.tsx'])
  assert.doesNotMatch(read(screen), /components\/payments|MortgagePaymentDialog|AccountOperation|InvestmentTracker/, screen + ' opens payments through the workspace only');
 assert.doesNotMatch(read('components/workspace/state/use-open-dialogs.ts'), /debtPayment|payingMortgage/);
});
