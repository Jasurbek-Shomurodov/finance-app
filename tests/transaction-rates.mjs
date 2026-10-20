import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { loadTS } from './helpers/load-ts.mjs';

const { ratesOf, ratesOrPair, happened } = loadTS('lib/transaction-rates.ts');
const { cbuDayTable, dayTables, withPlanningDayRates, withDayRates } = loadTS('lib/day-rate-tables.ts', { './service-role': { serviceDatabase: () => null } });
const { drillFlows } = loadTS('lib/cash-flow-drill.ts');
const { cashFlowReport } = loadTS('lib/cash-flow-report.ts');
const { reportLedger } = loadTS('lib/business-report.ts');
const { periodTotals } = loadTS('lib/period-summary.ts');
const { groupByDay, summarizeTransactions } = loadTS('lib/transaction-list.ts');
const { convertAmount } = loadTS('lib/market.ts');

// Today the market says 12,800 UZS per dollar; on the days the payments were made the official rate was lower.
const today = { USD: 1, UZS: 12800 };
const day = { '2026-10-01': { USD: 1, UZS: 12000 }, '2026-10-15': { USD: 1, UZS: 11963.16 } };
const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'UZS', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const dated = item => ({ ...item, day_rates: day[item.date] ?? null });

test('a transaction converts at the official rates of its own day, never at today\'s', () => {
 const payment = dated(record('p', 'Mother-in-law', 'Charity', 4_800_000, '2026-10-15'));
 assert.equal(Math.round(convertAmount(payment.amount, 'UZS', 'USD', ratesOf(payment, today))), 401, '4,800,000 UZS at 11,963.16 is $401, not $375 at today\'s 12,800');
 assert.equal(ratesOf({ currency: 'UZS', day_rates: null }, today), undefined, 'a day whose rates could not be loaded has no rates: the amount is missing, not converted at today\'s');
 assert.deepEqual(ratesOf({ currency: 'UZS' }, today), today, 'a schedule or a sample record without a day converts at today\'s rates');
 assert.deepEqual(ratesOf(null, 12800), { USD: 1, UZS: 12800 }, 'the older single rate is UZS per dollar');
 const pair = (from, to) => from === to ? 1 : null;
 assert.equal(ratesOrPair(payment, pair), pair, 'a pair rate is used as given');
 assert.deepEqual(ratesOrPair(payment, today), day['2026-10-15']);
});

test('a payment from an account in another currency adds exactly what left the account', () => {
 // Paid in UZS from a USD cash account at the rate saved with it, on a day whose table is a little different.
 const payment = record('p', 'Mother-in-law', 'Charity', 4_800_000, '2026-10-15', { account_currency: 'USD', account_exchange_rate: 11963.16, day_rates: { USD: 1, UZS: 11970, EUR: 0.9 } });
 const rates = ratesOf(payment, today);
 assert.equal(convertAmount(payment.amount, 'UZS', 'USD', rates), 4_800_000 / 11963.16);
 assert.equal(rates.EUR, 0.9, 'other currencies still read the day\'s table');
 // Without a day table the saved pair still converts between the two currencies it links.
 assert.equal(Math.round(convertAmount(100, 'USD', 'UZS', ratesOf({ currency: 'USD', account_currency: 'UZS', account_exchange_rate: 1 / 13000, day_rates: null }, today))), 1_300_000);
 assert.equal(convertAmount(100, 'GBP', 'EUR', ratesOf({ currency: 'GBP', account_currency: 'EUR', account_exchange_rate: 0.85, day_rates: null }, today)), null, 'a pair it cannot tie to the dollar stays missing');
 assert.equal(convertAmount(117.65, 'GBP', 'EUR', ratesOf({ currency: 'GBP', account_currency: 'EUR', account_exchange_rate: 0.85, day_rates: { USD: 1, EUR: 0.9 } }, today)) > 0, true);
});

