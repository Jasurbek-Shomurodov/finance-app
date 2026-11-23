import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

const { choosableAssetKinds, assetSteps, purchaseKind, instrumentKind, newAssetDraft, withKind, withCost, withQuote, totalPaid, draftWorth, amountPaid, debitOf, assetProblems, firstProblem, assetSavePlan, demoPurchase } = loadTS('lib/add-asset.ts');
const { unitQuote, quoteKey } = loadTS('lib/unit-quote.ts');
const { namePlaceholder } = loadTS('lib/record-names.ts');

const today = '2026-11-23';
let seq = 0;
const ids = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const wallet = { id: 'wallet', name: 'Wallet', kind: 'Cash', currency: 'USD', amount: 5000 };
const euros = { id: 'euros', name: 'Euro cash', kind: 'Cash', currency: 'EUR', amount: 900 };
const deposit = { id: 'deposit', name: 'Deposit', kind: 'Deposit', currency: 'USD', amount: 9000 };
const accounts = [wallet, euros, deposit];
const context = { today, accounts };
const start = (kind, patch = {}) => { const draft = withKind(newAssetDraft('USD', today, ids), kind, today); return { ...draft, entry: { ...draft.entry, ...patch } }; };
const paying = (draft, pay) => ({ ...draft, pay: { ...draft.pay, from: 'account', account_id: 'wallet', ...pay } });
const messages = problems => Object.fromEntries(Object.entries(problems).map(([field, problem]) => [field, problem.message]));

test('every asset kind but cash and deposits is a tile, and only kinds an account can pay for get a Paid from step', () => {
 assert.deepEqual(choosableAssetKinds, ['Stock', 'Crypto', 'Precious metals', 'Equity compensation', 'Treasury bill', 'Bond', 'Retirement account', 'Property', 'Business', 'Vehicle', 'Valuables']);
 for (const kind of ['Stock', 'Crypto', 'Precious metals']) { assert.equal(purchaseKind(kind), 'buy', kind); assert.deepEqual(assetSteps(kind), ['kind', 'what', 'amount', 'paid']); }
 for (const kind of ['Property', 'Vehicle', 'Valuables', 'Retirement account']) { assert.equal(purchaseKind(kind), 'contribution', kind); assert.equal(assetSteps(kind).at(-1), 'paid'); }
 // Vested shares are not bought, and a bill's or a bond's purchase is not recorded through the Tracker here.
 for (const kind of ['Equity compensation', 'Treasury bill', 'Bond', 'Business']) { assert.equal(purchaseKind(kind), null, kind); assert.deepEqual(assetSteps(kind), ['kind', 'what', 'amount']); }
 assert.deepEqual(['Stock', 'Equity compensation', 'Crypto', 'Property', 'Precious metals'].map(instrumentKind), ['Stock', 'Stock', 'Crypto', null, null]);
});

test('a new flow is blank, in the workspace currency and dated today; a preset starts on its kind inside its account', () => {
 const blank = newAssetDraft('EUR', today, ids);
 assert.equal(blank.chosen, false);
 assert.deepEqual([blank.entry.currency, blank.entry.date, blank.pay.from, blank.pay.date, blank.pay.paid], ['EUR', today, 'owned', today, null]);
 assert.notEqual(blank.entry.id, blank.pay.id);
 const preset = newAssetDraft('EUR', today, ids, { kind: 'Crypto', holdingAccountId: 'exchange', currency: 'USD' });
 assert.deepEqual([preset.chosen, preset.entry.kind, preset.entry.holding_account_id, preset.entry.currency, preset.entry.quantity], [true, 'Crypto', 'exchange', 'USD', 0]);
 assert.equal(newAssetDraft('EUR', today, ids, { kind: 'Stock' }).entry.currency, 'EUR');
});

