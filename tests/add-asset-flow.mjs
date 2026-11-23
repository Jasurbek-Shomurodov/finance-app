import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byText, createRenderer, host, stubs, text, walk } from './helpers/component-tree.mjs';

const { formatMoney } = loadTS('lib/format.ts');
const usd = (amount, unit = false) => formatMoney(amount, 'USD', 'en-US', unit);
const today = '2026-11-23';
const h = React.createElement;
const named = (name, render) => Object.assign(render, { displayName: name });
const InstrumentPicker = named('InstrumentPicker', ({ kind, value }) => h('button', { 'data-picker': kind }, value || 'pick'));
const HintedLabel = named('HintedLabel', ({ label, children }) => h('label', null, label, children));
const wallet = { id: 'wallet', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 5000 };
const euros = { id: 'euros', name: 'Euro cash', kind: 'Cash', currency: 'EUR', amount: 900 };
const accounts = [wallet, euros, { id: 'deposit', name: 'Deposit', kind: 'Deposit', currency: 'USD', amount: 1 }];
const failure = (message, confirmed) => Object.assign(Error(message), { confirmedFailure: confirmed, status: confirmed ? 400 : 503 });

function open(props = {}) {
 const r = createRenderer(), ui = stubs();
 const fx = { rate: null }, guard = { dirty: false };
 const { AddAssetFlow } = r.load('components/add-asset/add-asset-flow.tsx', {
  ...ui.modules,
  'lucide-react': { ArrowLeft: host('svg'), Check: host('svg'), X: host('svg') },
  '@/components/instrument-picker': { InstrumentPicker },
  '@/components/presentation-foundation/record-icon': { RecordIcon: host('i') },
  '@/components/presentation-foundation/hinted-label': { HintedLabel },
  '@/components/ui/input': { Input: host('input') },
  '@/components/ui/switch': { Switch: host('input') },
  '@/hooks/use-step-focus': { useStepFocus: () => ({ ref: { current: null }, onOpenAutoFocus() {} }) },
  '@/hooks/use-dated-exchange-rate': { useDatedExchangeRate: (from, to) => ({ rate: !from ? null : from === to ? 1 : fx.rate, loading: false, retry() {} }) },
  '@/components/discard-changes': { useDiscardChanges: (dirty, onClose, busy) => { guard.dirty = dirty; return { close: () => { if (!busy) onClose(); }, confirmation: null }; } },
 });
 const calls = { quotes: [], records: [], purchases: [], closed: 0, saved: 0, business: 0, focused: [] };
 const replies = { quote: async () => 200, record: async () => {}, purchase: async () => {} };
 const all = { currency: 'USD', currencies: ['USD'], accounts, accountsReady: true, holdingAccounts: [], today,
  quote: target => { calls.quotes.push(target.name || target.metal); return replies.quote(target); },
  savers: { saveRecord: async record => { calls.records.push(record); await replies.record(record); }, savePurchase: async (purchase, plan) => { calls.purchases.push({ purchase, plan }); await replies.purchase(purchase); } },
  onBusinessSetup: () => calls.business++, onClose: () => calls.closed++, onSaved: () => calls.saved++, ...props };
 r.mount(h(AddAssetFlow, all));
 const form = { querySelector: selector => ({ focus: () => calls.focused.push(selector.match(/data-field="(\w+)"/)[1]) }) };
 const view = {
  r, calls, replies, fx, guard,
  html: () => r.html(),
  heading: () => text(r.find(node => node.type === 'h1')),
  tile: kind => r.fire(r.find(node => node.type === 'button' && text(node) === kind && node.props['aria-pressed'] !== undefined), 'onClick'),
  /** Enter, or the footer button: both submit the one form. */
  submit: async () => { await r.fire(r.find(node => node.type === 'form'), 'onSubmit', { preventDefault() {}, currentTarget: form }); await r.flush(3); },
  action: () => r.all(node => node.type === ui.Button && node.props.type !== 'button').map(node => text(node)).at(-1),
  field: label => r.find(node => node.type === 'label' && text(node).startsWith(label)),
  number: label => r.find(node => node.type === ui.FormattedNumberInput, view.field(label)),
  type: (label, amount) => r.fire(view.number(label), 'onValueChange', amount, false),
  date: label => r.find(node => node.type === ui.DatePicker, view.field(label)),
  select: label => r.find(node => node.type === ui.NativeSelect, view.field(label)),
  choose: (label, value) => r.fire(view.select(label), 'onChange', { target: { value } }),
  pick: async name => { r.fire(r.find(node => node.type === InstrumentPicker), 'onChange', name); await r.flush(3); },
  errors: () => r.all(node => node.props?.role === 'alert').map(node => text(node)),
  press: label => r.fire(r.find(node => typeof node.props?.onClick === 'function' && text(node) === label), 'onClick'),
  has: label => r.all(node => node.type === 'label' && text(node).startsWith(label)).length > 0,
  steps: () => r.all(node => node.type === 'li').map(node => text(node).replace(/^\d/, '')),
  current: () => text(r.find(node => node.type === 'li' && node.props['aria-current'] === 'step')).replace(/^\d/, ''),
  chip: () => r.all(node => node.props?.className === 'asset-kind-chip').map(node => text(node))[0],
  review: () => r.all(node => node.props?.className === 'asset-review').map(node => text(node))[0],
 };
 return view;
}
/** A stock, picked and counted, standing on the Paid from step. */
async function stockAtPaid(props) {
 const view = open(props);
 view.tile('Stock'); await view.pick('AAPL'); await view.submit();
 view.type('Quantity', 10); await view.submit();
 return view;
}

