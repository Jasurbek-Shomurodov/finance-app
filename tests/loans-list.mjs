import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, stubs, text } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';
import { chartPart, chartParts, recharts } from './helpers/recharts-stub.mjs';

const h = React.createElement;
const { formatMoney } = loadTS('lib/format.ts');
const usd = amount => formatMoney(amount, 'USD', 'en-US');
const base = { quantity: 1, cost: 0, rate: 0, frequency: 'Once', notes: '', date: '' };
// The flat is stored in UZS and shown in USD; the rest are USD.
const flat = { ...base, id: 'flat', name: 'Flat', kind: 'Mortgage', currency: 'UZS', amount: 120000000, rate: 12, date: '2030-01-01', opened_on: '2025-03-10', estimated_monthly_payment: 2400000 };
const card = { ...base, id: 'card', name: 'Card', kind: 'Debt', currency: 'USD', amount: 2300, rate: 21.9, date: '2026-11-20', opened_on: '2026-02-01' };
const ali = { ...base, id: 'ali', name: 'Ali', kind: 'Money lent', currency: 'USD', amount: 700, lent_date: '2026-02-05', borrower_group: 'Family' };
const vali = { ...base, id: 'vali', name: 'Vali', kind: 'Money lent', currency: 'USD', amount: 300, lent_date: '2026-03-01', borrower_group: 'family ', date: '2026-10-01' };
const stored = new Map([flat, card, ali, vali].map(record => [record.id, record]));
const shownFlat = { ...flat, currency: 'USD', amount: 10000, estimated_monthly_payment: 200 };
const event = (record_id, balance) => ({ id: record_id, record_id, occurred_on: '2025-01-01', created_at: '2025-01-01', event_type: 'baseline', amount: 0, balance, ownership_percentage: 100, principal: 0, interest: 0, notes: '' });

function list(overrides = {}, events = []) {
 const r = createRenderer(), ui = stubs(), calls = [];
 const call = name => record => calls.push([name, record.id]);
 const workspace = {
  filters: { order: 'newest' }, setFilters() {}, filtersActive: false, visible: [shownFlat, card, ali, vali], totalRecords: 4, tableLoading: false, planning: { error: '', data: {} }, demo: false, currency: 'USD',
  money: (amount, currency) => formatMoney(amount, currency, 'en-US'), storedRecord: record => stored.get(record.id), refreshRecords() {}, addRecord() {},
  editRecord: call('edit'), requestDelete: call('delete'), setTracking: call('tracker'), setPayingMortgage: call('mortgage'), setDebtPayment: call('debt'), ...overrides,
 };
 const modules = {
  ...ui.modules,
  '@/components/workspace/workspace-provider': { useWorkspace: () => workspace },
  '@/components/display-money': { useDisplayMoney: () => ({ showSum: amounts => usd(amounts.reduce((sum, row) => sum + row.amount, 0)), entered: (amount, currency) => formatMoney(amount, currency, 'en-US') }) },
  '@/components/record-filters': { RecordFilters: () => null, emptyRecordFilters: {} },
  '@/components/presentation-foundation/rolling-text': { RollingText: ({ text: value }) => value },
  '@/components/presentation-foundation/record-icon': { RecordIcon: () => null },
  '@/components/presentation-foundation/row-menu': { RowMenu: ({ items }) => h('menu', null, items.filter(Boolean).map(item => h('button', { key: item.label, 'data-menu': item.label, onClick: item.onSelect }, item.label))) },
  '@/components/presentation-foundation/inline-error': { InlineError: ({ message, onRetry }) => h('p', { role: 'alert', 'data-retry': !!onRetry }, message) },
  '@/components/presentation-foundation/empty-state': { EmptyState: ({ title }) => h('p', { className: 'empty' }, title) },
  '@/components/presentation-foundation/segmented': { Segmented: ({ options, onChange }) => h('nav', null, options.map(option => h('button', { key: option.value, 'data-group': option.value, onClick: () => onChange(option.value) }, option.label))) },
  '@/hooks/use-columns-fit': { useColumnsFit: () => null },
  '@/lib/deposit-interest': { depositToday: () => '2026-11-14' },
 };
 modules['@/components/loans/loan-row'] = r.load('components/loans/loan-row.tsx', modules);
 const { LoansList } = r.load('components/loans/loans-list.tsx', modules);
 r.mount(h(LoansList, { events }));
 return { r, calls, html: () => r.html(), words: () => text(r.tree) };
}
const order = (words, ...labels) => labels.map(label => words.indexOf(label));
const ascending = positions => positions.every((at, index) => at >= 0 && (!index || at > positions[index - 1]));