test('choosing a kind sets its defaults; changing it keeps only what still means the same', () => {
 const metal = start('Precious metals');
 assert.deepEqual([metal.entry.metal, metal.entry.metal_unit, metal.entry.metal_purity, metal.entry.quantity], ['XAU', 'g', 0.9999, 0]);
 const property = start('Property', { name: 'Flat', amount: 90000, ownership_percentage: 50 });
 assert.deepEqual([property.entry.quantity, property.entry.opened_on], [1, null]);
 // Another valued kind keeps the name, the value and the share.
 const vehicle = withKind(property, 'Vehicle', today);
 assert.deepEqual([vehicle.entry.kind, vehicle.entry.name, vehicle.entry.amount, vehicle.entry.ownership_percentage], ['Vehicle', 'Flat', 90000, 50]);
 // A stock's ticker, price and cost survive a change to vested shares of the same company, and nothing else.
 const stock = withCost(withQuote(start('Stock', { name: 'AAPL' }), 200), 'quantity', 3);
 const vested = withKind(stock, 'Equity compensation', today);
 assert.deepEqual([vested.entry.name, vested.entry.amount, vested.entry.quantity, vested.entry.cost], ['AAPL', 200, 3, 200]);
 const coin = withKind(paying(stock, {}), 'Crypto', today);
 assert.deepEqual([coin.entry.name, coin.entry.amount, coin.entry.quantity, coin.entry.cost, coin.costs.typed, coin.pay.from], ['', 0, 0, 0, false, 'account']);
 // A kind no account pays for goes back to Already owned; the same kind again changes nothing.
 assert.equal(withKind(paying(stock, {}), 'Bond', today).pay.from, 'owned');
 assert.equal(withKind(stock, 'Stock', today), stock);
 assert.equal(withKind(stock, 'Property', today).entry.ownership_percentage, 100);
});

test('quantity, unit price and total: the two typed last decide the third, and a quote fills the price until one is typed', () => {
 let draft = withQuote(start('Stock', { name: 'AAPL' }), 200);
 assert.deepEqual([draft.entry.amount, draft.entry.cost, draft.costs.typed], [200, 200, false]);
 draft = withCost(draft, 'quantity', 4);
 assert.deepEqual([draft.entry.quantity, totalPaid(draft), draft.costs.typed], [4, 800, false]);
 // A later quote still follows, because nothing about the price was typed.
 draft = withQuote(draft, 210);
 assert.deepEqual([draft.entry.cost, totalPaid(draft)], [210, 840]);
 // Typing the total works out the unit price to eight decimals, and the quote no longer overwrites it.
 draft = withCost(draft, 'total', 1000);
 assert.deepEqual([draft.entry.cost, totalPaid(draft), draft.costs.typed], [250, 1000, true]);
 draft = withQuote(draft, 300);
 assert.deepEqual([draft.entry.amount, draft.entry.cost, totalPaid(draft)], [300, 250, 1000]);
 assert.equal(draftWorth(draft).full, 1200);
 // Typing the price after the total keeps both and works out the quantity.
 draft = withCost(draft, 'cost', 125);
 assert.equal(draft.entry.quantity, 8);
 assert.equal(withCost(start('Crypto'), 'total', 100).entry.cost, 0, 'a total without a quantity divides nothing');
});

test('What: a holding needs its instrument, anything else a name, and a metal may be left unnamed', () => {
 assert.deepEqual(messages(assetProblems(start('Stock'), 'what', context)), { name: 'Choose a stock or ETF.' });
 assert.deepEqual(messages(assetProblems(start('Equity compensation', { name: 'not a ticker!' }), 'what', context)), { name: 'Choose a stock or ETF.' });
 assert.deepEqual(messages(assetProblems(start('Crypto', { name: 'Dogecoin?' }), 'what', context)), { name: 'Choose a coin.' });
 assert.deepEqual(assetProblems(start('Crypto', { name: 'BTC' }), 'what', context), {});
 assert.deepEqual(messages(assetProblems(start('Property', { name: '  ' }), 'what', context)), { name: 'Enter a name.' });
 assert.deepEqual(assetProblems(start('Precious metals'), 'what', { ...context, optionalName: true }), {});
 assert.deepEqual(assetProblems(newAssetDraft('USD', today, ids), 'kind', context), {});
});

