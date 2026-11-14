import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, hostModule, stubs, text } from './helpers/component-tree.mjs';

// Regressions from `/cr all pages` (2 November 2026): Reports, Budget and Recurring.
const budget = loadTS('lib/budget.ts');
const report = loadTS('lib/business-report.ts');
const recurring = loadTS('lib/recurring.ts');
const { detectSubscriptions, recurringSuggestions } = loadTS('lib/recurring-insights.ts');
const { insightColumns } = loadTS('lib/planning-reads.ts');
const { formatMoney } = loadTS('lib/format.ts');
const h = React.createElement;
const actuals = entries => new Map(entries.map(([month, amount, missing = 0]) => [month, { month, byCategory: new Map([['Charity', amount]]), missing }]));
const row = { key: 'Charity', direction: 'expense', type: 'flexible', excluded: false };
const window = [['2025-09', 60], ['2025-10', 60], ['2025-11', 60], ['2025-12', 60], ['2026-01', 60], ['2026-02', 60]];

test('Recalculate saves nothing from months that were not read, so an unread month never counts as no spending', () => {
 assert.deepEqual(budget.recalculationTargets([row], '2026-03', actuals(window), false), [{ key: 'Charity', amount: 60 }]);
 assert.deepEqual(budget.recalculationTargets([row], '2026-03', actuals(window.slice(4)), false), [], 'only January and February were read');
 assert.deepEqual(budget.recalculationTargets([row], '2026-03', actuals(window.slice(4)), true), [], 'nor the bucket');
});

test('the Year view reads the six months Recalculate averages, also across the new year', () => {
 assert.deepEqual(budget.budgetReadRange('2026-03', 'year', []), { from: '2025-09', to: '2026-12' });
 assert.deepEqual(budget.budgetReadRange('2026-10', 'year', []), { from: '2026-01', to: '2026-12' }, 'the year already covers them');
});

test('Recalculate leaves the Flexible bucket alone when its average is 0, as it does a category', () => {
 const empty = actuals(window.map(([month]) => [month, 0]));
 assert.deepEqual(budget.recalculationTargets([row], '2026-03', empty, true), []);
 assert.deepEqual(budget.recalculationTargets([row, { ...row, key: 'gone', excluded: true }], '2026-03', actuals(window), true), [{ key: 'Charity', amount: 60 }, { key: 'flex:flexible', amount: 60 }]);
});

test('Budget does not offer Recalculate until its months have loaded', () => {
 const r = createRenderer(), ui = stubs();
 const { BudgetSettingsDialog } = r.load('components/budget/settings-dialogs.tsx', { ...ui.modules, 'lucide-react': hostModule(), './budget-rows': { useCategoryName: () => item => item.name } });
 const button = () => r.find(node => node.props?.onClick && text(node) === 'Recalculate');
 r.mount(h(BudgetSettingsDialog, { mode: 'flex', applyForward: false, canRecalculate: false, onSave: async () => {}, onRecalculate: async () => {}, onClose() {} }));
 assert.equal(button().props.disabled, true);
 r.mount(h(BudgetSettingsDialog, { mode: 'flex', applyForward: false, onSave: async () => {}, onRecalculate: async () => {}, onClose() {} }));
 assert.equal(button().props.disabled, false);
});

const usd = { id: 'a', name: 'Lunch', kind: 'Living expense', currency: 'USD', amount: 10, date: '2026-10-05', frequency: 'Once' };
const unknown = (id, date, extra = {}) => ({ ...usd, id, name: id, currency: 'XYZ', day_rates: null, date, ...extra });
const range = { from: '2026-01-01', to: '2026-10-31' };

test('a report line keeps what was entered beside the converted amount, and a split keeps each part', () => {
 const { lines } = report.reportLedger({ records: [usd] }, [], range, 'UZS', '2026-10-20', { USD: 1, UZS: 12000 });
 assert.deepEqual([lines[0].amount, lines[0].entered], [120000, { amount: 10, currency: 'USD' }]);
 const parts = report.reportLedger({ records: [usd] }, [{ record_id: 'a', position: 0, category_id: 'Charity', amount: 4 }, { record_id: 'a', position: 1, category_id: 'Other expense', amount: 6 }], range, 'USD', '2026-10-20', { USD: 1 }).lines;
 assert.deepEqual(parts.map(line => [line.id, line.category, line.entered.amount]).sort(), [['a:0', 'Charity', 4], ['a:1', 'Other expense', 6]]);
});