test('only income and spending that happened carry a day; schedules, future entries and holdings do not', () => {
 assert.equal(happened(record('a', 'Lunch', 'Living expense', 1, '2026-10-15'), '2026-10-20'), true);
 assert.equal(happened(record('b', 'Rent', 'Rent expense', 1, '2026-10-15', { frequency: 'Monthly' }), '2026-10-20'), false);
 assert.equal(happened(record('c', 'Later', 'Living expense', 1, '2026-10-21'), '2026-10-20'), false);
 assert.equal(happened(record('d', 'Wallet', 'Cash', 1, '2026-10-15'), '2026-10-20'), false);
});

test('the archive\'s rows become units per dollar, ignoring rows published after the day', () => {
 const rows = [{ Ccy: 'USD', Rate: '11963.16', Nominal: '1', Date: '14.10.2026' }, { Ccy: 'EUR', Rate: '13000', Nominal: '1', Date: '14.10.2026' }, { Ccy: 'JPY', Rate: '800', Nominal: '10', Date: '14.10.2026' }, { Ccy: 'GBP', Rate: '15000', Nominal: '1', Date: '16.10.2026' }];
 const table = cbuDayTable(rows, '2026-10-15');
 assert.equal(table.USD, 1);
 assert.equal(table.UZS, 11963.16);
 assert.equal(table.EUR, 11963.16 / 13000);
 assert.equal(table.JPY, 11963.16 / 80);
 assert.equal(table.GBP, undefined);
 assert.throws(() => cbuDayTable([{ Ccy: 'EUR', Rate: '1', Nominal: '1', Date: '14.10.2026' }], '2026-10-15'), /unavailable/, 'no dollar, no table');
 assert.throws(() => cbuDayTable({}, '2026-10-15'), /unavailable/);
});

test('kept days are read at once; missing days are fetched and kept, late days follow the response', async () => {
 const writes = [], later = [];
 const db = {
  read: async path => { assert.match(path, /exchange_rate_days\?select=day,rates&day=in\./); return [{ day: '2026-10-01', rates: { USD: 1, UZS: 12000 } }]; },
  write: async (path, init) => { writes.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); },
 };
 const fetched = [];
 const fetchDay = async date => { fetched.push(date); if (date === '2026-10-03') throw Error('down'); return { USD: 1, UZS: 12000 + Number(date.slice(8)) }; };
 const tables = await dayTables(['2026-10-01', '2026-10-15', '2026-10-15', '2026-10-20', '2026-10-03', '2026-10-21', 'not a day'], { db, fetchDay, today: '2026-10-20', later: work => later.push(work) });
 assert.deepEqual([...tables.keys()].sort(), ['2026-10-01', '2026-10-15', '2026-10-20']);
 assert.deepEqual(fetched.sort(), ['2026-10-03', '2026-10-15', '2026-10-20'], 'a kept day and a future day are never fetched');
 assert.deepEqual(writes.flat().map(row => row.day).sort(), ['2026-10-15', '2026-10-20'], 'every day found is kept, today\'s too (it is published before it starts); a failed day is not');
 assert.equal(later.length, 0);
 // A day not reached within the budget is fetched after the response.
 const slow = await dayTables(['2026-09-01', '2026-09-02'], { db: null, fetchDay: async date => ({ USD: 1, UZS: 1 + Number(date.slice(8)) }), today: '2026-10-20', budgetMs: -1, later: work => later.push(work) });
 assert.equal(slow.size, 0);
 assert.equal(later.length, 1);
 await later[0]();
 // Before migration 149 the table is missing: every day is fetched and nothing breaks.
 const before = await dayTables(['2026-09-01'], { db: { read: async () => { throw Error('missing'); }, write: async () => { throw Error('missing'); } }, fetchDay: async () => ({ USD: 1, UZS: 1 }), today: '2026-10-20' });
 assert.deepEqual(before.get('2026-09-01'), { USD: 1, UZS: 1 });
});

