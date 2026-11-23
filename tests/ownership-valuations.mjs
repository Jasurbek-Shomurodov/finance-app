import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

const finance = loadTS('lib/finance.ts');
const { value, fullValue, ownedShare, ownedPercent, shareOf, isCounted, ownAmount, wholeAmount, financialTotals, totalValue, valuedKinds } = finance;
const { reportLedger, profitAndLoss, linesOn } = loadTS('lib/business-report.ts');
const { historySeries, historyPerformance, historyUpdateTypes } = loadTS('lib/investment-history.ts');
const { currentParts } = loadTS('lib/portfolio-history.ts');
const { changeRecordKind } = loadTS('lib/record-kind.ts');
const { recordSchema } = loadTS('lib/record-schema.ts');
const { assetPaymentEvents } = loadTS('lib/asset-payments.ts');
const { cashFlowItems, spendingAmount } = loadTS('lib/spending.ts');
const { demoRecords } = loadTS('lib/demo-finance.ts');

const base = { currency: 'USD', quantity: 1, cost: 0, rate: 0, date: '2026-01-01', frequency: 'Once', notes: '', ownership_percentage: 100 };
const entry = (id, kind, amount, extra = {}) => ({ ...base, id, name: id, kind, amount, ...extra });
const id = n => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('ownedShare is the one rule: every valued kind counts at its share, everything else in full', () => {
 for (const kind of valuedKinds) {
  assert.equal(value(entry('a', kind, 80000, { ownership_percentage: 50 })), 40000, kind);
  assert.equal(ownedShare(entry('a', kind, 1, { ownership_percentage: 60 })), 0.6, kind);
 }
 // A share stored on anything else is ignored, as it always was.
 for (const kind of ['Cash', 'Deposit', 'Money lent', 'Loan', 'Salary']) assert.equal(value(entry('a', kind, 700, { ownership_percentage: 10 })), 700, kind);
 assert.equal(value(entry('a', 'Stock', 100, { quantity: 3, ownership_percentage: 10 })), 300);
 assert.equal(ownedPercent(entry('a', 'Business', 1, { ownership_percentage: undefined })), 100, 'a missing share is the whole asset');
});

test('a full share never touches the amount, and a part share keeps the old arithmetic', () => {
 // 0.07 × 100 / 100 is not 0.07 in floating point; a full share must return the amount itself.
 for (const amount of [0.07, 0.1 + 0.2, 13782.113487716848, 1e15, 0]) {
  assert.equal(shareOf(amount, 100), amount);
  assert.equal(value(entry('a', 'Property', amount)), amount);
 }
 // The Business rule from before this change: amount × percent / 100, in that order.
 assert.equal(value(entry('b', 'Business', 55000, { ownership_percentage: 40 })), 55000 * 40 / 100);
 assert.equal(value(entry('b', 'Business', 123456.78, { ownership_percentage: 33.333333 })), 123456.78 * 33.333333 / 100);
});

test('a counted asset is quantity × value per unit, at the owned share', () => {
 const sheep = entry('sheep', 'Business', 85, { quantity: 1300, unit_label: 'sheep', ownership_percentage: 50 });
 assert.equal(isCounted(sheep), true);
 assert.equal(fullValue(sheep), 110500);
 assert.equal(value(sheep), 55250);
 // Without a unit name the quantity column means nothing, whatever it holds: existing rows read as before.
 for (const quantity of [0, 1, 3, 1300]) assert.equal(value(entry('flat', 'Property', 90000, { quantity })), 90000, String(quantity));
 // A unit name on a kind that is not valued by hand is not a count.
 assert.equal(isCounted(entry('x', 'Cash', 5, { quantity: 4, unit_label: 'coins' })), false);
 assert.equal(value(entry('x', 'Cash', 5, { quantity: 4, unit_label: 'coins' })), 5);
 // Revaluing: 1,000 × 80, then 1,300 × 85.
 assert.equal(value({ ...sheep, amount: 80, quantity: 1000 }), 40000);
 assert.equal(totalValue([sheep, entry('club', 'Business', 40000, { ownership_percentage: 60 })], ['Business']), 55250 + 24000);
});