test('an unconverted transaction stays listed by date, side and business, so a screen counts it only where it is in view', () => {
 const ledger = report.reportLedger({ records: [usd, unknown('old', '2026-03-01'), unknown('biz', '2026-10-02', { business_id: 'b1' })] }, [], range, 'USD', '2026-10-20', { USD: 1 });
 assert.equal(ledger.missing, 2);
 const period = ledger.unconverted.filter(line => line.date >= '2026-10-01');
 assert.equal(report.unconvertedCount(period), 1, 'March is outside the period');
 assert.equal(report.unconvertedCount(report.filterLines(period, ['household'])), 0, 'the business is filtered out');
 assert.equal(report.drillMatches({ direction: 'income' }, period[0]), false);
 const split = report.reportLedger({ records: [unknown('s', '2026-10-02')] }, [{ record_id: 's', position: 0, category_id: 'Charity', amount: 4 }, { record_id: 's', position: 1, category_id: 'Other expense', amount: 6 }], range, 'USD', '2026-10-20', { USD: 1 });
 assert.deepEqual([split.unconverted.length, report.unconvertedCount(split.unconverted), split.missing, split.lines.length], [2, 1, 1, 0]);
});

const parts = () => {
 const r = createRenderer(), ui = stubs();
 const reports = r.load('components/business-reports.tsx', { ...ui.modules, 'lucide-react': hostModule(), recharts: hostModule(), '@/components/presentation-foundation/rolling-text': { RollingText: ({ text: value }) => value } });
 return { r, reports };
};
const names = { category: key => key, icon: key => key, group: key => key, business: () => 'Household', businessRecord: () => null };
const line = { id: 'a', record: usd, name: 'Lunch', date: '2026-10-05', direction: 'expense', amount: 120000, entered: { amount: 10, currency: 'USD' }, category: 'Living expense', business: null };

test('Reports lists a transaction and the largest one as entered; only sums are converted', () => {
 const { r, reports } = parts();
 r.mount(h(reports.ReportTransactions, { lines: [line], drill: null, label: null, names, onClear() {} }));
 assert.ok(text(r.tree).includes('$10') && !text(r.tree).includes('120,000'), text(r.tree));
 r.mount(h(reports.ReportSummary, { lines: [line], mixed: false, names, currency: 'UZS', fileName: 'x' }));
 const summary = text(r.tree);
 assert.ok(summary.includes('Largest transaction$10') && summary.includes('Total' + formatMoney(120000, 'UZS', 'en-US')), summary);
});

test('a report total with an unconverted amount reads —, in the summary and in the profit and loss table', () => {
 const { r, reports } = parts();
 r.mount(h(reports.ReportSummary, { lines: [line], missing: 1, mixed: true, names, currency: 'UZS', fileName: 'x' }));
 assert.ok(text(r.tree).includes('Total spending—') && text(r.tree).includes('Average transaction—'), text(r.tree));
 const pnl = report.profitAndLoss([line], [], item => item.category, true);
 r.mount(h(reports.ProfitLossTable, { pnl, breakdown: 'category', names, groupOf: key => key, currency: 'UZS', missing: true, onDrill() {} }));
 const cells = r.all(byType('tr')).map(node => text(node));
 assert.ok(cells.find(cell => cell.startsWith('Net cash flow')).endsWith('—'), cells.join(' | '));
 assert.ok(cells.some(cell => cell.endsWith(formatMoney(120000, 'UZS', 'en-US'))), 'a category line keeps its figure');
});

