import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byLabel, byType, createRenderer, event, host, hostModule, stubs, text } from './helpers/component-tree.mjs';

const { formatDate, formatMoney, formatSignedMoney } = loadTS('lib/format.ts');
const { monthOccurrences, recurringSummary } = loadTS('lib/recurring.ts');
const { upcomingPayments } = loadTS('lib/planning.ts');
const { comingUp, dayGroups, dueTodayPayments, duePaymentData, ofTone, signedAmounts, withAccount } = loadTS('lib/recurring-days.ts');
const h = React.createElement;
/** A press whose handler saves in the background: wait for the saves to settle, then read the tree. */
const settle = async view => { await new Promise(resolve => setTimeout(resolve)); view.update(); };
const usd = value => formatMoney(value, 'USD', 'en-US'), signed = value => formatSignedMoney(value, 'USD', 'en-US');

const record = (id, kind, amount, date, extra = {}) => ({ id, name: id, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Monthly', notes: '', ...extra });
const today = '2026-10-10';
const checking = record('checking', 'Cash', 5000, '2026-01-01', { frequency: 'Once' });
const savings = record('savings', 'Cash', 9000, '2026-01-01', { frequency: 'Once' });
const som = record('som', 'Cash', 9e6, '2026-01-01', { frequency: 'Once', currency: 'UZS' });
const salary = record('salary', 'Salary', 3000, '2026-01-10');
const rent = record('rent', 'Rent expense', 900, '2026-01-10');
const gym = record('gym', 'Living expense', 40, '2026-01-10');
const tuition = record('tuition', 'Other expense', 2e6, '2026-01-10', { currency: 'UZS' });
const later = record('later', 'Living expense', 15, '2026-01-20');
const card = record('card', 'Debt', 2300, '2026-10-18', { frequency: 'Once' });
const lent = record('lent', 'Money lent', 500, '2026-10-18', { frequency: 'Once' });
const loan = record('loan', 'Loan', 1000, '2040-01-10', { frequency: 'Once', opened_on: '2026-07-12', estimated_monthly_payment: 100, created_at: '2026-07-12T00:00:00Z' });

test('a day gathers its income, bills and debt payments in that order; a deposit or money lent coming back is money in', () => {
 const records = [salary, rent, later, card, lent, loan];
 const items = monthOccurrences(records, [{ id: 'o', record_id: 'later', due_on: '2026-10-20', status: 'dismissed' }], '2026-10', today, []);
 const reminders = upcomingPayments(records, [], today, '2026-10-31').filter(item => item.type === 'repayment');
 const days = dayGroups(items, reminders, '2026-10-01', '2026-10-31');
 assert.deepEqual(days.map(day => [day.date, day.entries.map(entry => [entry.record.id, entry.tone, entry.status])]), [
  ['2026-10-10', [['salary', 'income', 'due'], ['rent', 'bill', 'due']]],
  ['2026-10-12', [['loan', 'debt', 'due']]],
  ['2026-10-18', [['lent', 'income', 'due'], ['card', 'debt', 'due']]],
  ['2026-10-20', [['later', 'bill', 'skipped']]],
 ]);
 assert.ok(days[0].entries[0].item && days[2].entries[0].reminder, 'an entry keeps the occurrence or the reminder it came from');
 assert.deepEqual(ofTone(days[3].entries, 'bill'), [], 'a skipped payment adds nothing to its day');
 assert.deepEqual(signedAmounts(days[0].entries), [{ amount: 3000, currency: 'USD' }, { amount: -900, currency: 'USD' }]);
 assert.deepEqual(dayGroups(items, reminders, '2026-10-11', '2026-10-17').map(day => day.date), ['2026-10-12'], 'only the days asked for');
});

test('Coming up starts tomorrow and runs 31 days: open payments, loan months and debts falling due; settled ones are left out', () => {
 const records = [salary, rent, later, card, loan];
 const data = { records, occurrences: [{ id: 'o', record_id: 'later', due_on: '2026-10-20', status: 'paid' }], debtPayments: [] };
 const days = comingUp(data, today);
 assert.deepEqual(days.map(day => [day.date, day.entries.map(entry => entry.record.id)]), [
  ['2026-10-12', ['loan']], ['2026-10-18', ['card']], ['2026-11-10', ['salary', 'rent']],
 ], 'today’s own payments stay on the list, and 20 October is already paid');
 assert.deepEqual(comingUp(data, today, 5).map(day => day.date), ['2026-10-12']);
});

test('Record all due today takes what Record payment would save unchanged; the rest wait for an account or stay on their rows', () => {
 const records = [checking, som, salary, rent, gym, tuition, later, loan, record('paid-tx', 'Living expense', 40, '2026-09-10', { frequency: 'Once', occurrence_record_id: 'gym', occurrence_due_on: '2026-09-10', account_id: 'som' })];
 const activity = [{ account_id: 'checking', target_id: 'rent', occurred_on: '2026-09-10' }];
 const items = monthOccurrences(records, [{ id: 'o', record_id: 'gym', due_on: '2026-09-10', status: 'paid', transaction_id: 'paid-tx' }], '2026-10', today, []);
 const due = dueTodayPayments(items, records, activity, today);
 // Salary and rent have one USD account to go to; tuition's only UZS account is `som`; the gym last paid from an account in another currency.
 assert.deepEqual(due.ready.map(payment => [payment.item.record.id, payment.account.id]), [['rent', 'checking'], ['salary', 'checking'], ['tuition', 'som']]);
 assert.deepEqual(due.separate.map(item => item.record.id), ['gym'], 'a payment that would need an exchange rate is not recorded in bulk');
 assert.deepEqual(due.choose, []);
 assert.ok(!items.filter(item => item.date !== today).some(item => due.ready.some(payment => payment.item === item)), 'only today’s');
 assert.deepEqual(duePaymentData('id-1', due.ready[0], today), { id: 'id-1', account_id: 'checking', target_id: 'rent', date: today, paid_on: today, amount: 900, received: 0, fee: 0, notes: '' });

 // With two accounts in the currency and no earlier payment, nothing is guessed: the person names the account.
 const open = dueTodayPayments(monthOccurrences([checking, savings, som, salary, tuition, loan], [], '2026-10', '2026-10-12', []), [checking, savings, som, salary, tuition, loan], [], '2026-10-12');
 assert.deepEqual([open.ready, open.choose, open.separate.map(item => item.record.id)], [[], [], ['loan']], 'a loan payment types its principal and interest, so it stays on its row');
 const undecided = dueTodayPayments(monthOccurrences([checking, savings, salary, tuition], [], '2026-10', today, []), [checking, savings, salary, tuition], [], today);
 assert.deepEqual(undecided.choose.map(item => item.record.id), ['salary', 'tuition']);
 assert.deepEqual(withAccount(undecided.choose, undefined), { payments: [], rest: undecided.choose });
 const picked = withAccount(undecided.choose, savings);
 assert.deepEqual([picked.payments.map(payment => [payment.item.record.id, payment.account.id]), picked.rest.map(item => item.record.id)], [[['salary', 'savings']], ['tuition']], 'the picked account takes only payments in its currency');
 assert.deepEqual(withAccount(undecided.choose, salary).payments, [], 'only a cash account pays');
 const settled = dueTodayPayments(monthOccurrences([checking, salary], [{ id: 'o', record_id: 'salary', due_on: today, status: 'paid' }], '2026-10', today, []), [checking, salary], [], today);
 assert.deepEqual(settled, { ready: [], choose: [], separate: [] }, 'a recorded or skipped payment is not due');
});

const ui = stubs();
const alert = Object.fromEntries(['AlertDialog', 'AlertDialogContent', 'AlertDialogFooter'].map(name => [name, host('div')]));
const dialogModules = { ...ui.modules, 'lucide-react': hostModule(), '@/components/ui/alert-dialog': { ...alert, AlertDialogTitle: host('h2'), AlertDialogDescription: host('p'), AlertDialogAction: host('button'), AlertDialogCancel: host('button') } };

test('the confirmation lists every payment with its account, saves them one by one, and carries on after a failure', async () => {
 const r = createRenderer();
 const { useRecordDue } = r.load('components/planning/record-due-dialog.tsx', dialogModules);
 const records = [checking, savings, som, salary, rent, tuition, loan];
 const activity = [{ id: 'a', action: 'occurrence', account_id: 'checking', target_id: 'rent', occurred_on: '2026-09-10' }];
 const items = monthOccurrences(records, [], '2026-10', today, []);
 const saved = [];
 let fail = 1;
 const save = async (action, data) => { if (saved.length === fail) { fail = -1; throw Error('Insufficient balance or invalid amount.'); } saved.push([action, data]); };
 const Host = () => { const due = useRecordDue({ records, activity, debtPayments: [] }, items, today, save); return h('main', null, due.button, due.dialog); };
 r.mount(h(Host));
 const button = label => r.find(node => node.type === 'button' && text(node) === label);
 assert.equal(r.all(byType('ul')).length, 0, 'nothing is asked until the button is pressed');
 r.fire(r.find(byType(ui.Button)), 'onClick');
 assert.ok(text(r.tree).includes('Each payment is recorded today at its scheduled amount, from the account shown.'));
 const rows = () => r.all(byType('li')).map(row => text(row));
 assert.deepEqual(rows(), ['rentchecking' + usd(900), 'tuitionsom' + formatMoney(2e6, 'UZS', 'en-US')], 'each as entered, in its own currency');
 assert.ok(text(r.tree).includes('Choose a cash account.salary'), 'salary has two accounts to go to and waits for a choice');
 r.fire(r.find(byType(ui.NativeSelect)), 'onChange', { target: { value: 'savings' } });
 assert.deepEqual(rows(), ['rentchecking' + usd(900), 'tuitionsom' + formatMoney(2e6, 'UZS', 'en-US'), 'salarysavings' + usd(3000)]);
 r.fire(button('Record 3 payments'), 'onClick', event());
 await settle(r);
 assert.equal(text(r.find(node => node.props?.role === 'alert')), 'Recorded 1 of 3. Insufficient balance or invalid amount.');
 assert.equal(r.find(byType(ui.NativeSelect)).props.disabled, true, 'the account is settled once a payment went through');
 r.fire(button('Record 2 payments'), 'onClick', event());
 await settle(r);
 assert.deepEqual(saved.map(([action, data]) => [action, data.target_id, data.account_id, data.date, data.paid_on, data.amount]), [
  ['occurrence', 'rent', 'checking', today, today, 900], ['occurrence', 'tuition', 'som', today, today, 2e6], ['occurrence', 'salary', 'savings', today, today, 3000],
 ], 'the payment that went through is not saved twice');
 assert.equal(new Set(saved.map(([, data]) => data.id)).size, 3);
 assert.ok(saved.every(([, data]) => !('currency' in data) && !('exchange_rate' in data)), 'no conversion is involved');
 assert.equal(r.all(byType('ul')).length, 0, 'the question closes when all are recorded');
 // One payment is not worth a second button.
 const One = () => h('main', null, useRecordDue({ records: [checking, rent], activity: [], debtPayments: [] }, monthOccurrences([checking, rent], [], '2026-10', today, []), today, save).button);
 r.mount(h(One));
 assert.equal(r.all(byType(ui.Button)).length, 0);
});

test('the sample workspace records nothing: the first save is refused and the question stays open', async () => {
 const r = createRenderer();
 const { useRecordDue } = r.load('components/planning/record-due-dialog.tsx', dialogModules);
 const records = [checking, salary, rent], items = monthOccurrences(records, [], '2026-10', today, []);
 const Host = () => { const due = useRecordDue({ records, activity: [], debtPayments: [] }, items, today, async () => { throw Error('Sign in to save planning changes.'); }); return h('main', null, due.button, due.dialog); };
 r.mount(h(Host));
 r.fire(r.find(byType(ui.Button)), 'onClick');
 r.fire(r.find(node => node.type === 'button' && text(node) === 'Record 2 payments'), 'onClick', event());
 await settle(r);
 assert.equal(text(r.find(node => node.props?.role === 'alert')), 'Sign in to save planning changes.');
 assert.equal(r.all(byType('li')).length, 2);
});

const RowMenu = Object.assign(({ items }) => h('menu', null, items.map(item => h('li', { key: item.label }, item.label))), { displayName: 'RowMenu' });
const pieces = { ...ui.modules, 'lucide-react': hostModule(), '@/components/presentation-foundation/row-menu': { RowMenu }, '@/components/presentation-foundation/category-icon': hostModule(), '@/components/presentation-foundation/empty-state': { EmptyState: ({ description }) => h('p', { className: 'empty' }, description) } };

test('a calendar day shows one chip per kind of money and how many payments; pressing it picks the day, whose panel lists them', () => {
 const r = createRenderer();
 const { RecurringCalendar, DayPanel } = r.load('components/planning/recurring-calendar.tsx', pieces);
 const records = [salary, rent, gym, tuition, card, loan];
 const items = monthOccurrences(records, [{ id: 'o', record_id: 'gym', due_on: today, status: 'paid' }], '2026-10', '2026-10-15', []);
 const days = dayGroups(items, upcomingPayments(records, [], '2026-10-15', '2026-10-31').filter(item => item.type === 'repayment'), '2026-10-01', '2026-10-31');
 const picked = [];
 r.mount(h(RecurringCalendar, { month: '2026-10', days, today: '2026-10-15', selected: today, onSelect: day => picked.push(day) }));
 const chips = day => r.all(node => node.props?.className === 'recurring-chip', r.find(byLabel(day))).map(chip => [chip.props['data-tone'], chip.props['data-status'], text(chip)]);
 const tenth = formatDate(today, 'en-US') + ' · 4 payments';
 assert.deepEqual(chips(tenth), [['income', 'overdue', signed(3000)], ['bill', 'overdue', '—']], 'bills in two currencies with no display rate read as a dash, never a wrong sum');
 assert.deepEqual(chips(formatDate('2026-10-12', 'en-US') + ' · 1 payments'), [['debt', 'overdue', usd(100)]], 'a single payment reads as entered');
 assert.deepEqual(chips(formatDate('2026-10-18', 'en-US') + ' · 1 payments'), [['debt', 'due', usd(2300)]]);
 assert.equal(r.find(byLabel(tenth)).props['aria-pressed'], true);
 assert.equal(r.all(byType('button')).length, 3, 'a day with nothing scheduled is not a button');
 r.fire(r.find(byLabel(formatDate('2026-10-18', 'en-US') + ' · 1 payments')), 'onClick');
 assert.deepEqual(picked, ['2026-10-18']);
 assert.deepEqual(r.all(byType('li')).map(text), ['Income', 'Bills', 'Debt payments'], 'the chips are explained under the month');

 const opened = [], closed = [];
 r.mount(h(DayPanel, { group: days[0], today, onClose: () => closed.push(1), onOpen: entry => opened.push(entry.record.id), menu: entry => [{ label: 'Record ' + entry.record.id, onSelect() {} }] }, h('button', { id: 'all' }, 'Record all due today')));
 assert.ok(text(r.tree).startsWith(formatDate(today, 'en-US') + 'Today'));
 assert.deepEqual(r.all(byType('div'), r.find(byType('dl'))).map(text), ['Income' + signed(3000), 'Bills—']);
 assert.deepEqual(r.all(byType('li'), r.find(byType('ul'))).filter(row => row.props['data-status']).map(row => row.props['data-status']), ['overdue', 'paid', 'overdue', 'overdue']);
 assert.ok(text(r.tree).includes('tuition' + formatMoney(2e6, 'UZS', 'en-US') + 'Record tuition'), 'each payment as entered, with its own menu');
 r.fire(r.find(node => node.type === 'button' && text(node) === 'rent'), 'onClick');
 r.fire(r.find(node => node.type === ui.Button && node.props['aria-label'] === 'Close'), 'onClick');
 assert.deepEqual([opened, closed.length], [['rent'], 1]);
 assert.ok(text(r.tree).endsWith('Record all due today'));
});

test('Coming up names a day’s one payment as entered and opens it; several read as a count and their net, and open the day', () => {
 const r = createRenderer();
 const { ComingUp } = r.load('components/planning/coming-up.tsx', pieces);
 const records = [salary, rent, card, tuition];
 const calls = [];
 const props = { today, onOpen: entry => calls.push(['open', entry.record.id]), onDay: day => calls.push(['day', day]), onCalendar: () => calls.push(['calendar']) };
 r.mount(h(ComingUp, { ...props, days: comingUp({ records: [salary, rent, card], occurrences: [] }, today) }));
 const rows = () => r.all(byType('li')).map(row => text(row));
 assert.deepEqual(rows(), ['18Octcard' + formatDate('2026-10-18', 'en-US') + ' · in 8 days · Debt' + usd(2300), '10Nov2 payments' + formatDate('2026-11-10', 'en-US') + ' · in 31 days' + signed(2100)]);
 for (const row of r.all(node => node.props?.className === 'recurring-coming-row')) r.fire(row, 'onClick');
 r.fire(r.find(byType(ui.Button)), 'onClick');
 assert.deepEqual(calls, [['open', 'card'], ['day', '2026-11-10'], ['calendar']]);
 r.mount(h(ComingUp, { ...props, days: comingUp({ records, occurrences: [] }, today) }));
 assert.ok(rows()[1].endsWith('in 31 days—'), 'a net across currencies with no rate is unknown');
 r.mount(h(ComingUp, { ...props, days: [] }));
 assert.equal(text(r.find(node => node.props?.className === 'empty')), 'No payments due in the next 31 days.');
});

test('the month’s tiles: income, bills and what is left; a tile narrows the list; unknown amounts read as a dash', () => {
 const r = createRenderer();
 const { RecurringSummary } = r.load('components/planning/recurring-summary.tsx', pieces);
 const items = monthOccurrences([salary, rent, gym], [{ id: 'o', record_id: 'gym', due_on: today, status: 'paid' }], '2026-10', today, []);
 const pressed = [];
 const mount = (summary, extra = {}) => r.mount(h(RecurringSummary, { month: '2026-10', summary, currency: 'USD', only: 'expense', onToggle: side => pressed.push(side), dueToday: 2, ...extra }, h('button', null, 'Money flow')));
 mount(recurringSummary(items, amount => amount));
 const tiles = r.all(node => node.props?.className === 'recurring-bar');
 assert.deepEqual(tiles.map(tile => [text(tile), tile.props['aria-pressed']]), [
  ['Income' + signed(3000) + usd(0) + ' received · ' + usd(3000) + ' remaining', false],
  ['Bills' + usd(940) + usd(40) + ' paid · ' + usd(900) + ' remaining', true],
 ]);
 assert.equal(text(r.find(byType('article'))), 'Left after bills' + usd(2060) + '2 due today');
 tiles.forEach(tile => r.fire(tile, 'onClick'));
 assert.deepEqual(pressed, ['income', 'expense']);
 mount(recurringSummary(items, amount => amount === 900 ? null : amount), { dueToday: 0 });
 assert.equal(text(r.find(byType('article'))), 'Left after bills—', 'never a figure that leaves an amount out');
 assert.ok(text(r.tree).includes('Bills—— paid · — remaining') && text(r.tree).endsWith('Exchange rate unavailable.'));
});

test('row actions show for the hovered or focused row only where a pointer hovers; touch screens and stacked rows always show them', async () => {
 const css = (await import('node:fs')).readFileSync('app/styles/transactions-recurring-goals.css', 'utf8');
 assert.match(css, /@media\(hover:hover\) and \(pointer:fine\)\{\.recurring-list \[data-layout=columns\]>\.recurring-row:not\(:hover,:focus-within\)>\.row-actions:not\(:has\(\[aria-expanded=true\]\)\)\{opacity:0\}\}/, 'hidden only without hover, focus or an open menu');
 assert.doesNotMatch(css, /\.recurring-row[^{]*\.row-actions[^{]*\{[^}]*display:none/, 'never removed: a keyboard reaches them');
 assert.match(css, /\.recurring-list \[data-layout=columns\]>\.recurring-row>\.transaction-amount\{grid-area:1\/4\}/, 'the amount ends the row, so hidden actions leave no hole after it');
 assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.recurring-bar:active,\.recurring-coming-row:active\{transform:none\}\}/);
});
