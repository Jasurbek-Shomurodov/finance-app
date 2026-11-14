import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

const { accountStory, monthChanges, latestActivity } = loadTS('lib/account-story.ts');
const { accountMix, directoryItems } = loadTS('lib/account-directory.ts');

const base = { frequency: 'Once', notes: '', rate: 0 };
const card = { ...base, id: 'card', name: 'Card', kind: 'Cash', currency: 'USD', amount: 1000, date: '2026-01-01' };
const save = { ...base, id: 'save', name: 'Savings', kind: 'Cash', currency: 'USD', amount: 5000, date: '2026-01-01' };
const cd = { ...base, id: 'cd', name: 'CD', kind: 'Deposit', currency: 'USD', amount: 2050, rate: 5, date: '2027-01-01' };
const euro = { ...base, id: 'euro', name: 'Euro cash', kind: 'Cash', currency: 'EUR', amount: 90, date: '2026-01-01' };
const booked = (id, name, kind, amount, date, account_id = 'card') => ({ ...base, id, name, kind, amount, date, currency: 'USD', account_id });
const records = [card, save, cd, euro,
 booked('pay-nov', 'Employer', 'Salary', 3000, '2026-11-05'), booked('food-nov', 'Market', 'Living expense', 400, '2026-11-06'),
 booked('pay-oct', 'Employer', 'Salary', 3000, '2026-10-05'), booked('rent-oct', 'Landlord', 'Living expense', 1200, '2026-10-07'),
 booked('later', 'Next month', 'Living expense', 50, '2026-11-20'),
 { ...booked('bill', 'Phone', 'Living expense', 30, '2026-11-01'), frequency: 'Monthly' },
];
const activity = [
 { id: 't1', action: 'transfer', account_id: 'card', target_id: 'save', amount: 500, received: 500, fee: 0, occurred_on: '2026-11-08', notes: '', before_balance: 0, after_balance: 0 },
 { id: 'fix', action: 'reconcile', account_id: 'card', target_id: null, amount: 20, received: 0, fee: 0, occurred_on: '2026-10-20', notes: '', before_balance: 980, after_balance: 1000 },
 { id: 'old', action: 'reconcile', account_id: 'card', target_id: null, amount: 5, received: 0, fee: 0, occurred_on: '2026-09-02', notes: '' },
];
const movements = [{ id: 'int', kind: 'interest', source_id: 'cd', target_id: 'cd', sent: 0, received: 50, source_value: 0, target_value: 50, fee: 0, occurred_on: '2026-10-31', notes: '' }];
const data = { records, activity, movements, investmentLinks: [] };
const context = { data, currency: 'USD', today: '2026-11-14', rates: { USD: 1, EUR: 0.9 } };

