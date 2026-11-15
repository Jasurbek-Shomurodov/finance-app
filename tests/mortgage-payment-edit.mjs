import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

const { availableForPayment, latestPaymentCategory, mortgageOfPayment, paymentFields, paymentFromRow, paymentsOf, withEditedPayment, withPayment } = loadTS('lib/mortgage-payment-edit.ts');
const { isLinkedTransaction, linkedSourceLabel } = loadTS('lib/linked-transactions.ts');
const { withoutRepeatedBalances } = loadTS('lib/investment-history.ts');
const { groupByDay, groupPageByDay } = loadTS('lib/transaction-list.ts');
const { canTakeCategory, ruleTargets } = loadTS('lib/transaction-rules.ts');

const entry = (id, name, kind, amount, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date: '2026-11-01', frequency: 'Once', notes: '', ...extra });
const home = entry('m', 'Home', 'Mortgage', 100000), wallet = entry('w', 'Wallet', 'Cash', 5000), savings = entry('s', 'Savings', 'Cash', 9000);
const payment = (id, principal, interest, extra = {}) => ({ id, mortgage_id: 'm', principal, interest, date: '2026-11-11', notes: '', account_id: 'w', ...extra });
const amount = (rows, id) => rows.find(row => row.id === id).amount;

test('a payment moves the mortgage by its principal and the cash account by its total, and starts in the latest payment\'s category', () => {
 const base = entry('new', '', 'Other expense', 0);
 let rows = withPayment([home, wallet, savings], base, payment('p1', 400, 1200));
 assert.equal(amount(rows, 'm'), 99600);assert.equal(amount(rows, 'w'), 3400);
 const first = rows.find(row => row.id === 'p1');
 assert.deepEqual([first.name, first.kind, first.custom_category_id, first.amount, first.payment_principal, first.payment_interest, first.mortgage_payment_id, first.account_id], ['Home', 'Other expense', null, 1600, 400, 1200, 'p1', 'w']);
 // The person moves it to Housing; the next payment follows without being asked.
 rows = rows.map(row => row.id === 'p1' ? { ...row, custom_category_id: 'housing' } : row);
 assert.deepEqual(latestPaymentCategory(rows, home), { kind: 'Other expense', category_id: 'housing' });
 rows = withPayment(rows, base, payment('p2', 100, 50, { date: '2026-11-12' }));
 assert.equal(rows.find(row => row.id === 'p2').custom_category_id, 'housing');
 // A category chosen in the form wins, and the newest payment decides the next default.
 rows = withPayment(rows, base, payment('p3', 10, 5, { date: '2026-11-13', category: { kind: 'Living expense', category_id: null } }));
 assert.deepEqual(latestPaymentCategory(rows, home), { kind: 'Living expense', category_id: null });
 assert.deepEqual(latestPaymentCategory(rows, entry('c', 'Cabin', 'Mortgage', 1)), { kind: 'Other expense', category_id: null }, 'another mortgage has its own payments');
 assert.equal(paymentsOf(rows, home).length, 3);
 assert.equal(mortgageOfPayment(rows, rows.find(row => row.id === 'p2')).id, 'm');
 assert.throws(() => withPayment(rows, base, payment('p4', 1, 99999)), /Not enough money/);
 assert.throws(() => withPayment(rows, base, payment('p5', 1, 1, { mortgage_id: 'none' })), /Mortgage not found/);
});

