import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

// A "Whole business" income or expense (migration 167) counts at the owner's share on every page that adds it up, as
// Cash flow does (`ownAmount`). These were still counting the whole business's figure (the 28 November 2026 audit).
const { netAmount, summarizeTransactions, groupByDay } = loadTS('lib/transaction-list.ts');
const { ageOfMoney } = loadTS('lib/age-of-money.ts');
const { investmentPeriodTotals } = loadTS('lib/investment-period.ts');
const { watchlistSpending } = loadTS('lib/spending-watchlists.ts');
const { cashFlowItems } = loadTS('lib/spending.ts');

const row = (id, kind, amount, extra = {}) => ({ id, name: id, kind, amount, currency: 'USD', date: '2026-11-10', frequency: 'Once', notes: '', quantity: 1, cost: 0, rate: 0, ...extra });
// A quarter of a business: a 10,000 sale entered for the whole business is 2,500 of the owner's money; 800 of costs is 200.
const sale = row('sale', 'Business income', 10000, { business_id: 'shop', business_share: 25, amount_basis: 'whole', account_id: 'cash' });
const cost = row('cost', 'Other expense', 800, { business_id: 'shop', business_share: 25, amount_basis: 'whole', account_id: 'cash', custom_category_id: 'supplies' });
const mine = row('mine', 'Business income', 300, { business_id: 'shop', business_share: 25, amount_basis: 'mine' });
const same = (amount, currency) => currency === 'USD' ? amount : null;

test('Transactions: Money in and a day total count a whole-business income at the owner\'s share', () => {
 assert.equal(netAmount(sale), 2500);
 assert.equal(netAmount(cost), -200);
 assert.equal(netAmount(mine), 300, 'an amount entered as the owner\'s own is counted in full');
 const summary = summarizeTransactions([sale, cost, mine], same);
 assert.equal(summary.received, 2800);
 assert.equal(summary.spent, 200);
 assert.equal(groupByDay([sale, cost, mine], same)[0].total, 2600);
});

test('Transactions agree with Cash flow on the same rows', () => {
 const flow = [...cashFlowItems([sale, cost, mine], '2026-11-01', '2026-11-30')];
 const received = flow.filter(item => item.income).reduce((sum, item) => sum + item.amount, 0);
 const spent = flow.filter(item => !item.income).reduce((sum, item) => sum + item.amount, 0);
 const summary = summarizeTransactions([sale, cost, mine], same);
 assert.equal(summary.received, received);
 assert.equal(summary.spent, spent);
});

test('Age of money reads a whole-business income at the owner\'s share', () => {
 // 2,500 of the owner's money on 1 November and 2,500 more on the 11th; 5,000 spent on the 21st used both, so it is 15
 // days old. Read in full, the 10,000 sale alone would have covered it at 20 days.
 const first = { ...sale, date: '2026-11-01' }, second = row('pay', 'Salary', 2500, { date: '2026-11-11', account_id: 'cash' });
 const spend = row('spend', 'Living expense', 5000, { date: '2026-11-21', account_id: 'cash' });
 assert.equal(ageOfMoney([first, second, spend], 'USD', '2026-11-30', { USD: 1 }).days, 15);
});

test('Investments period summary counts a whole-business income at the owner\'s share', () => {
 const input = { records: [{ id: 'shop', kind: 'Business', currency: 'USD', name: 'Shop', ownership_percentage: 25 }], events: [], cashflows: [sale, mine], today: '2026-11-30', currency: 'USD', market: { rates: {} } };
 assert.equal(investmentPeriodTotals(input, '2026-11-01').income, 2800);
});

test('A category watchlist counts a split whole-business expense at the owner\'s share', () => {
 const list = { id: 'w', name: 'Supplies', query: '', category: 'supplies', currency: 'USD', target: 1000 };
 const splits = [{ record_id: 'cost', category_id: 'supplies', amount: 600, position: 0 }, { record_id: 'cost', category_id: 'Other expense', amount: 200, position: 1 }];
 assert.equal(watchlistSpending(list, [cost], splits, '2026-11-30').spent, 150);
 assert.equal(watchlistSpending(list, [cost], [], '2026-11-30').spent, 200, 'unsplit, as Cash flow counts it');
});

test('The income chart counts a whole-business receipt at the owner\'s share', () => {
 const { receivedIncome } = loadTS('lib/income-history.ts');
 assert.deepEqual(receivedIncome([], [], [sale, mine], '2026-11-30').map(receipt => [receipt.id, receipt.amount]), [['mine', 300], ['sale', 2500]]);
});

test('A Cash flow income card counts a whole-business payout received at the owner\'s share', () => {
 const { monthlyIncomeCards, incomeCardTotals } = loadTS('lib/monthly-income-cards.ts');
 // The business is a quarter the owner's and is expected to pay them 1,500 a month; the shop paid out 4,000 in all.
 const business = { id: 'shop', kind: 'Business', name: 'Shop', currency: 'USD', amount: 100000, date: '2026-01-01', frequency: 'Once', ownership_percentage: 25, estimated_monthly_income: 1500 };
 const payout = row('payout', 'Business income', 4000, { business_id: 'shop', business_share: 25, amount_basis: 'whole', date: '2026-11-05' });
 const cards = monthlyIncomeCards([business, payout], '2026-11', [], '2026-11-30');
 const card = cards.find(item => item.entry.id === 'shop');
 assert.equal(card.receivedAmount, 1000);
 assert.equal(incomeCardTotals(cards).received, 1000);
 assert.deepEqual(card.entered, { amount: 1000, currency: 'USD' }, 'the card says what came to the owner, as its progress does');
});

test('A whole-business transaction moves its cash account by the owner\'s share, as the database does (migration 174)', () => {
 const { applyRecordChange } = loadTS('lib/record-balance.ts');
 const { transactionChange } = loadTS('lib/net-worth-moves.ts');
 const wallet = row('cash', 'Cash', 1000, { kind: 'Cash' });
 const [saved, account] = applyRecordChange([wallet], undefined, sale);
 assert.equal(saved.id, 'sale');
 assert.equal(account.amount, 3500);
 assert.equal(applyRecordChange([wallet, sale], sale, { ...sale, amount_basis: 'mine' }).find(item => item.id === 'cash').amount, 8500, 'switching to My share adds the rest');
 assert.equal(transactionChange(sale, wallet), 2500);
 assert.equal(transactionChange(cost, wallet), -200);
});