test('step one is the kind, as tiles; a business starts its own setup instead', async () => {
 const view = open();
 assert.equal(view.heading(), 'What are you adding?');
 assert.deepEqual(view.r.all(node => node.type === 'button' && node.props['aria-pressed'] !== undefined).map(node => text(node)), ['Stock', 'Crypto', 'Precious metals', 'Equity compensation', 'Treasury bill', 'Bond', 'Retirement account', 'Property', 'Business', 'Vehicle', 'Valuables']);
 assert.equal(view.action(), undefined, 'the tiles are the way on; there is no button to be switched off');
 assert.equal(view.guard.dirty, false);
 view.tile('Business');
 assert.deepEqual([view.calls.closed, view.calls.business], [1, 1]);
 view.tile('Stock');
 assert.deepEqual(view.steps(), ['Kind', 'What', 'How much', 'Paid from']);
 assert.equal(view.current(), 'What');
 assert.equal(view.chip(), 'StockChange', 'the kind is locked into a chip with the way back');
 assert.equal(view.guard.dirty, true, 'closing now asks first');
 // Change goes back to the tiles with the kind marked; choosing a kind without a purchase shortens the steps.
 view.press('Change');
 assert.equal(view.heading(), 'What are you adding?');
 assert.equal(view.r.find(node => node.type === 'button' && node.props['aria-pressed'] === true).props.children[1].props.children, 'Stock');
 assert.equal(view.action(), 'Continue');
 await view.submit();
 assert.equal(view.current(), 'What', 'Continue keeps the kind already chosen');
 view.press('Change'); view.tile('Bond');
 assert.deepEqual(view.steps(), ['Kind', 'What', 'How much']);
});