test('editing a payment undoes the old one and applies the new, keeping what described it', () => {
 let rows = withPayment([home, wallet, savings], entry('new', '', 'Other expense', 0), payment('p1', 400, 1200));
 rows = rows.map(row => row.id === 'p1' ? { ...row, custom_category_id: 'housing', business_id: 'biz' } : row);
 const before = rows.find(row => row.id === 'p1');
 assert.deepEqual(paymentFromRow(before, 'm'), { id: 'p1', mortgage_id: 'm', principal: 400, interest: 1200, date: '2026-11-11', notes: '', account_id: 'w' });
 // More principal, less interest, a note.
 rows = withEditedPayment(rows, payment('p1', 500, 1000, { notes: 'Corrected' }));
 assert.equal(amount(rows, 'm'), 99500);assert.equal(amount(rows, 'w'), 3500);
 const edited = rows.find(row => row.id === 'p1');
 assert.deepEqual([edited.amount, edited.payment_principal, edited.payment_interest, edited.notes, edited.custom_category_id, edited.business_id], [1500, 500, 1000, 'Corrected', 'housing', 'biz']);
 assert.equal(rows.filter(row => row.id === 'p1').length, 1);
 // Another account pays: the first gets its money back. A chosen category replaces the old one.
 rows = withEditedPayment(rows, payment('p1', 500, 1000, { account_id: 's', category: { kind: 'Charity', category_id: null } }));
 assert.equal(amount(rows, 'w'), 5000);assert.equal(amount(rows, 's'), 7500);assert.equal(amount(rows, 'm'), 99500);
 assert.deepEqual([rows.find(row => row.id === 'p1').kind, rows.find(row => row.id === 'p1').custom_category_id], ['Charity', null]);
 // What cannot be paid is refused and nothing changes.
 assert.throws(() => withEditedPayment(rows, payment('p1', 500, 999999, { account_id: 's' })), /Not enough money/);
 assert.throws(() => withEditedPayment(rows, payment('p1', 100001, 0, { account_id: 's' })), /Principal exceeds the outstanding balance/);
 assert.throws(() => withEditedPayment(rows, payment('missing', 1, 1)), /Payment not found/);
 assert.equal(amount(rows, 'm'), 99500);
});

test('the form counts back what the edited payment took from the same account, and sends its fields without the category', () => {
 const editing = payment('p1', 400, 1200);
 assert.equal(availableForPayment({ ...wallet, amount: 3400 }, home), 3400);
 assert.equal(availableForPayment({ ...wallet, amount: 3400 }, home, editing), 5000);
 assert.equal(availableForPayment(savings, home, editing), 9000, 'another account gets nothing back');
 assert.equal(availableForPayment({ ...wallet, amount: 3400, currency: 'UZS' }, home, editing), 3400, 'an account in another currency took an amount only the server knows');
 assert.deepEqual(paymentFields({ ...editing, category: { kind: 'Charity', category_id: null } }), { id: 'p1', mortgage_id: 'm', principal: 400, interest: 1200, date: '2026-11-11', notes: '', account_id: 'w' });
 assert.deepEqual(paymentFields({ ...editing, account_id: undefined, exchange_rate: 0.5 }), { id: 'p1', mortgage_id: 'm', principal: 400, interest: 1200, date: '2026-11-11', notes: '', exchange_rate: 0.5 });
});

test('a linked transaction names its source, changes category by hand and stays out of rules', () => {
 const fee = entry('f', 'Transfer fee', 'Other expense', 5, { operation_id: 'op' }), rent = entry('r', 'Flat', 'Rent income', 400, { history_event_id: 'h' });
 const interest = entry('i', 'Deposit', 'Other income', 9, { movement_id: 'mv' }), paid = entry('p', 'Home', 'Other expense', 1600, { mortgage_payment_id: 'p' }), plain = entry('x', 'Shop', 'Other expense', 5);
 assert.deepEqual([fee, rent, interest, paid, plain].map(linkedSourceLabel), ['Transfer or repayment fee', 'Asset tracker update', 'Asset transfer', null, null]);
 assert.deepEqual([fee, rent, interest, paid, plain].map(isLinkedTransaction), [true, true, true, true, false]);
 // An expense takes any expense category; a linked income keeps its kind and takes custom categories of it only.
 assert.ok(canTakeCategory(paid, { kind: 'Living expense', category_id: null }));
 assert.ok(canTakeCategory(fee, { kind: 'Other expense', category_id: 'c' }));
 assert.ok(!canTakeCategory(rent, { kind: 'Other income', category_id: null }));
 assert.ok(canTakeCategory(interest, { kind: 'Other income', category_id: 'c' }));
 assert.ok(!canTakeCategory(interest, { kind: 'Salary', category_id: null }));
 const rule = { id: 'rule', pattern: 'o', match: 'contains', direction: 'expense', account_id: null, match_business_id: null, match_kind: null, match_category_id: null, amount_min: null, amount_max: null, kind: 'Charity', category_id: null, business_id: null, tag_ids: [] };
 assert.deepEqual(ruleTargets(rule, [paid, plain]), ['x'], 'a rule recategorizes plain transactions only, as the database does');
});

