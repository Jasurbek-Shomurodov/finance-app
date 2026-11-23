import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, stubs, text } from './helpers/component-tree.mjs';

const h = React.createElement;
const { formatMoney, formatDate, formatMonthYear, formatCompactMoney, formatSignedMoney } = loadTS('lib/format.ts');
const { depositToday, depositInterest, depositProjection } = loadTS('lib/deposit-interest.ts');
const r = createRenderer();
// Each view renders its component from scratch; the view is the renderer, holding that tree.
const mount = (Component, props) => (r.mount(React.createElement(Component, props)), r);
const ui = stubs();
const named = (name, render) => Object.assign(render, { displayName: name });
const pass = name => named(name, ({ children }) => h('div', { 'data-part': name }, children));
const chart = Object.fromEntries(['ResponsiveContainer', 'LineChart', 'CartesianGrid', 'XAxis', 'YAxis', 'Tooltip', 'Legend'].map(name => [name, pass(name)]));
const Line = named('Line', ({ dataKey, name }) => h('span', { 'data-line': dataKey }, name));
const ConfirmDialog = named('ConfirmDialog', ({ open, title, description, confirmLabel }) => open ? h('div', { role: 'dialog' }, h('h3', null, title), h('p', null, description), h('button', null, confirmLabel)) : null);
const InlineError = named('InlineError', ({ message }) => h('p', { className: 'inline-error' }, message));
const LoadingPlaceholder = named('LoadingPlaceholder', ({ label }) => h('p', { className: 'loading' }, label));
const ChartSkeleton = named('ChartSkeleton', ({ height }) => h('div', { className: 'chart-skeleton', 'data-height': height }));
const ToggleGroup = named('ToggleGroup', ({ children, value }) => h('div', { 'data-toggle': value }, children));
const ToggleGroupItem = named('ToggleGroupItem', ({ children, value }) => h('button', { value }, children));
const AssetMovementDialog = named('AssetMovementDialog', ({ initial }) => h('div', { className: 'movement' }, JSON.stringify(initial)));
const fx = { rates: {}, retries: 0 };
const api = { calls: [], handler: async () => ({}) };
const feedback = { saved: 0 };
const { InvestmentTracker } = r.load('components/investment-tracker.tsx', {
 ...ui.modules,
 recharts: { ...chart, Line },
 '@/lib/feedback': { showSaved: () => feedback.saved++ },
 '@/lib/api-client': { requestJson: (url, options) => { api.calls.push({ url, ...options }); return api.handler(url, options); } },
 '@/components/discard-changes': { useDraftDialog: (value, onClose, busy) => ({ close: () => { if (!busy) onClose(); }, confirmation: h('i', { 'data-guard': '' }) }) },
 '@/hooks/use-dated-exchange-rate': { useDatedExchangeRate: (from, to) => ({ rate: !from || !to ? null : from === to ? 1 : fx.rates[from + to] ?? null, retry() { fx.retries++; } }) },
 '@/components/presentation-foundation/loading-placeholder': { LoadingPlaceholder, ChartSkeleton },
 '@/components/presentation-foundation/confirm-dialog': { ConfirmDialog },
 '@/components/presentation-foundation/inline-error': { InlineError },
 '@/components/ui/toggle-group': { ToggleGroup, ToggleGroupItem },
 '@/components/planning/asset-movement-dialog': { AssetMovementDialog },
});

const money = (value, currency = 'USD') => formatMoney(value, currency, 'en-US');
const event = (id, event_type, occurred_on, extra = {}) => ({ id, record_id: 'r', event_type, occurred_on, amount: 0, balance: null, ownership_percentage: 100, principal: 0, interest: 0, notes: '', created_at: occurred_on + 'T00:00:00Z', account_link: null, ...extra });
const wallet = { id: 'cash', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 1000 };
const euro = { id: 'eur', name: 'Euro cash', kind: 'Cash', currency: 'EUR', amount: 1000 };
const broker = { id: 'brk', name: 'Brokerage', kind: 'Stock', currency: 'USD', amount: 500 };
const record = (kind, extra = {}) => ({ id: 'r', name: kind + ' asset', kind, currency: 'USD', amount: 0, rate: 0, ...extra });

let requests = [];
function serve(response) {
 requests = [];
 globalThis.fetch = (url, init) => { requests.push({ url, signal: init.signal }); return typeof response === 'function' ? response(url, init) : Promise.resolve({ ok: true, json: async () => response }); };
}

async function open(entry, events = [], props = {}) {
 serve(events);
 const calls = { closed: 0, saved: 0, payments: 0, draft: [] };
 const view = mount(InvestmentTracker, { record: entry, accounts: [wallet, euro, broker], onClose: () => calls.closed++, onSaved: () => calls.saved++, onPayment: () => calls.payments++, onDraftState: (dirty, busy) => calls.draft.push([dirty, busy]), ...props });
 await view.flush();
 const selects = () => view.all(element => element.type === ui.NativeSelect);
 const accountSelect = () => selects().find(element => element.props.required);
 const typeSelect = () => selects().find(element => !element.props.required);
 const setType = type => { typeSelect().props.onChange({ target: { value: type } }); view.update(); };
 const setAccount = id => { accountSelect().props.onChange({ target: { value: id } }); view.update(); };
 const inputs = () => view.all(element => element.type === ui.FormattedNumberInput);
 const label = prefix => view.find(element => element.type === 'label' && text(element).startsWith(prefix));
 const setNumber = (prefix, value, blank = false) => { label(prefix).props.children.find(child => child?.type === ui.FormattedNumberInput).props.onValueChange(value, blank); view.update(); };
 const saveButton = () => view.find(byType(ui.FormFooter)).props.children;
 const save = async () => { await saveButton().props.onClick(); view.update(); };
 const button = name => view.find(byType(ui.Button, name));
 const tabs = () => view.find(element => element.props?.className === 'tracker-tabs');
 const showTab = tab => { tabs().props.onChange(tab); view.update(); };
 return { tabs, showTab, view, calls, selects, accountSelect, typeSelect, setType, setAccount, inputs, label, setNumber, saveButton, save, button };
}