test('a read attaches each transaction\'s and each transfer\'s day, cut to the currencies it can be shown in', async () => {
 const fetchDay = async date => date === '2026-10-02' ? Promise.reject(Error('down')) : { USD: 1, UZS: 12000, EUR: 0.9, JPY: 150 };
 const deps = { db: null, fetchDay, today: '2026-10-20' };
 const data = {
  records: [record('a', 'Lunch', 'Living expense', 100, '2026-10-01'), record('b', 'Taxi', 'Living expense', 100, '2026-10-02'), record('w', 'Wallet', 'Cash', 1, '2026-10-01'), record('s', 'Rent', 'Rent expense', 1, '2026-10-01', { frequency: 'Monthly' })],
  activity: [{ id: 't', occurred_on: '2026-10-01' }],
  movements: [{ id: 'm', occurred_on: '2026-10-30' }],
  investmentLinks: [{ id: 'l', investment_history: { occurred_on: '2026-10-01' } }],
 };
 const out = await withPlanningDayRates(data, ['EUR'], deps);
 assert.deepEqual(out.records[0].day_rates, { USD: 1, UZS: 12000, EUR: 0.9 }, 'the viewer\'s currencies and the records\' own; JPY is left out');
 assert.equal(out.records[1].day_rates, null, 'a day that could not be loaded is attached as null');
 assert.equal('day_rates' in out.records[2], false, 'a holding keeps today\'s value');
 assert.equal('day_rates' in out.records[3], false, 'a schedule converts at today\'s rates');
 assert.deepEqual(out.activity[0].day_rates, { USD: 1, UZS: 12000, EUR: 0.9 });
 assert.equal('day_rates' in out.movements[0], false, 'a future transfer has no day yet');
 assert.deepEqual(out.investmentLinks[0].day_rates, { USD: 1, UZS: 12000, EUR: 0.9 });
 assert.equal((await withDayRates([record('a', 'Lunch', 'Living expense', 100, '2026-10-01')], [], deps))[0].day_rates.UZS, 12000);
 assert.deepEqual(await withPlanningDayRates({ records: [] }, [], deps), { records: [] });
});

// Two payments to the same person in October, made on different days, and today's rate is different from both.
const october = [dated(record('p1', 'Mother-in-law', 'Charity', 4_800_000, '2026-10-01')), dated(record('p2', 'Mother-in-law', 'Charity', 4_800_000, '2026-10-15'))];
const expected = Math.round(4_800_000 / 12000 + 4_800_000 / 11963.16);

test('the Sankey of a payee, the Cash flow report and Reports add each payment at its own day\'s rate', () => {
 const context = { data: { records: october, activity: [], investmentLinks: [] }, splits: [], months: ['2026-10'], currency: 'USD', today: '2026-10-20', rates: today, t: key => key };
 const flows = drillFlows({ side: 'merchant', key: 'Mother-in-law', income: false }, 'Mother-in-law', 0, context);
 assert.equal(Math.round(flows.links.reduce((sum, link) => Math.max(sum, link.value), 0)), expected, `$${expected}, not $${Math.round(9_600_000 / 12800)} at today's rate`);
 const report = cashFlowReport({ records: october, activity: [], investmentLinks: [], categories: [] }, [], ['2026-10'], 'USD', '2026-10-20', today);
 assert.equal(Math.round(report.categories.expense.find(item => item.key === 'Charity').amount), expected);
 const ledger = reportLedger({ records: october, investmentLinks: [] }, [], { from: '2026-10-01', to: '2026-10-31' }, 'USD', '2026-10-20', today);
 assert.equal(Math.round(ledger.lines.reduce((sum, line) => sum + line.amount, 0)), expected);
 assert.equal(ledger.missing, 0);
 const lost = reportLedger({ records: [{ ...october[0], day_rates: null }], investmentLinks: [] }, [], { from: '2026-10-01', to: '2026-10-31' }, 'USD', '2026-10-20', today);
 assert.equal(lost.missing, 1, 'a day without rates is missing, never converted at today\'s rate');
});