test('History leaves out the balance update a mortgage payment wrote for itself, and nothing else', () => {
 const event = (id, event_type, occurred_on, balance) => ({ id, event_type, occurred_on, balance });
 const events = [event('a', 'baseline', '2026-09-10', 87000), event('b', 'mortgage_payment', '2026-09-12', 86531), event('c', 'valuation', '2026-09-12', '86531'),
  event('d', 'valuation', '2026-09-20', 86531), event('e', 'mortgage_payment', '2026-10-08', null), event('f', 'valuation', '2026-10-08', 86000), event('g', 'mortgage_payment', '2026-11-11', 85661), event('h', 'valuation', '2026-11-11', 85000)];
 assert.deepEqual(withoutRepeatedBalances(events).map(item => item.id), ['a', 'b', 'd', 'e', 'f', 'g', 'h']);
 assert.deepEqual(withoutRepeatedBalances([]), []);
});

test('a day knows the principal its mortgage payments moved, which its total leaves out', () => {
 const convert = (value, currency) => currency === 'USD' ? value : currency === 'UZS' ? value / 10000 : null;
 const day = (extra = {}) => ({ date: '2026-11-11', ...extra });
 const rows = [entry('a', 'Home', 'Other expense', 1600, day({ mortgage_payment_id: 'a', payment_principal: 400, payment_interest: 1200 })), entry('b', 'Home', 'Other expense', 550, day({ mortgage_payment_id: 'b', payment_principal: 550, payment_interest: 0 })),
  entry('c', 'Shop', 'Living expense', 20000, day({ date: '2026-11-03', currency: 'UZS' })), entry('d', 'Pay', 'Salary', 100, day({ date: '2026-11-03' }))];
 const days = groupByDay(rows, convert);
 assert.deepEqual(days.map(item => [item.date, item.total, item.principal]), [['2026-11-11', -1200, 950], ['2026-11-03', 98, 0]]);
 assert.deepEqual(groupPageByDay(rows, 1, 2, convert).map(item => [item.total, item.principal, item.count]), [[-1200, 950, 2]], 'a page shows the whole day');
 // A principal that cannot be converted is unknown, never a partial sum.
 const foreign = entry('e', 'Cabin', 'Other expense', 10, day({ currency: 'EUR', mortgage_payment_id: 'e', payment_principal: 4, payment_interest: 6 }));
 assert.deepEqual(groupByDay([rows[0], foreign], convert).map(item => [item.total, item.principal]), [[null, null]]);
});

// The API route: reading a payment for its form, and changing it.
const ids = { payment: '16400000-0000-4000-8000-000000000020', mortgage: '16400000-0000-4000-8000-000000000013', wallet: '16400000-0000-4000-8000-000000000010', sums: '16400000-0000-4000-8000-000000000011' };
function route({ signedIn = true, payments = [{ id: ids.payment, mortgage_id: ids.mortgage, principal: '400', interest: '1200', paid_on: '2026-11-11', notes: 'n' }], operations = [{ account_id: ids.wallet }], links = [], fail, rpc = () => Response.json({ ok: true }), rate = { rate: 0.0001, effective_date: '2026-11-10' }, sameOrigin = true } = {}) {
 const calls = [];
 const tables = { mortgage_payments: payments, account_activity: operations, investment_account_links: links, finance_records: [{ id: ids.mortgage, kind: 'Mortgage', currency: 'USD' }, { id: ids.wallet, kind: 'Cash', currency: 'USD' }, { id: ids.sums, kind: 'Cash', currency: 'UZS' }] };
 const supa = async (path, init = {}) => {
  calls.push({ path, body: init.body ? JSON.parse(init.body) : undefined });
  if (path.includes('/rpc/')) return rpc();
  const table = path.match(/\/rest\/v1\/(\w+)/)[1];
  if (fail === table) return new Response('', { status: 500 });
  return Response.json(tables[table].filter(row => !('kind' in row) || path.includes(row.id)));
 };
 const api = loadTS('app/api/mortgage-payments/route.ts', {
  '@/lib/supabase': { session: async () => signedIn ? { token: 'owner' } : null, sameOrigin: () => sameOrigin, supa },
  '@/lib/official-rate': { loadOfficialRate: async () => { if (!rate) throw Error('no rate'); return rate; } },
  '@/lib/notify-action': { queueMilestoneCheck() {} },
  '@/lib/deposit-interest': { depositToday: () => '2026-11-15' },
 });
 return { ...api, calls };
}
const get = id => new Request(`https://local/api/mortgage-payments?id=${id}`);
const patch = data => new Request('https://local/api/mortgage-payments', { method: 'PATCH', body: JSON.stringify(data) });
const change = { id: ids.payment, account_id: ids.wallet, principal: 500, interest: 1000, date: '2026-11-11', notes: 'Corrected' };