test('the tracker loads the record history and shows a loading placeholder until it arrives', async () => {
 let resolve;
 serve(() => new Promise(done => { resolve = done; }));
 const view = mount(InvestmentTracker, { record: record('Cash'), onClose() {}, onSaved() {}, onPayment() {} });
 assert.equal(requests[0].url, '/api/investment-history?record=r');
 const showTab = tab => { view.find(element => element.props?.className === 'tracker-tabs').props.onChange(tab); view.update(); };
 // The Overview loads in its own shape: the kind's tiles (a cash account has one), then the chart and its legend.
 assert.match(view.html(), /<div role="status" aria-busy="true" class="tracker-overview"><span class="sr-only">Loading history…<\/span><div class="stat-tiles" data-columns="auto" aria-hidden="true"><article class="stat-tile">.*?<\/article><\/div><div class="tracker-chart" aria-hidden="true"><div class="chart-skeleton" data-height="220"><\/div>/);
 assert.equal(view.html().match(/<article class="stat-tile">/g).length, 1);
 assert.match(view.html(), /Transfer money/, 'the record\'s actions do not wait for the history');
 // The form is its own loading shape: every field in place, none editable yet.
 showTab('update');
 assert.equal(view.find(byType('fieldset')).props.disabled, true);
 assert.match(view.html(), /Account balance: —/);
 showTab('history');
 assert.match(view.html(), /<p class="loading">Loading history…<\/p>/);
 showTab('overview');
 resolve({ ok: true, json: async () => [] });
 await view.flush();
 const html = view.html();
 assert.doesNotMatch(html, /Loading history/);
 assert.match(html, /<h3>Account balance<\/h3><strong>—<\/strong>/);
 assert.doesNotMatch(html, /tracker-chart/, 'no dated value, no chart');
 showTab('update');
 assert.equal(view.find(byType('fieldset')).props.disabled, false);
 assert.match(view.html(), /Account balance after update/);
 showTab('history');
 assert.match(view.html(), /<p>No history yet.<\/p>/);
});

test('a failed history request shows its error, and responses after closing are ignored', async () => {
 serve(() => Promise.resolve({ ok: false, json: async () => ({ error: 'History unavailable' }) }));
 const view = mount(InvestmentTracker, { record: record('Property'), onClose() {}, onSaved() {}, onPayment() {} });
 await view.flush();
 assert.match(view.html(), /role="alert">History unavailable</);
 assert.doesNotMatch(view.html(), /Loading history/);

 for (const outcome of ['resolve', 'reject']) {
  let settle;
  serve(() => new Promise((done, fail) => { settle = outcome === 'resolve' ? done : fail; }));
  const closed = mount(InvestmentTracker, { record: record('Property'), onClose() {}, onSaved() {}, onPayment() {} });
  closed.unmount();
  assert.equal(requests[0].signal.aborted, true);
  settle(outcome === 'resolve' ? { ok: true, json: async () => [event('late', 'valuation', '2026-01-01', { balance: 5 })] } : Error('aborted'));
  await closed.flush();
  assert.match(closed.html(), /Loading history…/);
  assert.doesNotMatch(closed.html(), /role="alert"/);
 }
});

test('a cash balance update needs an entered value, saves it, reloads history and offers transfers', async () => {
 const { tabs, showTab, view, calls, saveButton, save, setNumber, button } = await open(record('Cash', { amount: 800 }), [event('b', 'baseline', '2026-09-01', { balance: 800 })]);
 let html = view.html();
 assert.match(html, /<h2>Cash asset · Tracker<i data-hint="Track your cash balance and transfers between accounts."><\/i><\/h2>/);
 assert.match(html, /Track your cash balance and transfers between accounts./);
 assert.ok(html.includes(`<h3>Account balance</h3><strong>${money(800)}</strong>`));
 assert.doesNotMatch(html, /Income received|Expense paid|Value change|Total return|data-line="contributions"/);
 assert.doesNotMatch(html, /Use Balance update to confirm a cash balance/, 'the form\'s guidance belongs to its own tab');
 showTab('update');
 html = view.html();
 assert.match(html, /Account balance after update/);
 assert.match(html, /<i data-hint="Track your cash balance and transfers between accounts\.Use Balance update to confirm a cash balance, or Transfer money to move funds between accounts\.Past valuations do not replace a newer balance\."><\/i>/, 'the guidance sits behind the title\'s ⓘ');
 assert.doesNotMatch(html, /tracker-help/, 'and not as paragraphs under the fields');
 assert.ok(html.includes(`<small class="muted" aria-live="polite">Account balance: ${money(800)}</small><small class="muted">Enter 0 only when the asset is worth nothing.</small>`), 'the current balance is in view while the new one is typed');
 assert.equal(view.all(element => element.type === ui.NativeSelect && element.props.required).length, 0);
 showTab('history');
 assert.match(view.html(), /History shows confirmed balances and account movements./);
 assert.doesNotMatch(view.html(), /Delete newer balance updates first/);
 showTab('update');
 assert.equal(saveButton().props.disabled, true);
 await save();
 assert.equal(api.calls.length, 0);
 setNumber('Account balance after update', 950);
 assert.equal(saveButton().props.disabled, false);
 assert.deepEqual(calls.draft.at(-1), [true, false]);
 api.calls = []; feedback.saved = 0;
 api.handler = async () => ({});
 serve([event('b', 'baseline', '2026-09-01', { balance: 800 }), event('v', 'valuation', depositToday(), { balance: 950 })]);
 await save();
 assert.equal(api.calls[0].url, '/api/investment-history');
 assert.deepEqual({ ...api.calls[0].body, id: undefined }, { id: undefined, record_id: 'r', type: 'valuation', date: depositToday(), amount: 0, balance: 950, notes: '' });
 assert.equal(feedback.saved, 1);
 assert.equal(calls.saved, 1);
 assert.equal(calls.closed, 0);
 assert.equal(tabs().props.value, 'overview', 'a saved update returns to the figures');
 assert.match(view.html(), /Loading history…/);
 await view.flush();
 html = view.html();
 assert.equal(requests.length, 1);
 assert.ok(html.includes(`<h3>Account balance</h3><strong>${money(950)}</strong>`));
 showTab('update');
 assert.equal(saveButton().props.disabled, true);
 assert.ok(view.html().includes(`Account balance: ${money(950)}`));
 showTab('overview');
 button('Transfer money').props.onClick();
 view.update();
 const movement = view.find(byType(AssetMovementDialog));
 assert.deepEqual(movement.props.initial, { kind: 'transfer', source_id: 'r' });
 assert.deepEqual(movement.props.records.map(entry => entry.id), ['cash', 'eur', 'brk', 'r']);
 movement.props.onClose();
 view.update();
 assert.equal(view.all(element => element.type === AssetMovementDialog).length, 0);
});