test('a stock owned already: the price is fetched on the pick, each step says what it needs under its field, and Save records the holding alone', async () => {
 const view = open();
 view.tile('Stock');
 assert.equal(view.heading(), 'What is it?');
 await view.submit();
 assert.deepEqual(view.errors(), ['Choose a stock or ETF.']);
 assert.deepEqual(view.calls.focused, ['name'], 'the first field at fault takes the keyboard');
 assert.equal(view.current(), 'What');
 let arrive;
 view.replies.quote = () => new Promise(resolve => { arrive = resolve; });
 await view.pick('AAPL');
 assert.deepEqual(view.calls.quotes, ['AAPL'], 'no second press: picking fetches');
 assert.match(view.html(), /role="status">Fetching prices…/);
 assert.deepEqual(view.errors(), [], 'the problem leaves with its cause');
 arrive(200); await view.r.flush(3);
 assert.match(view.html(), new RegExp('role="status">Current price: ' + usd(200, true).replace('$', '\\$')));
 await view.submit();
 assert.equal(view.heading(), 'How much?');
 assert.equal(view.number('Current price per unit').props.value, 200);
 assert.equal(view.number('Purchase price per unit').props.value, 200, 'until typed, the price paid follows the quote');
 assert.equal(view.number('Quantity').props.value, 0, 'the quantity is typed, never assumed');
 await view.submit();
 assert.deepEqual(view.errors(), ['Enter a quantity greater than zero.']);
 assert.equal(view.calls.focused.at(-1), 'quantity');
 assert.equal(view.number('Quantity').props.invalid, true);
 view.type('Quantity', -1); await view.submit();
 assert.equal(view.current(), 'How much', 'a negative quantity is refused too');
 // Quantity and price give the total as they are typed; typing the total gives the price.
 view.type('Quantity', 10);
 assert.equal(view.number('Total paid').props.value, 2000);
 assert.match(view.html(), new RegExp('Worth today: ' + usd(2000).replace('$', '\\$')));
 view.type('Total paid', 1900);
 assert.equal(view.number('Purchase price per unit').props.value, 190);
 view.type('Current price per unit', 0); await view.submit();
 assert.deepEqual(view.errors(), ['Enter the current price per unit.']);
 view.type('Current price per unit', 210);
 await view.submit();
 assert.equal(view.heading(), 'How did you pay for it?');
 // Back keeps everything typed.
 view.r.fire(view.r.find(node => node.props?.['aria-label'] === 'Back'), 'onClick');
 assert.deepEqual([view.number('Quantity').props.value, view.number('Total paid').props.value, view.number('Current price per unit').props.value], [10, 1900, 210]);
 await view.submit();
 assert.equal(view.r.find(node => node.props?.['aria-pressed'] === true).props.children, 'Already owned');
 assert.ok(view.has('Purchase date') && !view.has('Cash account'));
 assert.equal(view.date('Purchase date').props.max, today);
 assert.equal(view.review(), `ReviewAAPL · 10 units · ${usd(2100)} · Already owned`);
 assert.equal(view.action(), 'Save');
 view.r.fire(view.date('Purchase date'), 'onChange', '2026-10-05');
 await view.submit();
 assert.equal(view.calls.records.length, 1);
 const saved = view.calls.records[0];
 assert.deepEqual([saved.kind, saved.name, saved.quantity, saved.cost, saved.amount, saved.opened_on, saved.date, saved.currency], ['Stock', 'AAPL', 10, 190, 210, '2026-10-05', '2026-10-05', 'USD']);
 assert.deepEqual([view.calls.purchases.length, view.calls.saved], [0, 1]);
});

test('paid from a cash account: one Save records the holding and the Buy that fills it', async () => {
 const view = await stockAtPaid();
 view.press('Paid from an account');
 assert.ok(view.has('Date') && view.has('Cash account') && view.has('Total paid'));
 assert.deepEqual([...walk(view.select('Cash account'))].filter(node => node.type === 'option').map(node => text(node)), ['Choose a cash account', `Wallet · ${usd(5000)}`, `Euro cash · ${formatMoney(900, 'EUR', 'en-US')}`], 'only cash accounts can pay');
 await view.submit();
 assert.deepEqual(view.errors(), ['Choose a cash account.']);
 assert.equal(view.calls.focused.at(-1), 'account');
 assert.equal(view.calls.records.length, 0);
 view.choose('Cash account', 'wallet');
 assert.match(view.html(), new RegExp('Wallet after this: ' + usd(3000).replace('$', '\\$')));
 view.type('Total paid', 6000); await view.submit();
 assert.deepEqual(view.errors(), [`Only ${usd(5000)} available`]);
 view.type('Total paid', 0); await view.submit();
 assert.deepEqual(view.errors(), ['Enter what you paid in total.']);
 view.type('Total paid', 2020);
 view.r.fire(view.date('Date'), 'onChange', '2026-11-20');
 assert.equal(view.review(), `ReviewAAPL · 10 units · ${usd(2000)} · paid from Wallet on 20 November 2026`);
 await view.submit();
 const record = view.calls.records[0], { purchase } = view.calls.purchases[0];
 assert.deepEqual([record.quantity, record.cost, record.amount, record.opened_on], [0, 0, 200, '2026-11-20'], 'the holding is saved empty');
 assert.deepEqual(purchase.body, { id: purchase.body.id, kind: 'buy', source_id: 'wallet', target_id: record.id, sent: 2020, received: 10, source_value: 2020, target_value: 2020, fee: 0, date: '2026-11-20', notes: '' });
 assert.equal(purchase.url, '/api/asset-movements');
 assert.equal(view.calls.saved, 1);
 // Another currency: what left the account is typed, never worked out from a rate.
 const abroad = await stockAtPaid();
 abroad.press('Paid from an account'); abroad.choose('Cash account', 'euros');
 await abroad.submit();
 assert.deepEqual(abroad.errors(), ['Enter an amount greater than zero.']);
 assert.equal(abroad.calls.focused.at(-1), 'debited');
 abroad.type('Total amount debited', 880);
 await abroad.submit();
 assert.deepEqual((({ sent, source_value, target_value }) => [sent, source_value, target_value])(abroad.calls.purchases[0].purchase.body), [880, 880, 2000]);
});