test('grouped by type, what you owe and what you are owed are two groups with their totals; a borrower group keeps its own heading', () => {
 const { r, words: read } = list();
 // Month sections open first (the owner's choice of 1 November 2026); Type is one press away.
 r.find(element => element.props?.['data-group'] === 'side').props.onClick();
 r.update();
 const words = read();
 assert.ok(ascending(order(words, 'You owe', 'Flat', 'Card', 'Owed to you', 'Family', 'Ali', 'Vali')), words);
 assert.ok(words.includes(`You owe2${usd(12300)}`), words);
 assert.ok(words.includes(`Owed to you2${usd(1000)}`), words);
 assert.ok(words.includes(`Family2${usd(1000)}`), words);
 // One icon tile and the kind in the facts line: no category column, and sentence-case headings.
 assert.ok(words.includes('Paid off') && words.includes('Balance') && !words.includes('Category'), words);
 assert.ok(words.includes('Mortgage · 12% · Due: 1 January 2030'), words);
 assert.ok(words.includes('Money lent · Lent: 5 February 2026 · No due date'), words);
});

test('a row keeps its balance in the display currency and its monthly payment as entered', () => {
 const words = list().words();
 assert.ok(words.includes(usd(10000)) && words.includes(`${formatMoney(2400000, 'UZS', 'en-US')} per month`), words);
 assert.ok(!words.includes(`${usd(200)} per month`), words);
});

test('a due date within two weeks is marked with the days left, and a past one as overdue', () => {
 const { html, words } = list();
 assert.match(html(), /<span class="caution">Due: 20 November 2026 · in 6 days<\/span>/);
 assert.match(html(), /<span class="negative">Overdue · Due: 1 October 2026<\/span>/);
 assert.ok(!words().includes('1 January 2030 · in'), 'a far due date carries no countdown');
});

test('a paid-off bar appears only for a record with a recorded starting balance, in the record\'s own currency', () => {
 const none = list();
 assert.doesNotMatch(none.html(), /progress-track/);
 const { html, words } = list({}, [event('flat', 160000000), event('ali', 1000)]);
 assert.equal(html().match(/progress-track/g).length, 2);
 assert.match(html(), /data-tone="debt" role="img" aria-label="Paid off: 25%"><span style="width:25%">/);
 assert.ok(words().includes(`${formatMoney(40000000, 'UZS', 'en-US')} · 25% of ${formatMoney(160000000, 'UZS', 'en-US')}`), words());
 assert.ok(words().includes('30% repaid'), words());
});

test('Record payment is the row\'s one button and the rest sits in the menu; the sample workspace blocks loan payments', () => {
 const { r, calls } = list();
 const pay = r.all(element => element.props?.className === 'loan-row-pay');
 assert.deepEqual(pay.map(button => button.props['aria-label']), ['Record payment: Flat', 'Record payment: Card'], 'money lent has no payment button');
 pay[0].props.onClick(); pay[1].props.onClick();
 r.find(element => element.props?.['data-menu'] === 'Tracker').props.onClick();
 r.all(element => element.props?.['data-menu'] === 'Delete')[1].props.onClick();
 assert.deepEqual(calls, [['mortgage', 'flat'], ['debt', 'card'], ['tracker', 'flat'], ['delete', 'card']]);
 const sample = list({ demo: true });
 const blocked = sample.r.all(element => element.props?.className === 'loan-row-pay');
 blocked[0].props.onClick(); blocked[1].props.onClick();
 assert.deepEqual(sample.calls, [['mortgage', 'flat']]);
 assert.equal(blocked[1].props['aria-disabled'], true);
 assert.ok(!sample.words().includes('Tracker'));
});

test('grouped by month, each month nets what is lent against what is owed, newest list order kept', () => {
 const { r, words } = list();
 r.find(element => element.props?.['data-group'] === 'month').props.onClick();
 r.update();
 const shown = words();
 assert.ok(ascending(order(shown, 'March 2025', 'Flat', 'February 2026', 'Card', 'Ali', 'March 2026', 'Vali')), shown);
 assert.ok(shown.includes(`February 20262${usd(700 - 2300)}`), shown);
 assert.ok(!shown.includes('You owe'), shown);
});

test('a failed planning read offers a retry instead of a fresh start', () => {
 const failed = list({ visible: [], planning: { error: 'Could not load planning data.', data: {} } }).html();
 assert.match(failed, /role="alert" data-retry="true"/);
 assert.doesNotMatch(failed, /class="empty"/);
 assert.match(list({ visible: [] }).html(), /class="empty"/);
});

// The chart library is stubbed (helpers/recharts-stub.mjs): a test reads what each chart part was given.
const debtPlan = loadTS('lib/debt-plan.ts');

function charts(r) {
 return r.load('components/loans/payoff-charts.tsx', { recharts, ...stubs().modules });
}