test('an account’s six months run backwards from today’s balance: each month ended with the balance less what was recorded since', () => {
 const story = accountStory('card', 1000, context);
 assert.deepEqual(story.points.map(point => point.month), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
 // November so far: +3,000 −400 −500 transferred; the schedule and the transaction dated after today move nothing.
 assert.deepEqual([story.moneyIn, story.moneyOut], [3000, 900]);
 // October ended at 1,000 − 2,100 = −1,100; September at that less October's +3,000 −1,200 and its +20 correction.
 assert.deepEqual(story.points.map(point => point.balance), [-2920, -2920, -2920, -2920, -1100, 1000]);
 assert.equal(accountStory('card', 1000, context, 2).points.length, 2);
});

test('interest a bank added to a deposit and a reconciliation’s correction move the line without being money in or out', () => {
 const deposit = accountStory('cd', 2050, context);
 assert.deepEqual(deposit.points.slice(-3).map(point => point.balance), [2000, 2050, 2050]);
 assert.deepEqual([deposit.moneyIn, deposit.moneyOut], [0, 0]);
 // A correction saved without the balance before it says nothing about the size of the change, so it moves nothing.
 assert.equal(accountStory('card', 1000, context).points[2].balance, accountStory('card', 1000, context).points[3].balance);
});

test('each account’s change this month is in the display currency, and no figure is guessed without a rate', () => {
 assert.deepEqual(Object.fromEntries(monthChanges(context)), { card: 2100, save: 500 });
 const som = { ...booked('uzs', 'Bazaar', 'Living expense', 100000, '2026-11-03', 'card'), currency: 'UZS' };
 const unpriced = { ...context, data: { ...data, records: [...records, som] } };
 assert.equal(monthChanges(unpriced), null);
 assert.equal(accountStory('card', 1000, unpriced), null);
});

test('the latest activity of an account lists its transactions as entered and its operations signed for it, newest first', () => {
 const latest = latestActivity('card', data, 4);
 assert.deepEqual(latest.map(entry => [entry.id, entry.label, entry.name, entry.amount]), [['later', null, 'Next month', -50], ['t1', 'Transfer money', 'Savings', -500], ['food-nov', null, 'Market', -400], ['pay-nov', null, 'Employer', 3000]]);
 assert.equal(latest[0].record.id, 'later', 'a transaction opens its details');
 assert.equal(latestActivity('card', data).length, 3);
 assert.ok(!latestActivity('card', data, 99).some(entry => entry.id === 'bill'), 'a schedule is not activity');
 assert.deepEqual(latestActivity('save', data).map(entry => [entry.label, entry.name, entry.amount, entry.currency]), [['Transfer money', 'Card', 500, 'USD']]);
 assert.deepEqual(latestActivity('cd', data).map(entry => [entry.label, entry.name, entry.amount]), [['Record capitalized interest', '', 50]]);
 const corrections = latestActivity('card', data, 99).filter(entry => entry.label === 'Reconcile balance');
 assert.deepEqual(corrections.map(entry => entry.amount), [20, null], 'a correction without its balance before has no amount');
 const mortgage = { id: 'mp', action: 'mortgage', account_id: 'card', target_id: 'home', amount: 1000, received: 1000, fee: 15, occurred_on: '2026-11-10', notes: '' };
 assert.equal(latestActivity('card', { ...data, activity: [mortgage] }, 99).find(entry => entry.id === 'mp').amount, -1015, 'a mortgage payment leaves with its fee');
 assert.ok(!latestActivity('card', { ...data, activity: [{ ...mortgage, id: 'food-nov' }] }, 99).some(entry => entry.label), 'a transaction saved by an operation is listed once');
});

test('the mix adds accounts by type in one currency and leaves out of Available what savings goals hold', () => {
 const broker = { id: 'broker', name: 'Broker', kind: 'Stock', currency: 'USD' }, wallet = { id: 'coins', name: 'Coins', kind: 'Crypto', currency: 'USD' }, idle = { id: 'idle', name: 'Idle', kind: 'Cash', currency: 'USD' };
 const holding = { ...base, id: 'spy', name: 'SPY', kind: 'Stock', currency: 'USD', amount: 100, quantity: 3, holding_account_id: 'broker' };
 const parked = { ...base, id: 'parked', name: 'Parked cash', kind: 'Cash', currency: 'USD', amount: 40, holding_account_id: 'idle' };
 const items = directoryItems({ records: [card, save, cd, euro, holding, parked], holdingAccounts: [broker, wallet, idle] }, null);
 const goals = [{ id: 'g', account_id: 'save', allocated: 1500, archived: false }, { id: 'old', account_id: 'save', allocated: 900, archived: true }, { id: 'e', account_id: 'euro', allocated: 45, archived: false }];
 const convert = (amount, from) => from === 'EUR' ? amount / 0.9 : amount;
 const mix = accountMix(items, goals, convert);
 // An empty crypto account has nothing to draw.
 assert.deepEqual(mix.segments, [{ kind: 'Cash', amount: 6100 }, { kind: 'Deposit', amount: 2050 }, { kind: 'Stock', amount: 300 }, { kind: 'Cash investment account', amount: 40 }]);
 assert.equal(mix.available, 6100 - 1500 - 50);
 assert.equal(accountMix(items, goals, (amount, from) => from === 'EUR' ? null : amount), null, 'no share from a partial total');
 assert.equal(accountMix([{ ...items[0], total: null }], goals, convert), null);
});
