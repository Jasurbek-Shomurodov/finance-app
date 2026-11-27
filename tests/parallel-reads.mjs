// Reads that do not depend on one another start together (PERF-015): each route below is held at its first database
// answer, and everything that does not need that answer must already be on its way.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';

const gate = () => { let open; const shut = new Promise(resolve => { open = resolve; }); return { shut, open }; };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const auth = { token: 'owner', user: { id: 'me' } };

test('a records page reads the viewer\'s currencies and the deposits\' forecasts beside the page, not after it', async () => {
 const held = gate(), started = [];
 const { GET } = loadTS('app/api/records/route.ts', {
  '@/lib/supabase': { session: async () => auth, sameOrigin: () => true, supa: async path => { started.push(path); await held.shut; return Response.json({ records: [{ id: 'coffee', kind: 'Other expense', currency: 'USD', amount: 4.5, date: '2026-11-01' }], summary: [{ id: 'grouped', kind: 'Deposit', amount: 99 }, { id: 'cash', kind: 'Cash', amount: 50 }], total: 1, page: 1 }); } },
  '@/lib/viewer-day-rates': { preferredCurrencies: async () => { started.push('currencies'); return ['UZS']; }, withViewerDayRates: async (data, _auth, currencies) => { const shown = await currencies; return { records: data.records.map(row => ({ ...row, shown })) }; } },
  '@/lib/deposit-forecasts': { depositForecasts: async (_token, holdings) => { started.push(holdings ? 'deposits from holdings' : 'deposits'); return [{ id: 'saving', kind: 'Deposit', amount: 1000, estimated_monthly_income: 12.5 }]; } },
  '@/lib/notify-action': { queueMilestoneCheck: () => {} },
 });
 const pending = GET(new Request('https://local/api/records?page=1&section=all&summary=1'));
 await settle();
 assert.deepEqual(started, ['currencies', 'deposits', '/rest/v1/rpc/finance_records_page'], 'all three are asked for before the page answers');
 held.open();
 const body = await (await pending).json();
 assert.deepEqual(body.records[0].shown, ['UZS'], 'the page is dated in the currencies read beside it');
 assert.equal(body.records[0].amount, 4.5, 'a single transaction keeps its full precision');
 assert.deepEqual(body.summary.map(row => [row.id, row.estimated_monthly_income]), [['cash', undefined], ['saving', 12.5]], 'the grouped deposits are replaced once');
});

test('a page without a summary asks for no forecast, and an assets page still prices the deposits it read', async () => {
 const started = [];
 const route = loadTS('app/api/records/route.ts', {
  '@/lib/supabase': { session: async () => auth, sameOrigin: () => true, supa: async (path, init) => { started.push(path.split('?')[0]); return Response.json(path.includes('finance_records_page') ? { records: [], ...(JSON.parse(init.body).p_summary ? { summary: [] } : {}), total: 0, page: 1 } : [{ id: 'saving', kind: 'Deposit' }]); } },
  '@/lib/viewer-day-rates': { preferredCurrencies: async () => { started.push('currencies'); return []; }, withViewerDayRates: async data => data },
  '@/lib/deposit-forecasts': { depositForecasts: async (_token, holdings) => { started.push(holdings ? 'deposits from holdings' : 'deposits'); return []; } },
 });
 assert.equal((await route.GET(new Request('https://local/api/records?page=2&section=all&summary=0'))).status, 200);
 assert.deepEqual(started, ['currencies', '/rest/v1/rpc/finance_records_page']);
 started.length = 0;
 assert.equal((await route.GET(new Request('https://local/api/records?page=1&section=assets&summary=1'))).status, 200);
 assert.ok(started.includes('deposits from holdings') && !started.includes('currencies') && !started.includes('deposits'), 'the holdings it read are reused, as before');
});