test('totals, today\'s parts and a workspace without businesses', () => {
 const plain = [entry('cash', 'Cash', 1200.5), entry('aapl', 'Stock', 190.25, { quantity: 3 }), entry('flat', 'Property', 90000, { quantity: 0 }), entry('car', 'Vehicle', 9000), entry('loan', 'Loan', 4000), entry('pay', 'Salary', 5000)];
 // Exactly what the rule before ownership gave: amounts as stored, holdings by quantity.
 assert.deepEqual(financialTotals(plain), { totalAssets: 1200.5 + 190.25 * 3 + 90000 + 9000, totalDebt: 4000, netWorth: 1200.5 + 190.25 * 3 + 90000 + 9000 - 4000, receivable: 0, netLending: -4000, cash: 1200.5 });
 assert.deepEqual(currentParts(plain), { Cash: 1200.5, Stock: 190.25 * 3, Property: 90000, Vehicle: 9000, Debt: -4000 });
 const owned = [...plain, entry('sheep', 'Business', 85, { quantity: 1300, unit_label: 'sheep', ownership_percentage: 50 }), entry('land', 'Property', 40000, { ownership_percentage: 25 })];
 assert.equal(financialTotals(owned).totalAssets, financialTotals(plain).totalAssets + 55250 + 10000);
 assert.equal(currentParts(owned).Business, 55250);
 assert.equal(currentParts(owned).Property, 100000);
 // A cash account of a part-owned business counts in full (the decision in docs/product-map.md).
 assert.equal(financialTotals([entry('club', 'Business', 0, { ownership_percentage: 60 }), entry('till', 'Cash', 900, { business_id: 'club' })]).cash, 900);
});

test('history keeps the share each value was recorded at', () => {
 const event = (n, date, balance, share, extra = {}) => ({ id: 'e' + n, record_id: 'sheep', event_type: n === 1 ? 'baseline' : 'valuation', occurred_on: date, created_at: date + 'T10:00:00Z', amount: 0, balance, ownership_percentage: share, principal: 0, interest: 0, notes: '', ...extra });
 const events = [event(1, '2025-01-10', 80000, 50, { quantity: 1000, unit_value: 80 }), event(2, '2026-01-10', 110500, 50, { quantity: 1300, unit_value: 85 }), event(3, '2026-06-01', 110500, 60)];
 const series = historySeries(events);
 // Before the share changed, the old share still stands on its own day.
 assert.deepEqual(series.points.map(point => [point.date, point.balance]), [['2025-01-10', 40000], ['2026-01-10', 55250], ['2026-06-01', 66300]]);
 assert.deepEqual([series.fullBalance, series.ownership, series.balance, series.quantity, series.unitValue], [110500, 60, 66300, 1300, 85]);
 const performance = historyPerformance(events);
 assert.deepEqual([performance.first, performance.change], [40000, 26300]);
 // A history with no counted value has no count.
 assert.deepEqual([historySeries([event(1, '2026-01-01', 500, 100)]).quantity, historySeries([event(1, '2026-01-01', 500, 100)]).unitValue], [null, null]);
});

test('a business and a property enter income and expenses as transactions; other valued assets keep the Tracker entries', () => {
 assert.deepEqual(historyUpdateTypes('Business'), ['valuation', 'contribution', 'withdrawal']);
 assert.deepEqual(historyUpdateTypes('Property'), ['valuation', 'contribution', 'withdrawal']);
 for (const kind of ['Vehicle', 'Valuables', 'Retirement account']) assert.deepEqual(historyUpdateTypes(kind), ['valuation', 'contribution', 'withdrawal', 'income', 'expense'], kind);
 assert.deepEqual(historyUpdateTypes('Stock'), ['valuation', 'income', 'expense']);
});