const taxSheet = () => {
 const r = createRenderer(), ui = stubs();
 const { TaxPrepSheet } = r.load('components/tax-prep-sheet.tsx', { ...ui.modules, 'lucide-react': hostModule(), '@/components/business-reports': hostModule(), '@/components/presentation-foundation/rolling-text': { RollingText: ({ text: value }) => value } });
 const props = { lines: [{ ...line, category: 'Other expense' }], businesses: [{ id: 'b', name: 'Bakery' }], business: 'b', onBusiness() {}, year: 2026, years: [2026], onYear() {}, period: 'year', onPeriod() {}, categories: [], settings: { template: 'general', lines: {} }, names, currency: 'UZS' };
 return { r, TaxPrepSheet, props };
};

test('tax prep says when a transaction could not be converted, shows no total and exports no partial sheet', () => {
 const { r, TaxPrepSheet, props } = taxSheet();
 const preview = () => r.find(node => node.props?.className === 'tax-export');
 r.mount(h(TaxPrepSheet, { ...props, missing: 1, onSettings: async () => {} }));
 assert.ok(text(r.tree).includes('Some currencies could not be converted') && text(r.tree).includes('Net profit or loss—'), text(r.tree));
 assert.equal(preview().props.disabled, true);
 r.mount(h(TaxPrepSheet, { ...props, onSettings: async () => {} }));
 assert.equal(preview().props.disabled, false);
 assert.ok(!text(r.tree).includes('Some currencies could not be converted'));
});

test('tax prep takes one change at a time: the sheet is saved whole, so a second would drop the first', async () => {
 const { r, TaxPrepSheet, props } = taxSheet();
 const lines = () => r.find(node => node.props?.['aria-label'] === 'Lines');
 const calls = [];
 let release, fail = false;
 r.mount(h(TaxPrepSheet, { ...props, onSettings: settings => { calls.push(settings); return new Promise((resolve, reject) => { release = fail ? () => reject(Error('Refused.')) : resolve; }); } }));
 assert.notEqual(lines().props.disabled, true);
 r.fire(lines(), 'onChange', { currentTarget: { value: 'schedule_c' } });
 assert.equal(lines().props.disabled, true, 'locked while it saves');
 release(); await new Promise(resolve => setTimeout(resolve)); r.update();
 assert.notEqual(lines().props.disabled, true);
 assert.equal(calls[0].template, 'schedule_c');
 fail = true;
 r.fire(lines(), 'onChange', { currentTarget: { value: 'general' } });
 release(); await new Promise(resolve => setTimeout(resolve)); r.update();
 assert.ok(text(r.tree).includes('Refused.'), 'a refused change says so and unlocks');
 assert.notEqual(lines().props.disabled, true);
 r.mount(h(TaxPrepSheet, { ...props, saving: true, onSettings: async () => {} }));
 assert.equal(lines().props.disabled, true, 'also while the saved settings are read back');
});

test('the Year view reads — for a month with an unconverted transaction, and its note covers every month', () => {
 const r = createRenderer(), ui = stubs();
 const { BudgetYear } = r.load('components/budget/budget-year.tsx', { ...ui.modules, '@/components/presentation-foundation/tone': { signTone: () => undefined } });
 const categories = budget.budgetCategories([], []).filter(item => item.key === 'Charity');
 const history = new Map(budget.monthsBetween('2026-01', '2026-12').map(month => [month, { month, byCategory: new Map(month === '2026-03' ? [['Charity', 5]] : []), missing: month === '2026-02' ? 1 : 0 }]));
 r.mount(h(BudgetYear, { rows: categories, mode: 'category', month: '2026-10', history, amounts: [], schedules: [], currency: 'USD', today: '2026-10-20' }));
 assert.ok(text(r.tree).includes('Some currencies could not be converted'), 'February is not the month shown');
 const total = r.all(byType('tr')).find(node => text(node).startsWith('Total expenses'));
 const cells = total.children.filter(node => node.type === 'td').map(node => text(node));
 assert.equal(cells[1].startsWith('—'), true, cells.join(' | '));
 assert.equal(cells.at(-1), '—', 'the year total adds February');
 assert.equal(cells[2].startsWith('$5'), true, cells.join(' | '));
});