test('period totals, the transaction list\'s day totals and the summary use each transaction\'s day', () => {
 const totals = periodTotals({ records: october }, '2026-10-01', '2026-10-20', 'USD', today);
 assert.equal(Math.round(totals.spending), expected);
 const convert = (amount, unit, item) => convertAmount(amount, unit, 'USD', ratesOf(item, today));
 assert.deepEqual(groupByDay(october, convert).map(group => Math.round(group.total)).sort(), [-401, -400].sort());
 assert.equal(Math.round(summarizeTransactions(october, convert).spent), expected);
});

test('migration 149 keeps a day\'s rates for the server alone, is in setup.sql and re-runs', async () => {
 const migration = fs.readFileSync('migrations/149_exchange_rate_days.sql', 'utf8'), setup = fs.readFileSync('database/setup.sql', 'utf8');
 assert.ok(setup.includes(migration), 'setup.sql includes migration 149');
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts', 'utf8').match(/requiredSchemaVersion = (\d+);/)[1]) >= 149);
 const d = new PGlite();
 try {
  await d.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
  await d.exec(migration); await d.exec(migration);
  assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version, 149);
  await d.query(`INSERT INTO exchange_rate_days(day,rates) VALUES('2026-10-15','{"USD":1,"UZS":11963.16}')`);
  await assert.rejects(d.query(`INSERT INTO exchange_rate_days(day,rates) VALUES('2026-10-16','{"UZS":11963.16}')`), /check/i, 'a table is in units per dollar');
  await d.exec('SET ROLE authenticated');
  await assert.rejects(d.query('SELECT * FROM exchange_rate_days'), /permission denied/, 'people never read or write it directly');
 } finally { await d.close(); }
});

test('a read dates transactions in the viewer\'s preferred currencies and fills late days after the response', async () => {
 const calls = [], later = [];
 const tables = { withPlanningDayRates: async (data, currencies, deps) => { calls.push({ currencies, today: deps.today }); deps.later(async () => {}); return { ...data, dated: true }; } };
 const { withViewerDayRates } = loadTS('lib/viewer-day-rates.ts', {
  'next/server': { after: work => later.push(work) },
  '@/lib/day-rate-tables': tables,
  '@/lib/supabase': { supa: async (path, init, token) => { assert.match(path, /user_preferences\?select=currencies&user_id=eq\.me/); assert.equal(token, 't'); assert.equal(new Headers(init.headers).get('x-workspace-owner'), '', 'preferences are the viewer\'s own'); return Response.json([{ currencies: ['EUR', 'UZS'] }]); } },
 });
 const out = await withViewerDayRates({ records: [] }, { token: 't', user: { id: 'me' } });
 assert.equal(out.dated, true);
 assert.deepEqual(calls[0].currencies, ['EUR', 'UZS']);
 assert.match(calls[0].today, /^\d{4}-\d{2}-\d{2}$/);
 assert.equal(later.length, 1);
 // Without preferences, or when the read fails, the records' own currencies still decide.
 const failing = loadTS('lib/viewer-day-rates.ts', { 'next/server': { after: () => { throw Error('outside a request'); } }, '@/lib/day-rate-tables': tables, '@/lib/supabase': { supa: async () => { throw Error('offline'); } } });
 await failing.withViewerDayRates({ records: [] }, { token: 't', user: { id: 'me' } });
 assert.deepEqual(calls[1].currencies, []);
});