test('How much: zero or negative quantities, prices and values are refused, each under its own field', () => {
 const stock = start('Stock', { name: 'AAPL' });
 assert.deepEqual(messages(assetProblems(stock, 'amount', context)), { quantity: 'Enter a quantity greater than zero.', price: 'Enter the current price per unit.' });
 assert.deepEqual(messages(assetProblems({ ...stock, entry: { ...stock.entry, quantity: -2, amount: 10 } }, 'amount', context)), { quantity: 'Enter a quantity greater than zero.' });
 assert.deepEqual(assetProblems(withCost(withQuote(stock, 10), 'quantity', 1), 'amount', context), {});
 assert.deepEqual(messages(assetProblems(start('Equity compensation', { name: 'AAPL', quantity: 5, amount: 10, date: '' }), 'amount', context)), { vesting: 'Date is required.' });
 // A valued asset: its value, a counted asset's count and unit, and a share that can be owned.
 const herd = start('Business', { name: 'Herd', amount: 0, unit_label: ' ', quantity: 0, ownership_percentage: 0 });
 assert.deepEqual(messages(assetProblems(herd, 'amount', context)), { value: 'Enter an amount greater than zero.', units: 'Enter a quantity greater than zero.', unit: 'Enter a unit name.', ownership: 'Enter a share above 0 and up to 100.' });
 assert.equal(firstProblem(assetProblems(herd, 'amount', context)), 'value');
 assert.deepEqual(messages(assetProblems(start('Property', { amount: 10, ownership_percentage: 101 }), 'amount', context)), { ownership: 'Enter a share above 0 and up to 100.' });
 assert.deepEqual(assetProblems(start('Vehicle', { amount: 10, unit_label: 'trucks', quantity: 3, ownership_percentage: 60 }), 'amount', context), {});
 // A bill or a bond: an amount, a purchase date that has come and a maturity date after it.
 const bill = start('Treasury bill', { amount: 0, opened_on: '2026-12-01', date: '2026-11-01' });
 assert.deepEqual(messages(assetProblems(bill, 'amount', context)), { value: 'Enter an amount greater than zero.', date: 'Choose today or an earlier date.', maturity: 'The maturity date cannot be before the purchase date.' });
 assert.deepEqual(messages(assetProblems(start('Bond', { amount: 100, opened_on: null, date: '' }), 'amount', context)), { date: 'Date is required.', maturity: 'Date is required.' });
 assert.deepEqual(assetProblems(start('Bond', { amount: 100, opened_on: today, date: '2030-01-01' }), 'amount', context), {});
});

test('Paid from: already owned needs only a day that has come; an account needs the account, an amount and enough money', () => {
 const stock = withCost(withQuote(start('Stock', { name: 'AAPL' }), 100), 'quantity', 10);
 assert.deepEqual(assetProblems(stock, 'paid', context), {});
 assert.deepEqual(messages(assetProblems({ ...stock, pay: { ...stock.pay, date: '2026-11-24' } }, 'paid', context)), { date: 'Choose today or an earlier date.' });
 assert.deepEqual(messages(assetProblems({ ...stock, pay: { ...stock.pay, date: '' } }, 'paid', context)), { date: 'Date is required.' });
 assert.deepEqual(messages(assetProblems(paying(stock, { account_id: '' }), 'paid', context)), { account: 'Choose a cash account.' });
 assert.deepEqual(messages(assetProblems(paying(stock, { account_id: 'deposit' }), 'paid', context)), { account: 'Choose a cash account.' }, 'only cash accounts pay');
 assert.deepEqual(assetProblems(paying(stock, {}), 'paid', context), {});
 assert.equal(debitOf(paying(stock, {}), wallet), 1000);
 // No total typed, then more than the account holds.
 assert.deepEqual(messages(assetProblems(paying(withCost(stock, 'total', 0), {}), 'paid', context)), { total: 'Enter what you paid in total.' });
 assert.deepEqual(assetProblems(paying(withCost(stock, 'total', 6000), {}), 'paid', context), { total: { message: 'Only {amount} available', money: { amount: 5000, currency: 'USD' } } });
 // In another currency the Buy takes what left the account as typed, with no rate assumed.
 assert.deepEqual(messages(assetProblems(paying(stock, { account_id: 'euros' }), 'paid', context)), { debited: 'Enter an amount greater than zero.' });
 assert.deepEqual(assetProblems(paying(stock, { account_id: 'euros', debited: 950 }), 'paid', context).debited, { message: 'Only {amount} available', money: { amount: 900, currency: 'EUR' } });
 assert.deepEqual(assetProblems(paying(stock, { account_id: 'euros', debited: 900 }), 'paid', context), {});
 // A valued asset is paid at its owned value in whole units unless another amount is typed; another currency needs the day's rate.
 const flat = start('Property', { name: 'Flat', amount: 3000.4, ownership_percentage: 50 });
 assert.equal(amountPaid(flat), 1500);
 assert.deepEqual(assetProblems(paying(flat, {}), 'paid', context), {});
 assert.deepEqual(messages(assetProblems(paying(flat, { paid: 0 }), 'paid', context)), { paid: 'Enter an amount greater than zero.' });
 assert.deepEqual(messages(assetProblems(paying(flat, { paid: 5001 }), 'paid', context)), { paid: 'Only {amount} available' });
 assert.deepEqual(messages(assetProblems(paying(flat, { account_id: 'euros' }), 'paid', { ...context, rate: null })), { paid: 'Historical exchange rates are unavailable.' });
 assert.equal(debitOf(paying(flat, { account_id: 'euros' }), euros, null), null);
 assert.equal(debitOf(paying(flat, { account_id: 'euros' }), euros, 2), 750);
 assert.deepEqual(messages(assetProblems(paying(flat, { account_id: 'euros' }), 'paid', { ...context, rate: 1.5 })), { paid: 'Only {amount} available' });
});