test('a failed page answers 503 and leaves the reads started beside it handled', async () => {
 const unhandled = []; const note = reason => unhandled.push(reason);
 process.on('unhandledRejection', note);
 try {
  const { GET } = loadTS('app/api/records/route.ts', {
   '@/lib/supabase': { session: async () => auth, sameOrigin: () => true, supa: async () => Response.json({ message: 'down' }, { status: 503 }) },
   '@/lib/viewer-day-rates': { preferredCurrencies: async () => [], withViewerDayRates: async data => data },
   '@/lib/deposit-forecasts': { depositForecasts: async () => { throw Error('Could not load deposit estimates.'); } },
  });
  assert.equal((await GET(new Request('https://local/api/records?page=1&section=all&summary=1'))).status, 503);
  await settle(); await settle();
  assert.deepEqual(unhandled, []);
 } finally { process.off('unhandledRejection', note); }
});

test('planning asks for the currencies and the loan payments that need no loan beside its tables', async () => {
 for (const [scope, own] of [['workspace', true], ['review', true]]) {
  const held = gate(), started = [];
  const { GET } = loadTS('app/api/planning/route.ts', {
   '@/lib/supabase': { session: async () => auth, supa: async () => Response.json([]), sameOrigin: () => true },
   '@/lib/server-records': { readOwnerRows: async (table, _token, extra = {}) => { started.push(extra.action ? table + ':' + extra.action : table); if (!extra.action && table !== 'mortgage_payments') await held.shut; return table === 'mortgage_payments' ? [{ id: 'm', mortgage_id: 'flat', paid_on: '2026-10-01', principal: 100, interest: 20 }] : []; } },
   '@/lib/viewer-day-rates': { preferredCurrencies: async () => { started.push('currencies'); return []; }, withViewerDayRates: async data => data },
   '@/lib/deposit-forecasts': { depositForecasts: async () => [] },
  });
  const pending = GET(new Request('https://local/api/planning?scope=' + scope));
  await settle();
  for (const read of ['finance_records', 'currencies', 'mortgage_payments']) assert.ok(started.includes(read), `${scope}: ${read} starts before the tables answer`);
  assert.equal(started.includes('account_activity:in.(repayment,mortgage)'), own, `${scope}: a period-limited activity read asks for the repayments on its own, at once`);
  held.open();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.ok((await response.json()).debtPayments.some(payment => payment.record_id === 'flat'), `${scope}: the mortgage payment still settles its loan`);
 }
});

test('the household state and the open workspace\'s people are asked for together', async () => {
 const held = gate(), calls = [];
 const { GET } = loadTS('app/api/household/route.ts', {
  'next/headers': { cookies: async () => ({ get: () => undefined, delete: () => {}, set: () => {} }) },
  '@/lib/supabase': { session: async () => ({ ...auth, owner: 'alex' }), sameOrigin: () => true, supa: async (path, init) => { const name = path.replace('/rest/v1/rpc/', ''); calls.push([name, init.headers['x-hoggish-workspace'] ?? Object.values(init.headers)[0]]); if (name === 'household_state') await held.shut; return Response.json(name === 'household_state' ? { me: 'me', name: 'Me', members: [], invites: [], memberships: [{ owner_id: 'alex', name: 'Alex', role: 'member' }] } : [{ id: 'alex', name: 'Alex', role: 'owner' }]); } },
 });
 const pending = GET();
 await settle();
 assert.deepEqual(calls.map(call => call[0]), ['household_state', 'household_people'], 'the people do not wait for the state');
 held.open();
 const body = await (await pending).json();
 assert.equal(body.active, 'alex'); assert.equal(body.role, 'member'); assert.deepEqual(body.people.map(person => person.id), ['alex']);
 assert.equal(calls.length, 2, 'a workspace that stands is not asked for twice');
});