test('whole or mine: a whole-business figure counts at the share it was linked at', () => {
 const whole = { amount: 1000, business_id: 'club', amount_basis: 'whole', business_share: 60 };
 const mine = { amount: 300, business_id: 'club', amount_basis: 'mine', business_share: 60 };
 assert.equal(ownAmount(whole), 600);
 assert.equal(wholeAmount(whole), 1000);
 assert.equal(ownAmount(mine), 300);
 assert.equal(wholeAmount(mine), 500);
 // Rows from before the share was kept, and rows of no business, are the same either way.
 for (const row of [{ amount: 700, business_id: 'club' }, { amount: 700, business_id: 'club', amount_basis: 'mine', business_share: null }, { amount: 700 }, { amount: 700, amount_basis: 'whole' }, { amount: 700, business_id: 'club', amount_basis: 'whole', business_share: 100 }]) {
  assert.equal(ownAmount(row), 700);
  assert.equal(wholeAmount(row), 700);
 }
 // Precision: no tail is invented where the share divides evenly, and a third stays a third.
 assert.equal(ownAmount({ amount: 0.3, business_id: 'b', amount_basis: 'whole', business_share: 50 }), 0.15);
 assert.equal(ownAmount({ amount: 100, business_id: 'b', amount_basis: 'whole', business_share: 33.333333 }), 33.333333);
 // The one definition of spending and the cash-flow walk read the owner's share.
 const feed = entry('feed', 'Other expense', 200, { date: '2026-03-02', business_id: 'sheep', amount_basis: 'whole', business_share: 50 });
 const sale = entry('sale', 'Business income', 1000, { date: '2026-03-03', business_id: 'sheep', amount_basis: 'whole', business_share: 50 });
 assert.equal(spendingAmount(feed), 100);
 assert.deepEqual([...cashFlowItems([feed, sale], '2026-03-01', '2026-03-31')].map(item => [item.id, item.amount, item.parts.map(part => part.amount)]), [['feed', 100, [100]], ['sale', 500, []]]);
 // A split whole-business expense: each part at the share.
 assert.deepEqual([...cashFlowItems([feed], '2026-03-01', '2026-03-31', { splits: [{ record_id: 'feed', category_id: 'Other expense', amount: 150 }, { record_id: 'feed', category_id: 'Charity', amount: 50 }] })][0].parts.map(part => part.amount), [75, 25]);
});

test('profit and loss shows your share by default and the whole business on request', () => {
 const records = [
  entry('club', 'Business', 40000, { ownership_percentage: 60 }),
  entry('tickets', 'Business income', 1000, { date: '2026-03-01', business_id: 'club', amount_basis: 'whole', business_share: 60 }),
  entry('payout', 'Business income', 300, { date: '2026-03-05', business_id: 'club', amount_basis: 'mine', business_share: 60 }),
  entry('rent', 'Other expense', 400, { date: '2026-03-06', business_id: 'club', amount_basis: 'whole', business_share: 60 }),
  entry('old', 'Other expense', 50, { date: '2026-03-07', business_id: 'club' }),
  entry('salary', 'Salary', 2000, { date: '2026-03-08' }),
  entry('food', 'Living expense', 500, { date: '2026-03-09' }),
 ];
 const { lines, missing } = reportLedger({ records, investmentLinks: [] }, [], { from: '2026-03-01', to: '2026-03-31' }, 'USD', '2026-03-31', { USD: 1 });
 assert.equal(missing, 0);
 const by = Object.fromEntries(lines.map(line => [line.id, [line.amount, line.whole, line.entered.amount]]));
 // Mine, whole, and the amount as it was entered (a single transaction always reads as entered).
 assert.deepEqual(by, { tickets: [600, 1000, 1000], payout: [300, 500, 300], rent: [240, 400, 400], old: [50, 50, 50], salary: [2000, 2000, 2000], food: [500, 500, 500] });
 const key = line => line.category;
 const mine = profitAndLoss(linesOn(lines, 'mine'), ['club'], key, true), whole = profitAndLoss(linesOn(lines, 'whole'), ['club'], key, true);
 assert.deepEqual([mine.businesses[0].grossIncome, mine.businesses[0].totalExpenses, mine.businesses[0].net], [900, 290, 610]);
 assert.deepEqual([whole.businesses[0].grossIncome, whole.businesses[0].totalExpenses, whole.businesses[0].net], [1500, 450, 1050]);
 // The household is the same under both, and 'mine' is the lines untouched.
 assert.deepEqual(mine.household, whole.household);
 assert.equal(linesOn(lines, 'mine'), lines);
 // A workspace with no businesses reports the same figures under either basis.
 const plain = reportLedger({ records: records.slice(5), investmentLinks: [] }, [], { from: '2026-03-01', to: '2026-03-31' }, 'USD', '2026-03-31', { USD: 1 }).lines;
 assert.deepEqual(profitAndLoss(linesOn(plain, 'whole'), [], key, true), profitAndLoss(plain, [], key, true));
 assert.deepEqual(plain.map(line => [line.amount, line.whole]), [[500, 500], [2000, 2000]]);
});