test('already owned saves the record alone, as the record form does', () => {
 const stock = withCost(withQuote(start('Stock', { name: ' AAPL ' }), 100), 'quantity', 10);
 const plan = assetSavePlan({ ...stock, pay: { ...stock.pay, date: '2026-10-01' } }, context);
 assert.equal(plan.purchase, null);
 assert.deepEqual([plan.record.name, plan.record.quantity, plan.record.amount, plan.record.cost, plan.record.opened_on, plan.record.date], ['AAPL', 10, 100, 100, '2026-10-01', '2026-10-01']);
 // Vested shares have one date: the record opens on it, never later than today.
 const vested = start('Equity compensation', { name: 'AAPL', quantity: 5, amount: 10 });
 assert.equal(assetSavePlan({ ...vested, entry: { ...vested.entry, date: '2027-03-01' } }, context).record.opened_on, today);
 assert.deepEqual((({ opened_on, date }) => [opened_on, date])(assetSavePlan({ ...vested, entry: { ...vested.entry, date: '2026-03-01' } }, context).record), ['2026-03-01', '2026-03-01']);
 const bond = assetSavePlan(start('Bond', { name: 'Bond', amount: 100, opened_on: '2026-01-01', date: '2030-01-01' }), context).record;
 assert.deepEqual([bond.opened_on, bond.date], ['2026-01-01', '2030-01-01']);
 const herd = assetSavePlan(start('Business', { name: 'Herd', amount: 40, quantity: 1300, unit_label: ' sheep ', ownership_percentage: 60 }), context).record;
 assert.deepEqual([herd.unit_label, herd.quantity, herd.amount, herd.ownership_percentage, herd.date, herd.opened_on], ['sheep', 1300, 40, 60, today, null]);
 // A metal left unnamed is saved under the name the flow passes for it.
 assert.equal(assetSavePlan(start('Precious metals', { quantity: 5, amount: 90 }), { ...context, name: 'Gold' }).record.name, 'Gold');
});