test('the owed donut names each debt\'s share in its label and tooltip, one slice per debt', () => {
 const r = createRenderer();
 const { OwedDonut } = charts(r);
 r.mount(h(OwedDonut, { currency: 'USD', slices: [{ id: 'a', name: 'Card', amount: 750, color: 'red' }, { id: 'b', name: 'Car', amount: 250, color: 'blue' }] }));
 assert.match(r.html(), /role="img" aria-label="What you owe: Card 75%, Car 25%"/);
 assert.deepEqual(chartParts(r, 'Cell').map(cell => cell.props.fill), ['red', 'blue']);
 assert.deepEqual(chartPart(r, 'Tooltip').props.formatter(750, 'Card'), [`${usd(750)} · 75%`, 'Card']);
 r.mount(h(OwedDonut, { currency: 'USD', slices: [] }));
 assert.match(r.html(), /aria-label="What you owe: "/, 'nothing owed divides nothing');
});

test('the payoff chart draws the plan against minimums only; the compact card hides its axes', () => {
 const r = createRenderer();
 const { PayoffChart } = charts(r);
 const points = [{ month: '2026-11', plan: 1200, minimums: 1200 }, { month: '2026-12', plan: 600, minimums: 1100 }, { month: '2027-01', plan: 0, minimums: null }];
 r.mount(h(PayoffChart, { points, currency: 'USD' }));
 const box = () => r.find(element => element.props?.className === 'payoff-chart').props;
 assert.deepEqual([box().style.height, box().role, box()['aria-label'], box()['data-compact']], [260, 'img', 'Balance owed', undefined]);
 const axis = chartPart(r, 'YAxis').props;
 assert.equal(axis.hide, false);
 assert.equal(axis.domain[0], 0);
 assert.ok(axis.domain[1] >= 1200 && axis.ticks.every(tick => tick >= 0), axis.ticks);
 assert.equal(chartPart(r, 'XAxis').props.tickFormatter('2026-12'), 'December 2026');
 const tooltip = chartPart(r, 'Tooltip').props;
 assert.deepEqual(tooltip.formatter(600, 'plan'), [usd(600), 'Your plan']);
 assert.deepEqual(tooltip.formatter(1100, 'minimums'), [usd(1100), 'Minimums only']);
 r.mount(h(PayoffChart, { points, currency: 'USD', compact: true }));
 assert.deepEqual([box().style.height, box()['data-compact']], [110, true]);
 assert.equal(chartPart(r, 'XAxis').props.hide, true);
});

function side() {
 const r = createRenderer(), ui = stubs();
 const payoff = charts(r);
 const modules = { ...ui.modules, recharts, '@/components/loans/loans-lazy': { OwedDonut: payoff.OwedDonut, PayoffChartCompact: payoff.PayoffChart },
  '@/components/display-money': { useDisplayMoney: () => ({ currency: 'USD', convert: (amount, currency) => currency === 'USD' ? amount : currency === 'UZS' ? amount / 12000 : null,
   show: (amount, currency) => formatMoney(amount, currency, 'en-US') + ' shown', sum: amounts => amounts.reduce((sum, row) => sum + (row.currency === 'UZS' ? row.amount / 12000 : row.amount), 0) }) } };
 return { r, ...r.load('components/loans/loans-side.tsx', modules) };
}

test('what you owe: a slice per convertible debt, this month\'s interest in the display currency and each rate beside its balance', () => {
 const { r, OwedBreakdown } = side();
 const euro = { ...card, id: 'euro', name: 'Euro loan', currency: 'EUR', amount: 100, rate: 0 };
 r.mount(h(OwedBreakdown, { debts: [flat, card, euro] }));
 const words = text(r.tree);
 // 120M UZS at 12% is 100 USD a month, the card's 2,300 at 21.9% is 41.98; the payments are the flat's 2.4M UZS.
 assert.ok(words.includes(`Interest this month${usd(100 + 2300 * 21.9 / 1200)}of ${usd(200)} in payments`), words);
 assert.deepEqual(chartPart(r, 'Pie').props.data.map(slice => [slice.name, slice.amount]), [['Flat', 10000], ['Card', 2300]], 'a debt no rate converts has no slice');
 assert.ok(words.includes(`Card21.9%${usd(2300)} shown`) && words.includes(`Euro loan${formatMoney(100, 'EUR', 'en-US')} shown`), words);
});