test('the rate route answers several days\' official rates in the asked currencies, and refuses bad requests', async () => {
 const asked = [];
 const { GET } = loadTS('app/api/exchange-rate/route.ts', {
  '@/lib/supabase': { session: async () => ({ token: 't', user: { id: 'me' } }) },
  '@/lib/rate-limit': { limits: { market: [] }, rateLimited: async () => false },
  'next/server': { after: () => {} },
  '@/lib/day-rate-tables': { dayTables: async days => { asked.push(days); return new Map(days.map(day => [day, { USD: 1, UZS: 12000, EUR: 0.9, JPY: 150 }])); } },
 });
 const read = query => GET(new Request('https://local/api/exchange-rate?' + query));
 const ok = await read('days=2026-10-01,2026-10-15&currencies=UZS');
 assert.equal(ok.status, 200);
 assert.deepEqual(await ok.json(), { days: { '2026-10-01': { USD: 1, UZS: 12000 }, '2026-10-15': { USD: 1, UZS: 12000 } } });
 for (const query of ['days=2099-01-01&currencies=UZS', 'days=nope&currencies=UZS', 'days=2026-10-01&currencies=', 'days=2026-10-01&currencies=XX1', 'days=' + Array.from({ length: 401 }, () => '2026-10-01').join(',') + '&currencies=UZS'])
  assert.equal((await read(query)).status, 400, query);
 assert.equal(asked.length, 1);
});

test('a transaction saved with its day\'s rates keeps them on read; only unsaved days are looked up', async () => {
 const looked = [];
 const deps = { db: null, today: '2026-10-20', fetchDay: async date => { looked.push(date); return { USD: 1, UZS: 12500, EUR: 0.9 }; } };
 const stored = { USD: 1, UZS: 11963.16, EUR: 0.86, JPY: 150 };
 const out = await withPlanningDayRates({ records: [record('a', 'Mother-in-law', 'Charity', 4_800_000, '2026-10-15', { day_rates: stored }), record('b', 'Lunch', 'Living expense', 1, '2026-10-16', { day_rates: null })] }, ['EUR'], deps);
 assert.deepEqual(out.records[0].day_rates, { USD: 1, UZS: 11963.16, EUR: 0.86 }, 'the saved rates, cut to the currencies it can be shown in');
 assert.deepEqual(looked, ['2026-10-16'], 'the saved day is never looked up again');
 assert.equal(out.records[1].day_rates.UZS, 12500);
});

test('the day is kept before a save; without the server key nothing is fetched, and a failure never stops the save', async () => {
 const { keepDayRates } = loadTS('lib/day-rate-tables.ts', { './service-role': { serviceDatabase: () => null } });
 let fetched = 0;
 await keepDayRates(['2026-10-15'], { today: '2026-10-20', fetchDay: async () => { fetched++; return { USD: 1 }; } });
 assert.equal(fetched, 0);
 const writes = [];
 const db = { read: async () => [], write: async (path, init) => { writes.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); } };
 await keepDayRates(['2026-10-15', null, undefined], { db, today: '2026-10-20', fetchDay: async () => ({ USD: 1, UZS: 11963.16 }) });
 assert.deepEqual(writes.flat().map(row => row.day), ['2026-10-15']);
 await keepDayRates(['2026-10-15'], { db: { read: async () => { throw Error('down'); }, write: async () => { throw Error('down'); } }, today: '2026-10-20', fetchDay: async () => { throw Error('down'); } });
});

const sqlId = n => `79000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function savedDb() {
 const d = new PGlite();
 await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${sqlId(1)}');`);
 await d.exec(fs.readFileSync('database/setup.sql', 'utf8'));
 await d.exec(`INSERT INTO exchange_rate_days(day,rates) VALUES('2026-10-15','{"USD":1,"UZS":11963.16}'),('2026-10-16','{"USD":1,"UZS":11990}')`);
 await d.exec(`SET request.jwt.claim.sub='${sqlId(1)}';SET ROLE authenticated;`);
 return d;
}
const saveRow = (d, row) => d.query('SELECT save_finance_record($1::jsonb)', [JSON.stringify({ quantity: 1, cost: 0, rate: 0, frequency: 'Once', notes: '', currency: 'UZS', date: '2026-10-15', ...row })]);
const ratesIn = async (d, n) => (await d.query('SELECT day_rates FROM finance_records WHERE id=$1', [sqlId(n)])).rows[0].day_rates;