test('when the purchase fails after the holding was saved, the flow says exactly that and retries only the purchase', async () => {
 const view = await stockAtPaid();
 view.press('Paid from an account'); view.choose('Cash account', 'wallet');
 view.replies.purchase = async () => { throw failure('Choose a date on or after the latest balance update.', true); };
 await view.submit();
 assert.deepEqual([view.calls.records.length, view.calls.purchases.length, view.calls.saved], [1, 1, 0]);
 assert.deepEqual(view.errors(), ['AAPL is saved, with nothing in it yet. The purchase from Wallet was not recorded: Choose a date on or after the latest balance update.Retry records only the purchase. Nothing is recorded twice.Finish without the purchase']);
 assert.equal(view.action(), 'Retry');
 // The record is saved: the kind, the earlier steps and the choice are closed; a refused purchase may change its details.
 assert.equal(view.r.all(node => node.props?.['aria-label'] === 'Back').length, 0);
 assert.equal(view.r.find(byText('button', 'Change')).props.disabled, true);
 assert.equal(view.r.all(byText('button', 'Already owned')).length, 0);
 assert.equal(view.date('Date').props.disabled, false);
 assert.equal(view.date('Date').props.min, today, 'never before the day the holding was saved under');
 assert.equal(view.guard.dirty, false, 'nothing unsaved would be lost by closing');
 const firstId = view.calls.purchases[0].purchase.body.id;
 view.replies.purchase = async () => { throw failure('Update could not be confirmed. Retry with the same details.', false); };
 await view.submit();
 assert.deepEqual([view.calls.records.length, view.calls.purchases.length], [1, 2], 'the holding is not sent again');
 assert.equal(view.calls.purchases[1].purchase.body.id, firstId, 'the same purchase id, so nothing is recorded twice');
 assert.equal(view.date('Date').props.disabled, true, 'an unanswered purchase is retried exactly as it was sent');
 assert.equal(view.select('Cash account').props.disabled, true);
 view.replies.purchase = async () => {};
 await view.submit();
 assert.deepEqual([view.calls.purchases.length, view.calls.saved], [3, 1]);
 // Finishing without the purchase, or closing, keeps the saved holding and reads the lists again.
 const other = await stockAtPaid();
 other.press('Paid from an account'); other.choose('Cash account', 'wallet');
 other.replies.purchase = async () => { throw failure('Insufficient balance or holding quantity.', true); };
 await other.submit();
 other.press('Finish without the purchase');
 other.r.fire(other.r.find(node => node.props?.['aria-label'] === 'Close'), 'onClick');
 assert.deepEqual([other.calls.saved, other.calls.closed], [2, 0]);
});