test('the payoff plan card shows the extra payment, the interest it saves and opens the planner', () => {
 const { r, PayoffPlanCard } = side();
 const plan = { currency: 'USD', extra: 200, method: 'avalanche', payments: { card: 100 } };
 const worked = debtPlan.payoffPlan([card], plan);
 let opened = 0;
 r.mount(h(PayoffPlanCard, { plan, worked, today: '2026-11-14', onOpen: () => opened++ }));
 const words = text(r.tree);
 assert.ok(words.includes('Payoff plan') && words.includes('Highest interest first'), words);
 assert.ok(words.includes(`Extra monthly payment${usd(200)}`), words);
 assert.ok(words.includes(`Interest saved by extra payments${usd(worked.minimums.interest - worked.result.interest)}`), words);
 assert.ok(words.startsWith('Payoff planHighest interest firstNovember 2026'), words);
 assert.equal(r.all(element => element.type === 'dd')[1].props.className, 'positive');
 assert.deepEqual(chartPart(r, 'ComposedChart').props.data, debtPlan.payoffSeries('2026-11-14', worked.result, worked.minimums), 'the extra is drawn against minimums only');
 r.fire(r.find(element => element.type?.displayName === 'Button'), 'onClick');
 assert.equal(opened, 1);
 r.mount(h(PayoffPlanCard, { plan, worked: { ...worked, debts: [] }, today: '2026-11-14', onOpen() {} }));
 assert.equal(r.html(), '', 'no debt in the plan\'s currency, no card');
});

function overview({ demo = false, records = [card], preferences = [], loading = false } = {}) {
 const r = createRenderer(), seen = {};
 const keep = name => props => { seen[name] = props; return h('i', { 'data-part': name }); };
 const workspace = { user: { id: 'me' }, demo, rows: ['row'], current: ['current'], currency: 'USD', reload: 3,
  planning: { loading, error: '', data: { records } }, workspacePreferences: { loading: false, data: { preferences } } };
 const { LoansOverview } = r.load('components/loans/loans-overview.tsx', {
  '@/components/workspace/workspace-provider': { useWorkspace: () => workspace },
  '@/components/debt-summary': { DebtSummary: keep('summary') }, '@/components/loans/loans-list': { LoansList: keep('list') },
  '@/components/loans/loans-side': { OwedBreakdown: keep('owed'), PayoffPlanCard: keep('plan') },
  '@/components/presentation-foundation/screen-skeletons': { PayoffPlanCardSkeleton: keep('planSkeleton') },
  '@/components/language-provider': { useLanguage: () => ({ t: text => text, locale: 'en-US' }) },
  '@/hooks/use-portfolio-history': { usePortfolioHistory: (user, isDemo, reload) => ({ history: { events: [{ saved: [user.id, isDemo, reload] }] } }) },
  '@/lib/demo-finance': { demoHistory: (rows, today) => ({ events: [{ sample: [rows, today] }] }) },
  '@/lib/deposit-interest': { depositToday: () => '2026-11-14' },
 });
 let planner = 0;
 r.mount(h(LoansOverview, { onOpenPlanner: () => planner++ }));
 return { r, seen, opened: () => planner };
}

test('the loans overview reads the saved history, or the sample one, and plans with the saved plan in this currency', () => {
 const plan = { currency: 'USD', extra: 150, method: 'snowball', payments: {} };
 const { seen, opened } = overview({ preferences: [{ key: 'debt_plan', data: plan }] });
 assert.deepEqual(seen.list.events, [{ saved: ['me', false, 3] }]);
 assert.deepEqual(seen.owed.debts, [card]);
 assert.equal(seen.plan.plan, plan);
 const worked = debtPlan.payoffPlan([card], plan);
 assert.equal(seen.summary.debtFree.ready, true);
 assert.equal(seen.summary.debtFree.day, debtPlan.payoffDay('2026-11-14', worked.result.months));
 assert.equal(seen.summary.debtFree.minimumsDay, debtPlan.payoffDay('2026-11-14', worked.minimums.months));
 seen.summary.debtFree.onOpen(); seen.plan.onOpen();
 assert.equal(opened(), 2);
 assert.deepEqual(overview({ demo: true }).seen.list.events, [{ sample: [['row'], '2026-11-14'] }]);
 // A plan saved for another currency is replaced by an empty one in this currency.
 assert.equal(overview({ preferences: [{ key: 'debt_plan', data: { ...plan, currency: 'EUR' } }] }).seen.plan.plan.extra, 0);
});

test('the loans overview leaves out the side panel without debts, and holds the plan card\'s place while planning loads', () => {
 const none = overview({ records: [ali] });
 assert.ok(!none.seen.owed && !none.seen.plan && !none.seen.planSkeleton);
 assert.equal(none.seen.summary.debtFree.ready, false);
 assert.doesNotMatch(none.r.html(), /loans-side/);
 const loading = overview({ loading: true });
 assert.ok(loading.seen.owed && !loading.seen.plan);
 assert.deepEqual(loading.seen.planSkeleton, { label: 'Loading records…' }, 'its shimmer stands where the plan will, so it never drops in');
 assert.ok(!overview().seen.planSkeleton, 'gone once the plan is drawn');
});