test('a linked payment counts in the asset\'s history at the owner\'s share and reads as entered', () => {
 const rows = [
  { id: 'club', name: 'Club', kind: 'Business', amount: 40000, currency: 'USD', date: '2026-01-01', frequency: 'Once', notes: '', created_at: '2026-01-01T00:00:00Z' },
  { id: 'rent', name: 'Rent', kind: 'Other expense', amount: 400, currency: 'USD', date: '2026-03-06', frequency: 'Once', notes: '', created_at: '2026-03-06T00:00:00Z', business_id: 'club', amount_basis: 'whole', business_share: 60 },
  { id: 'payout', name: 'Payout', kind: 'Business income', amount: 300, currency: 'USD', date: '2026-03-07', frequency: 'Once', notes: '', created_at: '2026-03-07T00:00:00Z', business_id: 'club', amount_basis: 'mine', business_share: 60 },
 ];
 assert.deepEqual(assetPaymentEvents(rows, 'club').map(event => [event.id, event.event_type, event.amount, event.entered.amount]), [['rent', 'contribution', 240, 400], ['payout', 'income', 300, 300]]);
});

test('the record form keeps a share and a count on valued kinds only, and the schema refuses the rest', () => {
 const sheep = entry('sheep', 'Business', 85, { quantity: 1300, unit_label: 'sheep', ownership_percentage: 50 });
 const property = changeRecordKind(sheep, 'Property', '2026-11-01');
 assert.deepEqual([property.ownership_percentage, property.unit_label, property.quantity, property.amount], [50, 'sheep', 1300, 85]);
 const cash = changeRecordKind(sheep, 'Cash', '2026-11-01');
 // A value per unit is not a balance: the amount is cleared with the count.
 assert.deepEqual([cash.ownership_percentage, cash.unit_label, cash.quantity, cash.amount], [100, null, 1, 0]);
 assert.equal(changeRecordKind(entry('flat', 'Property', 9000, { ownership_percentage: 40 }), 'Vehicle', '2026-11-01').amount, 9000);
 assert.equal('unit_label' in changeRecordKind(entry('flat', 'Property', 9000), 'Cash', '2026-11-01') && changeRecordKind(entry('flat', 'Property', 9000), 'Cash', '2026-11-01').unit_label, undefined, 'older databases never see the field');
 const record = extra => ({ id: id(1), name: 'Sheep', kind: 'Business', currency: 'USD', amount: 85, quantity: 1300, cost: 0, rate: 0, date: '2026-01-01', frequency: 'Once', notes: '', ...extra });
 assert.equal(recordSchema.safeParse(record({ unit_label: ' sheep ', ownership_percentage: 50 })).data.unit_label, 'sheep');
 assert.equal(recordSchema.safeParse(record({ unit_label: '  ' })).data.unit_label, null, 'a blank unit name is none');
 assert.equal(recordSchema.safeParse(record({ unit_label: 'x'.repeat(41) })).success, false);
 assert.equal(recordSchema.safeParse(record({ ownership_percentage: 0 })).success, false, 'a share is above zero');
 assert.equal(recordSchema.safeParse(record({ ownership_percentage: 100.01 })).success, false);
 assert.equal(recordSchema.safeParse(record({ kind: 'Vehicle', ownership_percentage: 50 })).success, true, 'any valued kind can be part-owned');
 assert.equal(recordSchema.safeParse(record({ kind: 'Cash', ownership_percentage: 50 })).success, false);
 assert.equal(recordSchema.safeParse(record({ kind: 'Cash', unit_label: 'coins' })).success, false);
 const expense = extra => record({ kind: 'Other expense', quantity: 1, amount: 10, ...extra });
 assert.equal(recordSchema.safeParse(expense({ business_id: id(2), amount_basis: 'whole' })).success, true);
 assert.equal(recordSchema.safeParse(expense({ amount_basis: 'whole' })).success, false, 'a whole-business figure names its business');
 assert.equal(recordSchema.safeParse(expense({ amount_basis: 'half', business_id: id(2) })).success, false);
 // The share itself is never taken from a form.
 assert.equal('business_share' in recordSchema.safeParse(expense({ business_id: id(2), business_share: 10 })).data, false);
});

test('the sample workspace has a part-owned business and a counted asset', () => {
 const records = demoRecords('2026-11-23');
 const cafe = records.find(record => record.id === 'demo-business'), watches = records.find(record => record.id === 'demo-watches');
 assert.deepEqual([cafe.ownership_percentage, value(cafe)], [25, 30000]);
 assert.deepEqual([watches.unit_label, watches.quantity, watches.amount, value(watches)], ['watches', 7, 2000, 14000]);
});