test('when the record itself fails nothing was saved, and the flow says so beside Save', async () => {
 const view = await stockAtPaid();
 view.replies.record = async () => { throw failure('Connection unavailable. Please try again.', false); };
 await view.submit();
 assert.deepEqual(view.errors(), ['Nothing was saved. Connection unavailable. Please try again.']);
 assert.deepEqual([view.calls.purchases.length, view.calls.saved, view.action()], [0, 0, 'Save']);
 assert.equal(view.r.all(node => node.props?.['aria-label'] === 'Back').length, 1, 'everything can still be changed');
 view.replies.record = async () => {};
 await view.submit();
 assert.deepEqual([view.calls.records.length, view.calls.saved, view.errors().length], [2, 1, 0]);
 // Closing before anything is saved goes through the discard guard to onClose.
 const closing = await stockAtPaid();
 closing.r.fire(closing.r.find(node => node.props?.['aria-label'] === 'Close'), 'onClick');
 assert.deepEqual([closing.calls.closed, closing.calls.saved], [1, 0]);
});

test('a price that cannot be fetched says so with Retry, and can be typed instead', async () => {
 const view = open({ currencies: ['USD', 'EUR'] });
 view.tile('Crypto');
 view.replies.quote = async () => { throw Error('Price unavailable. Saved price is shown.'); };
 await view.pick('BTC');
 assert.deepEqual(view.errors(), ['The current price could not be fetched. You can type it yourself. Retry']);
 view.replies.quote = async () => 65000;
 view.press('Retry'); await view.r.flush(3);
 assert.deepEqual(view.calls.quotes, ['BTC', 'BTC']);
 assert.deepEqual(view.errors(), []);
 await view.submit();
 assert.equal(view.number('Current price per unit').props.value, 65000);
 // The same instrument under another spelling keeps its price; another currency is another price, fetched again.
 view.replies.quote = async () => { throw Error('Exchange rate unavailable.'); };
 view.choose('Currency', 'EUR'); await view.r.flush(3);
 assert.deepEqual(view.calls.quotes, ['BTC', 'BTC', 'BTC']);
 assert.equal(view.number('Current price per unit').props.value, 0);
 assert.deepEqual(view.errors(), ['Exchange rate unavailable. Retry']);
 view.type('Current price per unit', 60000); view.type('Quantity', 0.5);
 view.replies.quote = async () => 61000;
 view.press('Retry'); await view.r.flush(3);
 assert.equal(view.number('Current price per unit').props.value, 61000);
 view.press('Fetch current price'); await view.r.flush(3);
 assert.equal(view.calls.quotes.length, 5);
 // An answer for something no longer picked is dropped.
 const late = open();
 late.tile('Stock');
 const waiting = [];
 late.replies.quote = () => new Promise(resolve => waiting.push(resolve));
 await late.pick('AAPL'); await late.pick('MSFT'); await late.pick('MSFT ');
 assert.deepEqual(late.calls.quotes, ['AAPL', 'MSFT'], 'the same ticker is not fetched twice');
 waiting[0](111); await late.r.flush(3);
 assert.doesNotMatch(late.html(), /Current price:/);
 waiting[1](420); await late.r.flush(3);
 await late.submit();
 assert.equal(late.number('Current price per unit').props.value, 420);
});