test('paid from an account: a holding is saved empty and a Buy fills it; a valued asset is saved whole and Money invested debits the account', () => {
 const stock = paying(withCost(withCost(withQuote(start('Stock', { name: 'AAPL' }), 100), 'quantity', 10), 'total', 1010), { date: '2026-11-20' });
 const buy = assetSavePlan(stock, context);
 assert.deepEqual([buy.record.quantity, buy.record.cost, buy.record.amount, buy.record.opened_on], [0, 0, 100, '2026-11-20']);
 assert.deepEqual(buy.purchase, { kind: 'buy', url: '/api/asset-movements', account_id: 'wallet', debit: 1010, holding: { quantity: 10, cost: 101 },
  body: { id: stock.pay.id, kind: 'buy', source_id: 'wallet', target_id: stock.entry.id, sent: 1010, received: 10, source_value: 1010, target_value: 1010, fee: 0, date: '2026-11-20', notes: '' } });
 // From another currency both amounts are kept as typed.
 const abroad = assetSavePlan(paying(stock, { account_id: 'euros', debited: 880 }), context).purchase;
 assert.deepEqual([abroad.body.sent, abroad.body.source_value, abroad.body.target_value, abroad.debit], [880, 880, 1010, 880]);
 const flat = paying(start('Property', { name: 'Flat', amount: 3000, ownership_percentage: 50 }), { paid: 1400 });
 const invested = assetSavePlan(flat, context);
 assert.equal(invested.record.amount, 3000);
 assert.deepEqual(invested.purchase, { kind: 'contribution', url: '/api/investment-history', account_id: 'wallet', debit: 1400,
  body: { id: flat.pay.id, record_id: flat.entry.id, account_id: 'wallet', type: 'contribution', date: today, amount: 1400, balance: null, notes: '' } });
 const converted = assetSavePlan(paying(flat, { account_id: 'euros' }), { ...context, rate: 2 }).purchase;
 assert.deepEqual([converted.url, converted.body.exchange_rate, converted.debit], ['/api/investment-history/exchange', 2, 700]);
 // Without a usable account or amount there is nothing to pay: the record alone.
 assert.equal(assetSavePlan(paying(flat, { account_id: 'gone' }), context).purchase, null);
 assert.equal(assetSavePlan(paying(start('Bond', { amount: 5 }), {}), context).purchase, null);
});

test('the sample workspace applies the purchase to its own rows', () => {
 const stock = paying(withCost(withQuote(start('Stock', { name: 'AAPL' }), 100), 'quantity', 10), {});
 const plan = assetSavePlan(stock, context);
 const rows = demoPurchase([...accounts, plan.record], plan);
 assert.equal(rows.find(row => row.id === 'wallet').amount, 4000);
 assert.deepEqual((({ quantity, cost }) => [quantity, cost])(rows.find(row => row.id === stock.entry.id)), [10, 100]);
 assert.equal(rows.find(row => row.id === 'euros'), euros);
 const flat = paying(start('Property', { name: 'Flat', amount: 3000 }), {}), flatPlan = assetSavePlan(flat, context);
 const after = demoPurchase([wallet, flatPlan.record], flatPlan);
 assert.deepEqual([after[0].amount, after[1].amount], [2000, 3000]);
 assert.deepEqual(demoPurchase([wallet], { record: flatPlan.record, purchase: null }), [wallet]);
});

test('a unit quote is read in the holding’s currency to eight decimals, and says why when it cannot be', () => {
 const btc = { id: 'b', kind: 'Crypto', name: 'BTC', currency: 'USD' };
 const market = { quotes: { 'Crypto:BTC': { usd: 65000.123456789 } }, errors: {}, rates: { USD: 1, UZS: 12014.44543183 }, fx: null, stocksConfigured: false };
 assert.equal(unitQuote(btc, market), 65000.12345679);
 assert.equal(unitQuote({ ...btc, currency: 'UZS' }, market), Math.round(65000.123456789 * 12014.44543183 * 1e8) / 1e8);
 assert.throws(() => unitQuote({ ...btc, currency: 'EUR' }, market), /Exchange rate unavailable\./);
 assert.throws(() => unitQuote({ ...btc, name: 'ETH' }, { ...market, errors: { 'Crypto:ETH': 'Rate limited.' } }), /Rate limited\./);
 assert.throws(() => unitQuote({ ...btc, name: 'ETH' }, market), /Price unavailable/);
 assert.throws(() => unitQuote({ ...btc, name: 'no such coin' }, market), /Price unavailable/);
 assert.notEqual(quoteKey(btc), quoteKey({ ...btc, currency: 'EUR' }));
 assert.notEqual(quoteKey({ ...btc, kind: 'Precious metals', metal: 'XAU' }), quoteKey({ ...btc, kind: 'Precious metals', metal: 'XAG' }));
});

test('a Treasury bill has its own example name, not a savings account’s', () => {
 assert.equal(namePlaceholder('Treasury bill', false), 'e.g. 6-month Treasury bill');
 assert.equal(namePlaceholder('Cash', false), 'e.g. Savings account');
 assert.equal(namePlaceholder('Other expense', true), 'e.g. Rent or internet subscription');
 assert.equal(namePlaceholder('Salary', true), 'e.g. Monthly salary');
});
