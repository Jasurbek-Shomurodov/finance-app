import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { earnsMonthly, gainSinceBought, holdingGain, monthlyAssetIncome } = loadTS('lib/holding-figures.ts');

// Investments: one live figure per holding, and the sums the page adds from them (2026 redesign).
const entry = (name, kind, amount, extra = {}) => ({ id: name, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date: '2026-01-01', frequency: 'Once', notes: '', ...extra });
const priced = (record, rate = 1) => ({ original: record, converted: rate === null ? null : { ...record, currency: 'EUR', amount: record.amount * rate, cost: record.cost * rate, estimated_monthly_income: (record.estimated_monthly_income ?? 0) * rate } });

test('a unit-priced holding gains its price change times its quantity; without a purchase cost it has no gain', () => {
 assert.equal(holdingGain(entry('VOO', 'Stock', 520, { quantity: 180, cost: 410 })), 19800);
 assert.equal(holdingGain(entry('BTC', 'Crypto', 60000, { quantity: 0.5, cost: 70000 })), -5000, 'a loss stays negative');
 assert.equal(holdingGain(entry('GOOGL', 'Equity compensation', 165, { quantity: 60, cost: 0 })), null);
 assert.equal(holdingGain(entry('Home', 'Property', 540000, { cost: 400000 })), null, 'a valued asset has no quoted gain');
});

test('an account adds the gains of the holdings that have a cost, in the display currency', () => {
 const holdings = [priced(entry('A', 'Stock', 120, { quantity: 10, cost: 100 }), 0.5), priced(entry('B', 'Stock', 50, { quantity: 2, cost: 60 }), 0.5), priced(entry('C', 'Stock', 30, { quantity: 4 }), 0.5)];
 assert.deepEqual(gainSinceBought(holdings), { amount: 90, count: 2 });
 assert.deepEqual(gainSinceBought([priced(entry('C', 'Stock', 30))]), { amount: 0, count: 0 }, 'no purchase cost, no gain figure');
 // One holding without a rate leaves the sum missing rather than adding a partial figure under the wrong label.
 assert.deepEqual(gainSinceBought([holdings[0], priced(entry('D', 'Stock', 10, { cost: 5 }), null)]), { amount: null, count: 2 });
});

test('income from assets adds rentals, businesses and interest until their term ends', () => {
 const condo = entry('Condo', 'Property', 285000, { estimated_monthly_income: 2100 });
 const cd = entry('CD', 'Deposit', 20000, { rate: 4.6, estimated_monthly_income: 76.67, interest_ends: '2026-10-15' });
 const car = entry('Car', 'Vehicle', 24000, { estimated_monthly_income: 50 });
 assert.ok(earnsMonthly(condo, '2026-11') && earnsMonthly(cd, '2026-10') && !earnsMonthly(cd, '2026-11') && !earnsMonthly(car, '2026-11'));
 assert.deepEqual(monthlyAssetIncome([priced(condo), priced(cd), priced(car)], '2026-10'), { amount: 2176.67, count: 2 });
 assert.deepEqual(monthlyAssetIncome([priced(condo, 2), priced(cd, 2)], '2026-11'), { amount: 4200, count: 1 }, 'converted, and a matured deposit earns nothing');
 assert.deepEqual(monthlyAssetIncome([priced(condo), priced(cd, null)], '2026-10'), { amount: null, count: 2 }, 'a missing rate reads as missing');
});