test('Age of Money reads the history it is given, with cash accounts named apart from it', () => {
 const r = createRenderer(), ui = stubs();
 const { AgeOfMoneyTile } = r.load('components/budget/age-of-money-tile.tsx', { ...ui.modules, '@/components/presentation-foundation/stat-tile': { StatTile: ({ value }) => h('b', null, value) } });
 const cash = { ...usd, id: 'cash', kind: 'Cash', frequency: 'Monthly' };
 const pay = { ...usd, id: 'p', kind: 'Salary', amount: 100, date: '2026-09-01', account_id: 'cash' }, spent = { ...usd, id: 's', date: '2026-10-01', account_id: 'cash' };
 r.mount(h(AgeOfMoneyTile, { records: [pay, spent], accounts: [cash], currency: 'USD', today: '2026-10-20' }));
 assert.equal(text(r.tree), '30 days', 'history carries no accounts, so their ids come from the accounts');
 r.mount(h(AgeOfMoneyTile, { records: [pay, spent], accounts: [], currency: 'USD', today: '2026-10-20' }));
 assert.equal(text(r.tree), '—');
});

test('the Recurring bars count each side\'s unconverted amounts instead of a smaller total', () => {
 const bill = { record: { currency: 'XYZ' }, status: 'due', direction: 'expense', amount: 5 }, pay = { record: { currency: 'USD' }, status: 'due', direction: 'income', amount: 7 };
 const summary = recurring.recurringSummary([bill, pay, { ...pay, status: 'paid', recorded: null }], (amount, currency) => currency === 'USD' ? amount : null);
 assert.deepEqual(summary, { income: { done: 0, remaining: 7, missing: 1 }, expense: { done: 0, remaining: 0, missing: 1 }, missing: 2 });
});

test('an unpaid loan month stays in the Recurring list, and leaves it once a payment is recorded in that month', () => {
 const loan = { id: 'loan', name: 'Loan', kind: 'Loan', currency: 'USD', amount: 1000, quantity: 1, cost: 0, rate: 0, date: '2030-01-10', frequency: 'Once', opened_on: '2026-07-10', estimated_monthly_payment: 100, created_at: '2026-07-10T00:00:00Z' };
 const carried = payments => recurring.carriedOverdue([loan], [], '2026-11', '2026-11-20', payments).map(item => [item.date, item.installment]);
 assert.deepEqual(carried([{ record_id: 'loan', date: '2026-08-10' }, { record_id: 'loan', date: '2026-09-02' }]), [['2026-10-10', true]]);
 assert.deepEqual(carried([{ record_id: 'loan', date: '2026-08-10' }, { record_id: 'loan', date: '2026-09-02' }, { record_id: 'loan', date: '2026-10-30' }]), []);
 assert.deepEqual(recurring.carriedOverdue([loan], [], '2026-11', '2026-11-20'), [], 'unknown payments never show as overdue');
});

const charge = (id, date, extra = {}) => ({ id, revision: 1, name: 'Rent', kind: 'Rent expense', currency: 'USD', amount: 500, date, frequency: 'Once', ...extra });

test('a schedule\'s payments are its own by id, whatever their name or currency, and never read as a charge to find', () => {
 const dates = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'];
 assert.equal(detectSubscriptions(dates.map((date, index) => charge(String(index), date)), '2026-10-10').length, 1, 'unlinked charges still repeat');
 const paid = dates.map((date, index) => charge(String(index), date, { occurrence_record_id: 'schedule' }));
 assert.deepEqual(detectSubscriptions(paid, '2026-10-10'), []);
 assert.deepEqual(recurringSuggestions(paid, '2026-10-10'), []);
});

test('the insights read carries what an opened charge needs to be shown, edited and told apart', () => {
 const columns = insightColumns.split(',');
 for (const column of ['revision', 'account_currency', 'account_exchange_rate', 'account_rate_date', 'payment_type', 'payment_principal', 'payment_interest', 'occurrence_record_id']) assert.ok(columns.includes(column), column);
 assert.equal(new Set(columns).size, columns.length);
});