test('each kind shows only its own fields, with sensible defaults', async () => {
 // A metal: which metal, unit and purity, a name that may be left blank, and its weight.
 const metal = open();
 metal.tile('Precious metals'); await metal.r.flush(3);
 assert.deepEqual(['Metal', 'Weight unit', 'Purity', 'Name (optional)'].map(metal.has), [true, true, true, true]);
 assert.equal(metal.r.find(node => node.type === 'input').props.placeholder, 'e.g. Gold bars or coins');
 metal.choose('Metal', 'XAG'); await metal.r.flush(3);
 assert.deepEqual(metal.calls.quotes, ['XAG'], 'another metal is another price, fetched at once');
 await metal.submit();
 assert.ok(metal.has('Weight') && !metal.has('Vesting date'));
 metal.type('Weight', 100); await metal.submit(); await metal.submit();
 assert.deepEqual((({ name, metal: code, metal_unit, quantity, amount }) => [name, code, metal_unit, quantity, amount])(metal.calls.records[0]), ['Silver', 'XAG', 'g', 100, 200]);
 // Vested shares: units and one date, the vesting date; nothing to pay, so How much is the last step.
 const vested = open();
 vested.tile('Equity compensation'); await vested.pick('AAPL'); await vested.submit();
 assert.ok(vested.has('Vested units') && vested.has('Vesting date'));
 assert.equal(vested.r.all(node => node.type === stubs().DatePicker || node.type?.displayName === 'DatePicker').length, 1, 'one date, not an opening date as well');
 assert.equal(vested.action(), 'Save');
 vested.type('Vested units', 40);
 vested.r.fire(vested.date('Vesting date'), 'onChange', '2026-08-01');
 assert.equal(vested.review(), `ReviewAAPL · 40 units · ${usd(8000)} · Already owned`);
 await vested.submit();
 assert.deepEqual((({ quantity, date, opened_on }) => [quantity, date, opened_on])(vested.calls.records[0]), [40, '2026-08-01', '2026-08-01']);
 // A Treasury bill: what was invested, its yield and its two dates, under its own example name.
 const bill = open();
 bill.tile('Treasury bill');
 assert.equal(bill.r.find(node => node.type === 'input').props.placeholder, 'e.g. 6-month Treasury bill');
 await bill.submit();
 assert.deepEqual(bill.errors(), ['Enter a name.']);
 bill.r.fire(bill.r.find(node => node.type === 'input'), 'onChange', { target: { value: 'T-bill' } });
 await bill.submit();
 assert.deepEqual(['Amount invested', 'Annual yield (%)', 'Purchase date', 'Maturity date'].map(bill.has), [true, true, true, true]);
 assert.ok(!bill.has('Quantity') && !bill.has('Ownership (%)'));
 assert.deepEqual([bill.date('Purchase date').props.value, bill.date('Purchase date').props.max, bill.date('Maturity date').props.min], [today, today, today]);
 bill.r.fire(bill.date('Maturity date'), 'onChange', '2026-01-01');
 await bill.submit();
 assert.deepEqual(bill.errors(), ['Enter an amount greater than zero.', 'The maturity date cannot be before the purchase date.']);
 bill.type('Amount invested', 5000); bill.type('Annual yield (%)', 4.5);
 bill.r.fire(bill.date('Maturity date'), 'onChange', '2027-05-23');
 await bill.submit();
 assert.deepEqual((({ amount, rate, opened_on, date }) => [amount, rate, opened_on, date])(bill.calls.records[0]), [5000, 4.5, today, '2027-05-23']);
 const bond = open();
 bond.tile('Bond'); bond.r.fire(bond.r.find(node => node.type === 'input'), 'onChange', { target: { value: 'Bond' } }); await bond.submit();
 assert.ok(bond.has('Face value') && bond.has('Coupon rate (%)'));
});