test('a property contribution from a foreign-currency account converts the cash leg and can keep or replace the value', async () => {
 fx.rates = { EURUSD: 1.25 }; fx.retries = 0;
 const { tabs, showTab, view, setType, setAccount, setNumber, saveButton, save, typeSelect } = await open(record('Property', { amount: 90000 }), [event('b', 'baseline', '2026-01-01', { balance: 90000 })]);
 showTab('update');
 assert.ok(view.html().includes(`Current value: ${money(90000)}`));
 assert.deepEqual(typeSelect().props.children.map(text), ['Value update', 'Money invested', 'Sale / withdrawal']);
 assert.match(view.html(), /Full asset value after update/);
 setType('contribution');
 let html = view.html();
 assert.match(html, /data-toggle="keep"/);
 assert.match(html, /The asset value stays unchanged. Only the cash movement is recorded./);
 assert.doesNotMatch(html, /Full asset value after update/);
 assert.match(html, /Cash amount \(your share\) · USD/);
 assert.match(html, /Use Value update for a valuation. Record invested money/);
 assert.match(html, /Past valuations do not replace a newer balance\."/);
 setAccount('eur');
 setNumber('Cash amount', 500);
 html = view.html();
 assert.match(html, /class="fx">rate 1.25</);
 assert.ok(html.includes(`Available for this payment: ${money(1250)}`));
 assert.ok(html.includes(`Cash deducted from Euro cash: ${money(400, 'EUR')}`));
 assert.ok(html.includes(`Cash balance after update: ${money(600, 'EUR')}`));
 assert.equal(saveButton().props.disabled, false);

 const toggle = () => view.find(byType(ToggleGroup));
 toggle().props.onValueChange('');
 toggle().props.onValueChange('keep');
 view.update();
 assert.equal(toggle().props.value, 'keep');
 toggle().props.onValueChange('change');
 view.update();
 assert.equal(toggle().props.value, 'change');
 assert.match(view.html(), /Full asset value after update/);
 assert.equal(saveButton().props.disabled, true);
 setNumber('Full asset value after update', 91000);
 assert.equal(saveButton().props.disabled, false);
 toggle().props.onValueChange('change');
 toggle().props.onValueChange('keep');
 view.update();
 assert.equal(toggle().props.value, 'keep');
 toggle().props.onValueChange('change');
 view.update();
 setNumber('Full asset value after update', 91000);

 api.calls = [];
 api.handler = async () => { throw Object.assign(Error('Rate changed'), { confirmedFailure: true }); };
 await save();
 assert.equal(api.calls[0].url, '/api/investment-history/exchange');
 assert.equal(api.calls[0].body.exchange_rate, 1.25);
 assert.equal(api.calls[0].body.balance, 91000);
 assert.equal(fx.retries, 1);
 assert.match(view.html(), /role="alert">Rate changed</);
 assert.equal(text(saveButton()), 'Save update');

 api.handler = async () => { throw Error('Connection reset'); };
 await save();
 assert.equal(text(saveButton()), 'Retry update');
 assert.match(view.html(), /<p class="muted tracker-help">Retry with the same details to avoid duplicates.<\/p>/);
 assert.equal(tabs().props.value, 'update', 'a failed save stays on the form');
 assert.equal(view.find(byType('fieldset')).props.disabled, true);
 assert.equal(fx.retries, 1);
 api.handler = async () => ({});
 serve([]);
 await save();
 assert.equal(api.calls[2].body.id, api.calls[1].body.id);
 assert.equal(api.calls[2].body.exchange_rate, 1.25);
 assert.equal(tabs().props.value, 'overview');
 showTab('update');
 assert.doesNotMatch(view.html(), /Retry with the same details/);
});

test('the cash amount can be typed in the cash account currency and is saved converted to the record currency', async () => {
 fx.rates = { EURUSD: 1.25 };
 const { showTab, view, setType, setAccount, setNumber, saveButton, save } = await open(record('Property', { amount: 90000 }), [event('b', 'baseline', '2026-01-01', { balance: 90000 })]);
 showTab('update');
 setType('contribution');
 const amount = () => view.find(element => element.props?.onCurrencyChange);
 assert.equal(amount().props.currencyLocked, true, 'one currency needs no picker');
 setAccount('eur');
 assert.equal(amount().props.currencyLocked, false);
 assert.deepEqual(amount().props.currencies, ['USD', 'EUR']);
 assert.equal(amount().props.currency, 'USD');
 amount().props.onCurrencyChange('EUR');
 view.update();
 setNumber('Cash amount', 400);
 const html = view.html();
 assert.ok(html.includes(`Available for this payment: ${money(1000, 'EUR')}`));
 assert.ok(html.includes(`Cash deducted from Euro cash: ${money(400, 'EUR')}`));
 assert.ok(html.includes(`Cash balance after update: ${money(600, 'EUR')}`));
 assert.equal(saveButton().props.disabled, false);
 api.calls = []; api.handler = async () => ({}); serve([]);
 await save();
 assert.equal(api.calls[0].url, '/api/investment-history/exchange');
 assert.equal(api.calls[0].body.amount, 500);
 assert.equal(api.calls[0].body.exchange_rate, 1.25);
 assert.equal('amount_currency' in api.calls[0].body, false);
});

test('an outgoing payment larger than the cash balance is refused, and changing the type resets the cash leg', async () => {
 const { tabs, view, setType, setAccount, setNumber, saveButton } = await open(record('Stock', { amount: 1000 }), [], { initialType: 'expense' });
 assert.equal(tabs().props.value, 'update', 'an update type chosen by the caller opens its form');
 assert.match(view.html(), /Use Value update for a valuation, Buy or Sell \/ convert for trades/);
 setAccount('cash');
 setNumber('Cash amount', 1500);
 assert.match(view.html(), /<p class="inline-error">Not enough money in the selected cash account.<\/p>/);
 assert.equal(saveButton().props.disabled, true);
 setType('income');
 assert.equal(view.find(byType(ui.NativeSelect, 'Choose a cash account')).props.value, '');
 assert.equal(view.all(element => element.type === ui.FormattedNumberInput)[0].props.value, 0);
 setAccount('cash');
 setNumber('Cash amount', 1500);
 assert.ok(view.html().includes(`Cash added to Wallet: ${money(1500)}`));
 assert.doesNotMatch(view.html(), /Available for this payment/);
 assert.equal(saveButton().props.disabled, false);
 setAccount('');
 assert.equal(saveButton().props.disabled, true);
});

test('money lent tracks additions and repayments against the outstanding balance', async () => {
 const events = [
  event('b', 'baseline', '2026-03-01', { balance: 1000, notes: 'Opening' }),
  event('c', 'contribution', '2026-04-01', { amount: 200, balance: 1200, account_link: { account_id: 'cash', amount: -200 } }),
  event('w', 'withdrawal', '2026-05-01', { amount: 100, balance: 1100, account_link: { account_id: 'gone', amount: 90, account_currency: 'EUR' } }),
 ];
 const { showTab, view, setType, setAccount, setNumber, saveButton, label, inputs } = await open(record('Money lent', { amount: 1100 }), events);
 let html = view.html();
 assert.match(html, /Track additions and repayments against the outstanding balance./);
 assert.ok(html.includes(`<h3>Amount owed to you</h3><strong>${money(1100)}</strong>`));
 assert.ok(html.includes(`<h3>Repayments recorded</h3><strong>${money(100)}</strong>`));
 assert.ok(html.includes(`<h3>Additions recorded</h3><strong>${money(200)}</strong>`));
 assert.match(html, /data-line="balance">Amount owed to you</);
 assert.doesNotMatch(html, /data-line="contributions"|Value change|Total return/);
 showTab('update');
 html = view.html();
 assert.match(html, /Enter updates on or after the latest balance date/);
 showTab('history');
 const history = view.html();
 assert.match(history, /Delete newer balance updates first/);
 assert.match(history, /History starts with a balance snapshot/);
 assert.ok(history.includes(' · from Wallet</small>'));
 assert.ok(history.includes(' · to Cash account</small>'));
 assert.ok(!history.includes(money(90, 'EUR')), 'a history row never shows the converted cash figure');
 assert.ok(history.includes(`<strong>${money(200)}</strong><span>Amount owed to you: ${money(1200)}</span>`));
 assert.ok(history.includes(`<small><time>${formatDate('2026-03-01', 'en-US')}</time></small><p>Opening</p>`));
 assert.equal(view.all(element => element.props?.label === 'Delete update').length, 2);
 showTab('update');
 assert.equal(view.find(byType(ui.DatePicker)).props.min, '2026-05-01');
 assert.match(text(label('Pay from cash account')), /Pay from cash account/);
 assert.ok(html.includes(`Outstanding balance after update: ${money(1100)}`));
 setType('withdrawal');
 assert.match(text(label('Receive into cash account')), /Receive into cash account/);
 assert.equal(inputs()[0].props.max, 1100);
 setAccount('cash');
 setNumber('Principal amount', 1500);
 assert.ok(view.html().includes(`Outstanding balance after update: ${money(-400)}`));
 assert.equal(saveButton().props.disabled, true);
 setNumber('Principal amount', 300);
 assert.equal(saveButton().props.disabled, false);
 view.find(byType(ui.DatePicker)).props.onChange('2026-04-15');
 view.update();
 assert.equal(saveButton().props.disabled, true);
 html = view.html();
 assert.ok(html.includes(`Outstanding balance after update: ${money(800)}`));
});

test('inline repayments use payment wording and close the panel once saved', async () => {
 const { view, calls, setAccount, setNumber, save, saveButton } = await open(record('Debt', { amount: 500 }), [event('b', 'baseline', '2026-03-01', { balance: 500 })], { inline: true, initialType: 'withdrawal' });
 assert.equal(view.all(element => element.type === ui.Dialog).length, 0);
 const html = view.html();
 assert.match(html, /Enter any amount up to the outstanding balance/);
 assert.doesNotMatch(html, /tracker-tabs|stat-tile|Update type/);
 assert.match(html, /<p class="muted tracker-help">Select the cash account used for this transaction\./, 'on its own, the form keeps its guidance under the fields');
 assert.match(html, /<p class="muted tracker-help">Enter updates on or after the latest balance date\./);
 assert.match(html, /<label>Payment date/);
 assert.equal(text(saveButton()), 'Save payment');
 setAccount('cash');
 setNumber('Principal amount', 200);
 api.calls = []; api.handler = async () => ({});
 await save();
 assert.equal(api.calls[0].body.type, 'withdrawal');
 assert.equal(api.calls[0].body.balance, null);
 assert.equal(calls.closed, 1);
});

test('debts and loans name the outstanding balance, and waiting or missing cash accounts are explained', async () => {
 const debt = await open(record('Debt'), [event('b', 'baseline', '2026-03-01', { balance: 400 })], { accountsReady: false });
 assert.match(debt.view.html(), /<h3>Outstanding balance<\/h3>/);
 debt.showTab('update');
 assert.match(debt.view.html(), /Waiting for current cash account balances./);
 assert.equal(debt.accountSelect().props.disabled, true);
 const loan = await open(record('Loan'), [], { accounts: [] });
 assert.match(loan.view.html(), /<h3>Outstanding balance<\/h3><strong>—<\/strong>/);
 loan.showTab('update');
 assert.match(loan.view.html(), /Add a cash account to record this transaction./);
 assert.equal(loan.view.find(byType(ui.DatePicker)).props.min, '');
});

test('deposits show the interest estimate and open top-up, withdrawal and interest movements', async () => {
 const events = [event('b', 'baseline', '2026-09-01', { balance: 10000 })];
 for (const [compounding, label] of [[undefined, 'Monthly compounding'], ['daily', 'Daily compounding'], ['none', 'No compounding']]) {
  const entry = record('Deposit', { rate: 12, deposit_compounding: compounding });
  const { showTab, view, calls, button } = await open(entry, events, { accounts: [wallet, entry] });
  const html = view.html();
  const mode = compounding ?? 'monthly';
  assert.ok(html.includes(`Estimated interest for ${formatMonthYear(depositToday().slice(0, 7), 'en-US')}: ${money(depositInterest(events, 12, undefined, mode))}`));
  assert.ok(html.includes(`Estimated balance including interest: ${money(depositProjection(events, 12, undefined, mode).total)}`));
  assert.ok(html.includes(`<i data-hint="${label}. Top-ups and withdrawals affect interest`), 'how the estimate is worked out sits behind its ⓘ');
  assert.doesNotMatch(html, /<p class="muted">/, 'no grey paragraphs on the Overview');
  assert.match(html, /<h3>Account balance<\/h3>/);
  showTab('update');
  assert.match(view.html(), /data-hint="[^"]*Use Top-up or Withdraw to move money between accounts[^"]*Use Balance update for a confirmed bank balance/);
  showTab('overview');
  if (compounding) continue;
  for (const [name, initial] of [['Top-up', { kind: 'transfer', target_id: 'r' }], ['Withdraw', { kind: 'transfer', source_id: 'r' }], ['Record capitalized interest', { kind: 'interest', source_id: 'r' }]]) {
   button(name).props.onClick();
   view.update();
   const movement = view.find(byType(AssetMovementDialog));
   assert.deepEqual(movement.props.initial, initial);
   assert.deepEqual(movement.props.records.map(item => item.id), ['cash', 'r']);
   movement.props.onClose();
   view.update();
  }
  button('Top-up').props.onClick();
  view.update();
  api.calls = []; feedback.saved = 0;
  await view.find(byType(AssetMovementDialog)).props.save({ id: 'm', kind: 'transfer' });
  assert.deepEqual(api.calls[0], { url: '/api/asset-movements', body: { id: 'm', kind: 'transfer' } });
  assert.equal(feedback.saved, 1);
  assert.equal(calls.saved, 1);
  assert.equal(calls.closed, 1);
 }
});

test('stocks plot value, contributions and income, and format chart axes through the shared formatters', async () => {
 const events = [
  event('b', 'baseline', '2026-01-10', { balance: 2000, ownership_percentage: 50 }),
  event('c', 'contribution', '2026-02-10', { amount: 300 }),
  event('i', 'income', '2026-03-10', { amount: 40 }),
  event('e', 'expense', '2026-03-12', { amount: 15 }),
 ];
 const { showTab, view, button } = await open(record('Stock'), events);
 const html = view.html();
 assert.ok(html.includes(`<div class="stat-tiles" data-columns="auto"><article class="stat-tile"><h3>Latest tracked value (your share)</h3><strong>${money(1000)}</strong><p>Full value ${money(2000)} · you own 50%</p></article>`), 'the lead figure opens the tiles');
 assert.ok(html.includes(`<h3>Income received</h3><strong>${money(40)}</strong>`));
 assert.ok(html.includes(`<h3>Expense paid</h3><strong>${money(15)}</strong>`));
 assert.doesNotMatch(html, /record-form|<fieldset/, 'the form has its own tab');
 assert.match(html, /data-line="balance">Value \(your share\)<\/span><span data-line="contributions">Net contributions<\/span><span data-line="receipts">Income received</);
 const lines = () => view.all(byType(Line));
 assert.deepEqual(lines().map(line => [line.props.dataKey, line.props.stroke]), [['balance', 'var(--primary)'], ['contributions', lines()[1].props.stroke], ['receipts', 'var(--positive)']], 'income takes the income colour, not the value line\'s');
 assert.notEqual(lines()[1].props.stroke, 'var(--primary)');
 // The legend is the shared clickable one: pressing an entry hides its line.
 const legend = () => view.all(byType('button'), view.find(element => element.props?.className === 'comparison-legend'));
 assert.deepEqual(legend().map(text), ['Value (your share)', 'Net contributions', 'Income received']);
 legend()[2].props.onClick();
 view.update();
 assert.deepEqual(lines().map(line => line.props.dataKey), ['balance', 'contributions']);
 assert.equal(legend()[2].props['aria-pressed'], false);
 legend()[2].props.onClick();
 view.update();
 assert.match(html, /Dated values and actual cash movements. Estimates stay separate./);
 showTab('history');
 assert.match(view.html(), /History starts with a current snapshot/);
 assert.ok(view.html().includes(`<strong>${money(1000)}</strong><span>Full value ${money(2000)} · you own 50%</span></div>`));
 assert.equal(view.all(element => element.props?.label === 'Delete update').length, 0);
 showTab('overview');
 const timestamp = Date.parse('2026-03-10T00:00:00Z');
 assert.equal(view.find(byType(chart.XAxis)).props.tickFormatter(timestamp), formatDate('2026-03-10', 'en-US'));
 const axis = view.find(byType(chart.YAxis)).props;
 assert.deepEqual(axis.ticks, [0, 250, 500, 750, 1000]);
 assert.equal(axis.tickFormatter(1234.4), formatCompactMoney(1234.4, 'USD', 'en-US'), 'value-axis ticks are compact');
 assert.equal(axis.tickFormatter(1000), '$1K');
 const tooltip = view.find(byType(chart.Tooltip)).props;
 assert.equal(tooltip.labelFormatter(String(timestamp)), formatDate('2026-03-10', 'en-US'));
 assert.equal(tooltip.formatter('99.6'), money(100), 'the tooltip keeps the whole amount');
 assert.equal(tooltip.formatter(1234567), money(1234567));
 assert.equal(tooltip.formatter(null), '—');
 for (const [name, initial] of [['Buy', { kind: 'buy', target_id: 'r' }], ['Sell / convert', { kind: 'sell', source_id: 'r' }]]) {
  button(name).props.onClick();
  view.update();
  assert.deepEqual(view.find(byType(AssetMovementDialog)).props.initial, initial);
  view.find(byType(AssetMovementDialog)).props.onClose();
  view.update();
 }
});

test('mortgages show principal and interest paid and hand payments to the payment form', async () => {
 const events = [event('b', 'baseline', '2026-01-01', { balance: 100000 }), event('p', 'mortgage_payment', '2026-02-01', { amount: 1500, principal: 1000, interest: 500 })];
 const { showTab, view, calls, button, typeSelect } = await open(record('Mortgage'), events);
 const html = view.html();
 assert.ok(html.includes(`<h3>Principal repaid</h3><strong>${money(1000)}</strong>`));
 assert.ok(html.includes(`<h3>Interest paid</h3><strong>${money(500)}</strong>`));
 assert.ok(html.includes(`<h3>Outstanding balance</h3><strong>${money(100000)}</strong>`));
 showTab('update');
 assert.deepEqual(typeSelect().props.children.map(text), ['Additional borrowing']);
 assert.match(view.html(), /Receive into cash account/);
 showTab('overview');
 button('Record payment').props.onClick();
 assert.equal(calls.payments, 1);
 showTab('history');
 const history = view.html();
 assert.ok(history.includes(`Principal repayment: ${money(1000)} · Interest paid: ${money(500)}`));
 assert.ok(history.includes(`<strong>${money(1500)}</strong>`));
 assert.ok(!history.includes('Cash amount (your share): '));
 assert.equal(view.all(element => element.props?.label === 'Delete update').length, 0);
});

test('Overview shows the figures, History every entry and Add update the form, and an unsaved draft survives the switch', async () => {
 const events = [event('b', 'baseline', '2026-01-01', { balance: 5000 }), event('c', 'contribution', '2026-02-01', { amount: 300 })];
 const { tabs, showTab, view, calls } = await open(record('Business'), events);
 assert.deepEqual(tabs().props.options.map(option => [option.value, option.label]), [['overview', 'Overview'], ['history', 'History'], ['update', 'Add update']]);
 assert.equal(tabs().props.value, 'overview', 'without an update type the figures come first');
 assert.match(view.html(), /stat-tiles/);
 assert.doesNotMatch(view.html(), /record-form|<fieldset|Update type|Starting snapshot|tracker-history/, 'the form is not on the Overview');
 showTab('update');
 assert.match(view.html(), /<div class="record-form"><fieldset class="tracker-fields">/);
 assert.doesNotMatch(view.html(), /stat-tiles|tracker-chart|tracker-history/);
 view.find(byType('textarea')).props.onChange({ target: { value: 'Kept' } });
 view.update();
 assert.deepEqual(calls.draft.at(-1), [true, false]);
 showTab('history');
 assert.equal(tabs().props.value, 'history');
 assert.doesNotMatch(view.html(), /record-form|<fieldset|Update type|stat-tiles/, 'nor on History');
 assert.match(view.html(), /Money invested[\s\S]*Starting snapshot/, 'newest first');
 assert.deepEqual(calls.draft.at(-1), [true, false], 'the draft is still unsaved on another tab');
 showTab('overview');
 showTab('update');
 assert.equal(view.find(byType('textarea')).props.value, 'Kept');
});

test('value change and total return are measured from the first tracked value, signed and toned', async () => {
 const tile = (view, label) => view.html().split('<article class="stat-tile">').find(item => item.startsWith(`<h3>${label}`));
 const signed = value => formatSignedMoney(value, 'USD', 'en-US');
 const gain = await open(record('Property'), [
  event('b', 'baseline', '2026-01-01', { balance: 100000, ownership_percentage: 50 }),
  event('c', 'contribution', '2026-02-01', { amount: 4000 }),
  event('i', 'income', '2026-03-01', { amount: 1500 }),
  event('e', 'expense', '2026-03-05', { amount: 500 }),
  event('v', 'valuation', '2026-04-01', { balance: 120000, ownership_percentage: 50 }),
 ]);
 assert.equal(tile(gain.view, 'Value change'), `<h3>Value change</h3><strong class="positive">${signed(10000)}</strong><p>+20% since ${formatDate('2026-01-01', 'en-US')}</p></article>`);
 assert.equal(tile(gain.view, 'Total return'), `<h3>Total return<i data-hint="Value change plus income received, minus expenses paid and net contributions, since the first tracked value."></i></h3><strong class="positive">${signed(7000)}</strong></article>`);
 const loss = await open(record('Stock'), [event('b', 'baseline', '2026-01-01', { balance: 2000 }), event('v', 'valuation', '2026-02-01', { balance: 1500 }), event('i', 'income', '2026-02-10', { amount: 100 })]);
 assert.equal(tile(loss.view, 'Value change'), `<h3>Value change</h3><strong class="negative">${signed(-500)}</strong><p>−25% since ${formatDate('2026-01-01', 'en-US')}</p></article>`);
 assert.ok(tile(loss.view, 'Total return').endsWith(`<strong class="negative">${signed(-400)}</strong></article>`));
 // One dated value: nothing to compare yet, so no figure and no tone.
 const single = await open(record('Stock'), [event('b', 'baseline', '2026-01-01', { balance: 2000 }), event('i', 'income', '2026-02-10', { amount: 100 })]);
 assert.equal(tile(single.view, 'Value change'), '<h3>Value change</h3><strong>—</strong></article>');
 assert.ok(tile(single.view, 'Total return').endsWith('<strong>—</strong></article>'));
 // A payment no rate converts: the value change is known, what it returned is not.
 const unknown = await open(record('Property'), [event('b', 'baseline', '2026-01-01', { balance: 5000 }), event('p', 'income', '2026-02-01', { amount: null, entered: { amount: 500000, currency: 'UZS', name: 'Rent' } }), event('v', 'valuation', '2026-03-01', { balance: 6000 })]);
 assert.ok(tile(unknown.view, 'Value change').startsWith(`<h3>Value change</h3><strong class="positive">${signed(1000)}</strong>`));
 assert.ok(tile(unknown.view, 'Total return').endsWith('<strong>—</strong></article>'));
 // An unchanged value is neither a gain nor a loss.
 const flat = await open(record('Valuables'), [event('b', 'baseline', '2026-01-01', { balance: 900 }), event('v', 'valuation', '2026-02-01', { balance: 900 })]);
 assert.equal(tile(flat.view, 'Value change'), `<h3>Value change</h3><strong>${money(0)}</strong><p>0% since ${formatDate('2026-01-01', 'en-US')}</p></article>`);
});

test('a line that is zero for the whole history is not drawn or listed, and a lone value is a dot on a bounded axis', async () => {
 const { view } = await open(record('Property'), [event('b', 'baseline', '2026-01-10', { balance: 80000000, ownership_percentage: 50 })]);
 const drawn = () => view.all(byType(Line)).map(line => line.props.dataKey);
 const legend = () => view.all(byType('button'), view.find(element => element.props?.className === 'comparison-legend')).map(text);
 assert.deepEqual(drawn(), ['balance']);
 assert.deepEqual(legend(), ['Value (your share)']);
 assert.equal(view.all(byType(chart.Legend)).length, 0);
 const first = Date.parse('2026-01-10T00:00:00Z');
 const time = view.find(byType(chart.XAxis)).props;
 assert.deepEqual(time.domain, [first, first + 86400000]);
 assert.deepEqual(time.ticks, [first]);
 assert.deepEqual(view.find(byType(Line)).props.dot, { r: 4, strokeWidth: 2, fill: 'var(--card)' });
 const axis = view.find(byType(chart.YAxis)).props;
 assert.ok(axis.domain[0] < 40000000 && axis.domain[1] > 40000000 && axis.domain[0] >= 0);
 assert.ok(axis.ticks.every(tick => axis.tickFormatter(tick).length <= 'UZS 99.9M'.length), 'no whole amounts on the axis');
 // Income alone adds its line; money invested stays out until some is recorded.
 const income = await open(record('Property'), [event('b', 'baseline', '2026-01-10', { balance: 5000 }), event('i', 'income', '2026-02-10', { amount: 70 })]);
 assert.deepEqual(income.view.all(byType(Line)).map(line => line.props.dataKey), ['balance', 'receipts']);
 const invested = await open(record('Property'), [event('b', 'baseline', '2026-01-10', { balance: 5000 }), event('c', 'contribution', '2026-02-10', { amount: 70 }), event('i', 'income', '2026-02-11', { amount: 0 })]);
 assert.deepEqual(invested.view.all(byType(Line)).map(line => line.props.dataKey), ['balance', 'contributions']);
 assert.deepEqual(invested.view.find(byType(chart.XAxis)).props.ticks, undefined);
});

test('a wholly owned asset shows no full-value note; a shared one shows it on its value rows', async () => {
 const own = await open(record('Business'), [event('b', 'baseline', '2026-01-01', { balance: 5000 })]);
 assert.doesNotMatch(own.view.html(), /Full value/);
 const shared = await open(record('Business'), [event('b', 'baseline', '2026-01-01', { balance: 72000, ownership_percentage: 50 }), event('c', 'contribution', '2026-02-01', { amount: 300 })]);
 shared.showTab('history');
 const row = id => shared.view.html().split('<li ').find(item => item.includes(id));
 assert.ok(row('1 January 2026').includes(`<strong>${money(36000)}</strong><span>Full value ${money(72000)} · you own 50%</span>`));
 assert.doesNotMatch(row('1 February 2026'), /Full value/);
 const icons = shared.view.all(element => element.props?.className === 'record-icon category-record-icon');
 assert.equal(icons.length, 2, 'every row has a symbol');
 assert.notEqual(icons[0].props.style['--category-hue'], icons[1].props.style['--category-hue'], 'each kind of entry has its own colour');
});

test('a history row is headed by the money that moved, and the value it set comes second', async () => {
 const events = [event('b', 'baseline', '2026-01-01', { balance: 33000 }), event('c', 'contribution', '2026-02-01', { amount: 6336, balance: 36000 }), event('k', 'contribution', '2026-03-01', { amount: 500 }), event('v', 'valuation', '2026-04-01', { balance: 40000, amount: 250 })];
 const { showTab, view } = await open(record('Property'), events);
 showTab('history');
 const row = id => view.html().split('<li ').find(item => item.includes(id));
 assert.match(row('1 February 2026'), new RegExp(`<strong>\\${money(6336)}</strong><span>Value \\(your share\\): \\${money(36000)}</span>`));
 assert.ok(row('1 March 2026').includes(`<strong>${money(500)}</strong>`), 'a cash move that kept the value still has a headline');
 assert.ok(!row('1 March 2026').includes('Value (your share): '));
 assert.match(row('1 April 2026'), new RegExp(`<strong>\\${money(40000)}</strong><span>Cash amount \\(your share\\): \\${money(250)}</span>`));
 assert.ok(row('1 January 2026').includes(`<strong>${money(33000)}</strong>`));
});

test('a payment linked to the asset reads as entered, and its bin deletes the transaction, not a tracker update', async () => {
 const events = [event('b', 'baseline', '2026-01-01', { balance: 5000 }), event('p', 'contribution', '2026-02-01', { amount: 12, notes: 'Sheep feed', entered: { amount: 1000000, currency: 'UZS', name: 'Sheep feed' }, account_link: { account_id: 'cash', amount: -1000000 } }), event('u', 'contribution', '2026-03-01', { amount: 0, entered: { amount: 500000, currency: 'UZS' } })];
 const { showTab, view } = await open(record('Business'), events);
 showTab('history');
 const html = view.html();
 assert.ok(html.includes(`<strong>Money invested</strong><small><time>${formatDate('2026-02-01', 'en-US')}</time> · from Wallet</small><p>Sheep feed</p>`));
 assert.ok(html.includes(`<strong>${money(1000000, 'UZS')}</strong><span>${money(12)} at that day&#x27;s rate</span>`), 'a payment in another currency shows what it counts for in the totals');
 assert.ok(html.includes(`<strong>${money(500000, 'UZS')}</strong>`), 'a payment no rate converts still shows what was paid');
 const bins = view.all(element => element.props?.label === 'Delete record');
 assert.equal(bins.length, 2);
 bins[1].props.onClick();
 view.update();
 assert.match(view.html(), /<h3>Delete this record\?<\/h3>/);
 assert.match(view.html(), /Move Sheep feed to Recently deleted\?/);
 api.calls.length = 0;
 api.handler = async () => ({});
 await view.find(byType(ConfirmDialog)).props.onConfirm();
 assert.deepEqual(api.calls[0], { url: '/api/records', method: 'DELETE', body: { id: 'p' } });
 api.calls.length = 0;
});

test('a linked payment no rate converts leaves the tiles it adds to unknown, with the note, and its row as entered', async () => {
 const paid = event('p', 'income', '2026-02-01', { amount: null, notes: 'Rent', entered: { amount: 500000, currency: 'UZS', name: 'Rent' } });
 const { showTab, view } = await open(record('Property'), [event('b', 'baseline', '2026-01-01', { balance: 5000 }), paid]);
 assert.match(view.html(), /<h3>Income received<\/h3><strong>—<\/strong>/);
 assert.match(view.html(), /Exchange rate unavailable\./);
 assert.ok(view.html().includes(`<strong>${money(0)}</strong>`), 'an expense total nothing is missing from stays a number');
 showTab('history');
 assert.ok(view.html().includes(`<strong>${money(500000, 'UZS')}</strong>`));
 const known = await open(record('Property'), [event('b', 'baseline', '2026-01-01', { balance: 5000 }), event('i', 'income', '2026-02-01', { amount: 70 })]);
 assert.ok(known.view.html().includes(`<strong>${money(70)}</strong>`));
 assert.doesNotMatch(known.view.html(), /Exchange rate unavailable/);
});

test('business updates can be deleted after confirmation, and a failed delete reports its error', async () => {
 const events = [event('b', 'baseline', '2026-01-01', { balance: 5000 }), event('v', 'valuation', '2026-02-01', { balance: 6000, amount: 250 })];
 const { showTab, view, calls } = await open(record('Business'), events);
 showTab('update');
 assert.match(view.html(), /Business valuations use the current ownership share./);
 showTab('overview');
 const confirm = () => view.find(byType(ConfirmDialog));
 await confirm().props.onConfirm();
 assert.equal(api.calls.filter(call => call.method === 'DELETE').length, 0);
 showTab('history');
 const remove = () => view.find((element => element.props?.label === 'Delete update'));
 assert.equal(remove().props.disabled, false);
 remove().props.onClick();
 view.update();
 let html = view.html();
 assert.match(html, /<h3>Delete this tracker update\?<\/h3>/);
 assert.ok(html.includes(`Value update · ${formatDate('2026-02-01', 'en-US')} · ${money(250)}`));
 confirm().props.onClose();
 view.update();
 assert.equal(confirm().props.open, false);

 remove().props.onClick();
 view.update();
 api.calls = [];
 let finish;
 api.handler = () => new Promise(resolve => { finish = resolve; });
 serve([events[0]]);
 const pending = confirm().props.onConfirm();
 view.update();
 assert.equal(confirm().props.confirmLabel, 'Deleting…');
 assert.equal(confirm().props.busy, true);
 await confirm().props.onConfirm();
 assert.equal(api.calls.length, 1);
 finish(); await pending;
 assert.deepEqual(api.calls[0], { url: '/api/investment-history', method: 'DELETE', body: { id: 'v', record_id: 'r' } });
 assert.equal(calls.saved, 1);
 view.update();
 assert.equal(confirm().props.open, false);
 await view.flush();
 assert.equal(requests.length, 1);
 assert.equal(view.all(element => element.props?.label === 'Delete update').length, 0);

 const second = await open(record('Valuables'), [event('v', 'valuation', '2026-02-01', { balance: 10 })]);
 second.showTab('history');
 second.view.find((element => element.props?.label === 'Delete update')).props.onClick();
 second.view.update();
 assert.ok(second.view.html().includes(`Value update · ${formatDate('2026-02-01', 'en-US')}</p>`));
 api.handler = async () => { throw Error('Newer updates exist'); };
 await second.view.find(byType(ConfirmDialog)).props.onConfirm();
 second.view.update();
 assert.match(second.view.html(), /role="alert">Newer updates exist</);
 assert.equal(second.view.find(byType(ConfirmDialog)).props.open, false);
 assert.equal(second.calls.saved, 0);
});

test('an edited draft locks deletes, and the dialog closes through the guard unless saving', async () => {
 const { tabs, showTab, view, calls, setType, save, setAccount, setNumber } = await open(record('Property', { amount: 100 }), [event('v', 'valuation', '2026-02-01', { balance: 100 })], { initialType: 'withdrawal' });
 assert.equal(tabs().props.value, 'update');
 assert.equal(view.find(byType(ToggleGroup)).props.value, 'keep');
 view.find(byType('textarea')).props.onChange({ target: { value: 'Sold a room' } });
 view.update();
 assert.equal(view.find(byType('textarea')).props.value, 'Sold a room');
 showTab('history');
 assert.equal(view.find((element => element.props?.label === 'Delete update')).props.disabled, true);
 showTab('update');
 setType('valuation');
 assert.equal(view.all(element => element.type === ToggleGroup).length, 0);
 setType('withdrawal');
 setAccount('cash');
 setNumber('Cash amount', 50);
 let finish;
 api.handler = () => new Promise(resolve => { finish = resolve; });
 const pending = save();
 view.update();
 assert.equal(text(view.find(byType(ui.FormFooter)).props.children), 'Saving…');
 view.find(byType(ui.Dialog)).props.onOpenChange(false);
 assert.equal(calls.closed, 0);
 finish(); await pending;
 view.update();
 view.find(byType(ui.Dialog)).props.onOpenChange(true);
 assert.equal(calls.closed, 0);
 view.find(byType(ui.Dialog)).props.onOpenChange(false);
 assert.equal(calls.closed, 1);
});

test('an initial type the record does not support falls back to its first update type', async () => {
 const { view, typeSelect } = await open(record('Cash'), [], { initialType: 'income', onDraftState: undefined });
 assert.equal(typeSelect().props.value, 'valuation');
 assert.equal(view.find(element => element.props?.className === 'tracker-tabs').props.value, 'update');
 // A cash balance opened as a withdrawal falls back to a balance update and starts with an empty value.
 const cash = await open(record('Cash'), [], { initialType: 'withdrawal' });
 assert.equal(cash.typeSelect().props.value, 'valuation');
 assert.equal(cash.label('Account balance after update').props.children[1].props.value, 0);
 assert.equal(cash.saveButton().props.disabled, true);
 // History may arrive newest first; the latest balance date still bounds lending updates.
 const lent = await open(record('Money lent'), [event('n', 'valuation', '2026-06-01', { balance: 50 }), event('o', 'baseline', '2026-03-01', { balance: 100 })]);
 lent.showTab('update');
 assert.equal(lent.view.find(byType(ui.DatePicker)).props.min, '2026-06-01');
 const bill = await open(record('Treasury bill', { rate: 5 }), []);
 assert.match(bill.view.html(), /Estimated interest for/);
 bill.showTab('update');
 assert.deepEqual(bill.typeSelect().props.children.map(text), ['Balance update', 'Interest received', 'Expense paid']);
});

test('a foreign cash account without a quote shows no conversion, and amounts beyond the supported range are refused', async () => {
 fx.rates = {};
 const property = await open(record('Vehicle'), [], { initialType: 'expense' });
 property.setAccount('eur');
 property.setNumber('Cash amount', 100);
 let html = property.view.html();
 assert.match(html, /class="fx">rate null</);
 assert.doesNotMatch(html, /Available for this payment|Cash deducted|Cash balance after update/);
 assert.equal(property.saveButton().props.disabled, true);

 const income = await open(record('Stock'), [], { initialType: 'income' });
 income.setAccount('cash');
 income.setNumber('Cash amount', 2e15);
 assert.equal(income.saveButton().props.disabled, true);
 income.setNumber('Cash amount', 1e6);
 assert.equal(income.saveButton().props.disabled, false);

 const lent = await open(record('Money lent'), [event('b', 'baseline', '2026-03-01', { balance: 100 })], { accounts: [{ ...wallet, amount: 5e15 }] });
 lent.showTab('update');
 lent.setAccount('cash');
 lent.setNumber('Principal amount', 2e15);
 html = lent.view.html();
 assert.ok(html.includes(`Outstanding balance after update: ${money(2e15 + 100)}`));
 assert.equal(lent.saveButton().props.disabled, true);
});