test('the deposits\' histories are read a hundred at a time, all batches together', async () => {
 const held = gate(), asked = [];
 const { depositForecasts } = loadTS('lib/deposit-forecasts.ts', { './supabase': { supa: async path => { asked.push(path); await held.shut; return Response.json([]); } } });
 const deposits = Array.from({ length: 150 }, (_, index) => ({ id: 'd' + index, name: 'Deposit', kind: 'Deposit', currency: 'UZS', amount: 1000, rate: 20, quantity: 1, date: '2026-01-01', frequency: 'Once' }));
 const pending = depositForecasts('owner', deposits);
 await settle();
 assert.equal(asked.length, 2, 'the second batch does not wait for the first');
 assert.match(asked[0], /record_id=in\.\(d0,.*d99\)/); assert.match(asked[1], /record_id=in\.\(d100,.*d149\)/);
 held.open();
 const forecasts = await pending;
 assert.equal(forecasts.length, 150);
});

test('withViewerDayRates dates rows in the currencies it is handed, without reading them again', async () => {
 const read = [];
 const { withViewerDayRates } = loadTS('lib/viewer-day-rates.ts', {
  '@/lib/supabase': { supa: async path => { read.push(path); return Response.json([{ currencies: ['EUR'] }]); } },
  '@/lib/day-rate-tables': { withPlanningDayRates: async (data, currencies) => ({ ...data, currencies }) },
 });
 assert.deepEqual((await withViewerDayRates({ records: [] }, auth, Promise.resolve(['UZS']))).currencies, ['UZS']);
 assert.deepEqual(read, []);
 assert.deepEqual((await withViewerDayRates({ records: [] }, auth)).currencies, ['EUR'], 'a caller that starts none still reads them');
 assert.equal(read.length, 1);
});

test('the market reads as loading from the render its holdings change, so no snapshot is posted on saved prices', async t => {
 t.mock.method(globalThis, 'setInterval', () => 1); t.mock.method(globalThis, 'clearInterval', () => {});
 const r = createRenderer(), asked = [], seen = [];
 const rates = { rates: { USD: 1, UZS: 12500 }, ratesDate: '2026-11-02', fx: null, quotes: {}, errors: {}, stocksConfigured: false };
 const { useMarket } = r.load('hooks/use-market.ts', { '@/lib/refresh-read': { refreshRead: async url => { asked.push(url); return { ok: true, status: 200, json: async () => rates }; } } });
 const list = { entries: [] };
 r.mount(React.createElement(() => { seen.push(useMarket(list.entries, true).loading); return null; }));
 for (let i = 0; i < 4; i++) { await settle(); r.update(); }
 assert.equal(seen.at(-1), false, 'the rates are in');
 seen.length = 0;
 list.entries = [{ kind: 'Stock', name: 'AAPL', metal: null }];
 r.update();
 assert.equal(seen[0], true, 'the first render with the new holding already reads as loading');
 for (let i = 0; i < 4; i++) { await settle(); r.update(); }
 assert.equal(seen.at(-1), false);
 assert.match(asked.at(-1), /stocks=AAPL/);
});

test('benchmark day rates are read first, never queued behind the price feeds', async () => {
 const order = [];
 const { GET } = loadTS('app/api/benchmarks/route.ts', {
  '@/lib/supabase': { session: async () => auth },
  '@/lib/rate-limit': { limits: {}, rateLimited: async () => false },
  '@/lib/deposit-interest': { depositToday: () => '2026-11-02' },
  '@/lib/benchmark-fx': { benchmarkFx: async () => { order.push('fx'); return []; } },
  '@/lib/price-history-cache': { keptHistory: async id => { order.push(id); return []; } },
  '@/lib/after-response': { afterResponse: () => {} },
 });
 const before = process.env.TWELVE_DATA_API_KEY; process.env.TWELVE_DATA_API_KEY = 'test-only';
 try {
  const response = await GET(new Request('https://local/api/benchmarks?start=2026-01-01&end=2026-11-02&benchmarks=SPY,HYG,BTC'));
  assert.equal(response.status, 200);
  assert.equal(order[0], 'fx');
  assert.deepEqual(order.slice(1).sort(), ['crypto:BTC', 'stock:HYG', 'stock:SPY']);
 } finally { if (before === undefined) delete process.env.TWELVE_DATA_API_KEY; else process.env.TWELVE_DATA_API_KEY = before; }
});