test('a valued asset takes one value with its ownership and count, and can be paid from an account as Money invested', async () => {
 const view = open();
 view.tile('Property');
 view.r.fire(view.r.find(node => node.type === 'input'), 'onChange', { target: { value: 'Flat' } });
 await view.submit();
 assert.ok(view.has('Current value') && view.has('Ownership (%)') && view.has('Counted in units') && !view.has('Quantity'));
 await view.submit();
 assert.deepEqual(view.errors(), ['Enter an amount greater than zero.']);
 view.type('Current value', 90000); view.type('Ownership (%)', 0);
 await view.submit();
 assert.deepEqual(view.errors(), ['Enter a share above 0 and up to 100.']);
 assert.equal(view.calls.focused.at(-1), 'ownership');
 view.type('Ownership (%)', 50);
 // Counted in units: the value becomes the value of one, and the count and its unit are asked for.
 view.r.fire(view.r.find(node => node.type === 'input' && node.props.onCheckedChange), 'onCheckedChange', true);
 assert.ok(view.has('Value per unit') && view.has('Quantity') && view.has('Unit name'));
 await view.submit();
 assert.deepEqual(view.errors(), ['Enter a unit name.']);
 view.r.fire(view.r.find(node => node.type === 'input' && node.props.onCheckedChange), 'onCheckedChange', false);
 await view.submit();
 assert.equal(view.heading(), 'How did you pay for it?');
 assert.ok(view.has('Record date'));
 view.press('Paid from an account');
 view.choose('Cash account', 'wallet');
 assert.equal(view.number('Amount paid').props.value, 45000, 'what was paid starts at the owned value');
 await view.submit();
 assert.deepEqual(view.errors(), [`Only ${usd(5000)} available`]);
 view.type('Amount paid', 4000);
 assert.equal(view.review(), `ReviewFlat · ${usd(45000)} · paid from Wallet on 23 November 2026`);
 await view.submit();
 const record = view.calls.records[0], { purchase } = view.calls.purchases[0];
 assert.deepEqual([record.amount, record.ownership_percentage, record.quantity, record.unit_label ?? null, record.date], [90000, 50, 1, null, today], 'the asset is saved at its whole value');
 assert.deepEqual(purchase.body, { id: purchase.body.id, record_id: record.id, account_id: 'wallet', type: 'contribution', date: today, amount: 4000, balance: null, notes: '' });
 // From another currency the day's rate converts; without it the amount cannot be paid.
 const abroad = open();
 abroad.tile('Vehicle'); abroad.r.fire(abroad.r.find(node => node.type === 'input'), 'onChange', { target: { value: 'Car' } }); await abroad.submit();
 abroad.type('Current value', 1000); await abroad.submit();
 abroad.press('Paid from an account'); abroad.choose('Cash account', 'euros');
 await abroad.submit();
 assert.deepEqual(abroad.errors(), ['Historical exchange rates are unavailable.']);
 abroad.fx.rate = 1.25; abroad.r.update();
 assert.match(abroad.html(), /class="fx">rate 1\.25/);
 await abroad.submit();
 assert.deepEqual((({ url, body }) => [url, body.exchange_rate, body.amount])(abroad.calls.purchases[0].purchase), ['/api/investment-history/exchange', 1.25, 1000]);
 // When that payment fails, the asset is said to be saved at its value.
 const failed = open();
 failed.tile('Valuables'); failed.r.fire(failed.r.find(node => node.type === 'input'), 'onChange', { target: { value: 'Watch' } }); await failed.submit();
 failed.type('Current value', 800); await failed.submit();
 failed.press('Paid from an account'); failed.choose('Cash account', 'wallet');
 failed.replies.purchase = async () => { throw failure('Not enough money in the selected cash account.', true); };
 await failed.submit();
 assert.match(failed.errors()[0], /^Watch is saved at its value\. The payment from Wallet was not recorded: Not enough money in the selected cash account\./);
});

test('Add holding inside an account starts on its kind, in that account; the sample workspace says it saves in demo', async () => {
 const holdingAccounts = [{ id: 'broker', name: 'Broker', kind: 'Stock', currency: 'USD' }, { id: 'exchange', name: 'Exchange', kind: 'Crypto', currency: 'USD' }];
 const view = open({ preset: { kind: 'Stock', holdingAccountId: 'broker' }, holdingAccounts, demo: true, accountsReady: false });
 assert.equal(view.current(), 'What');
 assert.equal(view.chip(), 'StockChange');
 assert.equal(view.select('Investment account (optional)').props.value, 'broker');
 assert.deepEqual([...walk(view.select('Investment account (optional)'))].filter(node => node.type === 'option').map(node => text(node)), ['No investment account', 'Broker · Stock account'], 'only accounts that hold this kind');
 view.choose('Investment account (optional)', '');
 view.choose('Investment account (optional)', 'broker');
 await view.pick('AAPL'); await view.submit();
 view.type('Quantity', 2); await view.submit();
 assert.equal(view.action(), 'Save in demo');
 view.press('Paid from an account');
 assert.match(view.html(), /Waiting for current cash account balances\./);
 assert.equal(view.select('Cash account').props.disabled, true);
 view.press('Already owned');
 await view.submit();
 assert.equal(view.calls.records[0].holding_account_id, 'broker');
 // Without a cash account there is nothing to pay from, and the step says how to get one.
 const bare = await stockAtPaid({ accounts: [] });
 bare.press('Paid from an account');
 assert.match(bare.html(), /Add a cash account to record this transaction\./);
});