test('migration 150 saves each transaction with its day\'s rates, whatever saves it, and nobody can write other rates', async () => {
 const migration = fs.readFileSync('migrations/150_transaction_day_rates.sql', 'utf8');
 assert.ok(fs.readFileSync('database/setup.sql', 'utf8').includes(migration), 'setup.sql includes migration 150');
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts', 'utf8').match(/requiredSchemaVersion = (\d+);/)[1]) >= 150);
 const d = await savedDb();
 try {
  await d.exec('RESET ROLE'); await d.exec(migration); await d.exec(`SET ROLE authenticated`);
  await saveRow(d, { id: sqlId(10), name: 'Mother-in-law', kind: 'Charity', amount: 4_800_000 });
  assert.deepEqual(await ratesIn(d, 10), { USD: 1, UZS: 11963.16 }, 'an expense is saved with its day\'s rates');
  await saveRow(d, { id: sqlId(11), name: 'Salary', kind: 'Salary', amount: 1, date: '2026-10-16' });
  assert.deepEqual(await ratesIn(d, 11), { USD: 1, UZS: 11990 }, 'income too');
  await saveRow(d, { id: sqlId(12), name: 'Lunch', kind: 'Living expense', amount: 1, date: '2026-10-17' });
  assert.equal(await ratesIn(d, 12), null, 'a day not kept yet saves without rates');
  await saveRow(d, { id: sqlId(13), name: 'Rent', kind: 'Rent expense', amount: 1, frequency: 'Monthly' });
  assert.equal(await ratesIn(d, 13), null, 'a schedule has no day');
  await saveRow(d, { id: sqlId(14), name: 'Wallet', kind: 'Cash', amount: 1 });
  assert.equal(await ratesIn(d, 14), null, 'a holding has no day');
  // Writing rates directly is ignored: an insert takes the day's, an edit on the same day keeps what was saved.
  await d.query(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,cost,rate,date,frequency,notes,day_rates) VALUES($1,$2,'Forged','Charity','UZS',1,1,0,0,'2026-10-15','Once','','{"USD":1,"UZS":1}')`, [sqlId(15), sqlId(1)]);
  assert.deepEqual(await ratesIn(d, 15), { USD: 1, UZS: 11963.16 });
  await d.query(`UPDATE finance_records SET day_rates='{"USD":1,"UZS":2}', amount=2 WHERE id=$1`, [sqlId(10)]);
  assert.deepEqual(await ratesIn(d, 10), { USD: 1, UZS: 11963.16 });
  // A new date takes that day's rates; a day kept later is stored by the next edit.
  await d.query(`UPDATE finance_records SET date='2026-10-16' WHERE id=$1`, [sqlId(10)]);
  assert.deepEqual(await ratesIn(d, 10), { USD: 1, UZS: 11990 });
  await d.exec('RESET ROLE'); await d.exec(`INSERT INTO exchange_rate_days(day,rates) VALUES('2026-10-17','{"USD":1,"UZS":12001}')`); await d.exec('SET ROLE authenticated');
  await d.query(`UPDATE finance_records SET notes='paid' WHERE id=$1`, [sqlId(12)]);
  assert.deepEqual(await ratesIn(d, 12), { USD: 1, UZS: 12001 });
  await d.exec('RESET ROLE');
  assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version, 150);
  await assert.rejects(d.query(`UPDATE finance_records SET day_rates='{"UZS":1}', frequency='Monthly' WHERE id=$1`, [sqlId(13)]).then(() => d.query(`ALTER TABLE finance_records DISABLE TRIGGER keep_transaction_day_rates`)).then(() => d.query(`UPDATE finance_records SET day_rates='{"UZS":1}' WHERE id=$1`, [sqlId(13)])), /finance_records_day_rates/, 'a table is in units per dollar');
 } finally { await d.close(); }
});