test('a payment is read for its form with the account that paid it', async () => {
 const sameCurrency = route();
 assert.deepEqual(await (await sameCurrency.GET(get(ids.payment))).json(), { id: ids.payment, mortgage_id: ids.mortgage, principal: 400, interest: 1200, date: '2026-11-11', notes: 'n', account_id: ids.wallet });
 // Paid from an account in another currency: the dated cash link names it.
 assert.equal((await (await route({ operations: [], links: [{ account_id: ids.sums }] }).GET(get(ids.payment))).json()).account_id, ids.sums);
 assert.equal((await (await route({ operations: [] }).GET(get(ids.payment))).json()).account_id, null);
 assert.equal((await route({ signedIn: false }).GET(get(ids.payment))).status, 401);
 assert.equal((await route().GET(get('nope'))).status, 400);
 assert.equal((await route({ payments: [] }).GET(get(ids.payment))).status, 404);
 assert.equal((await route({ fail: 'account_activity' }).GET(get(ids.payment))).status, 503);
});

test('a payment is changed in one database call, with a rate the server works out for another currency', async () => {
 const plain = route();
 assert.equal((await plain.PATCH(patch(change))).status, 200);
 assert.deepEqual(plain.calls.at(-1), { path: '/rest/v1/rpc/edit_mortgage_payment', body: { p_id: ids.payment, p_data: { account_id: ids.wallet, principal: 500, interest: 1000, date: '2026-11-11', notes: 'Corrected' } } });
 const fx = route();
 assert.equal((await fx.PATCH(patch({ ...change, account_id: ids.sums, exchange_rate: 0.0001 }))).status, 200);
 assert.deepEqual(fx.calls.at(-1).body.p_data, { account_id: ids.sums, principal: 500, interest: 1000, date: '2026-11-11', notes: 'Corrected', rate: 0.0001, rate_date: '2026-11-10' });
 // The client's rate is only checked against the server's, never saved.
 const stale = route();
 assert.equal((await stale.PATCH(patch({ ...change, account_id: ids.sums, exchange_rate: 0.0002 }))).status, 409);
 assert.ok(!stale.calls.some(call => call.path.includes('/rpc/')));
 assert.equal((await route({ rate: null }).PATCH(patch({ ...change, account_id: ids.sums, exchange_rate: 0.0001 }))).status, 422);
 // Refusals: a stranger's site, no session, bad fields, a future day, an unknown payment or account, a failed read.
 assert.equal((await route({ sameOrigin: false }).PATCH(patch(change))).status, 403);
 assert.equal((await route({ signedIn: false }).PATCH(patch(change))).status, 401);
 assert.equal((await route().PATCH(patch({ ...change, principal: 0, interest: 0 }))).status, 400);
 assert.equal((await route().PATCH(patch({ ...change, date: '2026-11-16' }))).status, 400);
 assert.equal((await route({ payments: [] }).PATCH(patch(change))).status, 404);
 assert.equal((await route().PATCH(patch({ ...change, account_id: ids.mortgage }))).status, 400);
 assert.equal((await route({ fail: 'mortgage_payments' }).PATCH(patch(change))).status, 503);
 assert.equal((await route({ fail: 'finance_records' }).PATCH(patch(change))).status, 503);
 // What the database refuses is shown in its words; a database without the function asks for the migration.
 const refused = await route({ rpc: () => Response.json({ code: 'P0001', message: 'Not enough money in the selected cash account.' }, { status: 400 }) }).PATCH(patch(change));
 assert.equal((await refused.json()).error, 'Not enough money in the selected cash account.');
 const outdated = await route({ rpc: () => Response.json({ code: 'PGRST202', message: 'missing' }, { status: 404 }) }).PATCH(patch(change));
 assert.equal(outdated.status, 503);assert.match((await outdated.json()).error, /needs an update/);
});