test('subscriptions read their history only while their view is open, and hand on normalised records', () => {
 const reads = [], r = createRenderer();
 const { useSubscriptions } = r.load('hooks/use-subscriptions.ts', { '@/hooks/use-owner-resource': { saveOwnerResource: async () => {}, useOwnerResource: (url, owner, enabled, revision, empty) => { reads.push([url, enabled]); return { data: url.includes('insights') && enabled ? { records: [{ ...usd, amount: '12.5' }] } : empty, initialLoading: false, error: '', retry() {} }; } } });
 let hook;
 const Host = ({ enabled }) => { hook = useSubscriptions('me', false, 0, [], enabled); return null; };
 r.mount(h(Host, { enabled: false }));
 assert.deepEqual(reads, [['/api/planning?scope=insights', false], ['/api/subscriptions', false]]);
 assert.deepEqual(hook.records, []);
 r.mount(h(Host, { enabled: true }));
 assert.deepEqual(reads.slice(-2), [['/api/planning?scope=insights', true], ['/api/subscriptions', true]]);
 assert.equal(hook.records[0].amount, 12.5);
});

test('Recurring reads — on a side with an unconverted amount, and a carried loan month is paid in its own month', () => {
 const r = createRenderer(), ui = stubs(), pays = [];
 const opened = [];
 const { UpcomingPage } = r.load('components/planning/upcoming-page.tsx', { ...ui.modules, 'lucide-react': hostModule(),
  '@/components/presentation-foundation/page-header': { PageHeader: ({ children }) => h('header', null, children) },
  '@/components/presentation-foundation/segmented': hostModule(), '@/components/presentation-foundation/count': hostModule(), '@/components/presentation-foundation/category-icon': hostModule(), '@/components/presentation-foundation/today-button': hostModule(),
  '@/components/display-money': { useDisplayMoney: () => ({ entered: String }) },
  '@/hooks/use-columns-fit': { useColumnsFit: () => null },
  './recurring-lazy': { AccountOperation: ({ operation }) => { opened.push(operation); return null; }, useRecurringDetails: () => ({ open() {}, dialog: null }) },
  './recurring-list': { RecurringList: ({ carried, row }) => h('ul', null, carried.map(item => row(item))) },
  './recurring-rows': { OccurrenceRow: ({ item, onPay }) => { pays.push(() => onPay(item)); return h('li', null, item.key); }, ArchivedFold: () => null, useDueLabel: () => () => '' },
  './delete-schedule-dialog': { useScheduleDeletion: () => ({ open: undefined, dialog: null }) },
  './add-recurring-menu': hostModule(), './recurring-flow-button': hostModule() });
 globalThis.window = { location: { hash: '', pathname: '/upcoming' }, history: { replaceState() {} } };
 const thisMonth = loadTS('lib/deposit-interest.ts').depositMonth(), { shiftMonth } = loadTS('lib/calendar-days.ts');
 const due = shiftMonth(thisMonth, -1) + '-10';
 const loan = { id: 'loan', name: 'Loan', kind: 'Loan', currency: 'XYZ', amount: 1000, quantity: 1, cost: 0, rate: 0, date: '2040-01-10', frequency: 'Once', opened_on: shiftMonth(thisMonth, -3) + '-10', estimated_monthly_payment: 100, created_at: shiftMonth(thisMonth, -3) + '-10T00:00:00Z' };
 const bill = { ...usd, id: 'bill', currency: 'XYZ', frequency: 'Monthly', date: thisMonth + '-20', kind: 'Rent expense' };
 r.mount(h(UpcomingPage, { data: { records: [loan, bill], categories: [], goals: [], occurrences: [], activity: [], debtPayments: [{ record_id: 'loan', date: shiftMonth(thisMonth, -2) + '-11' }] }, save: async () => {}, currency: 'USD', rates: { USD: 1 }, view: 'list', onView() {} }));
 const shown = text(r.tree);
 assert.ok(shown.includes('Exchange rate unavailable.'), shown);
 assert.ok(shown.includes('— paid · — remaining'), shown);
 assert.ok(shown.includes('Left after bills—'), 'what is left is unknown too, never a smaller figure');
 const carried = pays.at(-1);
 carried();
 r.update();
 assert.equal(opened.at(-1).action, 'repayment');
 assert.equal(opened.at(-1).date, due);
 delete globalThis.window;
});
