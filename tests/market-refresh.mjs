import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';

const { quotedRecords } = loadTS('lib/workspace-totals.ts');
const quotes = { rates: { USD: 1, UZS: 12500 }, ratesDate: '2026-11-02', fx: null, quotes: {}, errors: {}, stocksConfigured: false };

function market(replies) {
 const r = createRenderer(), asked = [];
 const { useMarket } = r.load('hooks/use-market.ts', { '@/lib/refresh-read': { refreshRead: async url => { asked.push(url); const next = replies.shift(); if (next instanceof Error) throw next; return { ok: true, status: 200, json: async () => next }; } } });
 let state;
 const list = { entries: [] };
 const Probe = () => { state = useMarket(list.entries, true); return null; };
 const settle = async () => { for (let i = 0; i < 4; i++) { await new Promise(resolve => setTimeout(resolve, 0)); r.update(); } };
 return { r, Probe, list, asked, settle, state: () => state };
}

test('a failed refresh keeps the rates already held, and says so (PERF-012)', async t => {
 const timers = []; t.mock.method(globalThis, 'setInterval', callback => { timers.push(callback); return 1; }); t.mock.method(globalThis, 'clearInterval', () => {});
 globalThis.document = { hidden: false };
 try {
  const page = market([quotes, Error('offline')]);
  page.r.mount(React.createElement(page.Probe));
  await page.settle();
  assert.equal(page.state().market.rates.UZS, 12500);
  timers[0]();
  await page.settle();
  assert.equal(page.state().market?.rates.UZS, 12500, 'totals keep converting until the next refresh');
  assert.equal(page.state().error, 'Market prices unavailable. Saved prices are shown.');
 } finally { delete globalThis.document; }
});

test('the first read that fails leaves no market, as before', async t => {
 t.mock.method(globalThis, 'setInterval', () => 1); t.mock.method(globalThis, 'clearInterval', () => {});
 const page = market([Error('offline')]);
 page.r.mount(React.createElement(page.Probe));
 await page.settle();
 assert.equal(page.state().market, null);
 assert.equal(page.state().error, 'Market prices unavailable. Saved prices are shown.');
});

test('the same holdings from another list, in another order, ask for nothing new', async t => {
 t.mock.method(globalThis, 'setInterval', () => 1); t.mock.method(globalThis, 'clearInterval', () => {});
 const coin = { kind: 'Crypto', name: 'BTC', metal: null }, stock = { kind: 'Stock', name: 'AAPL', metal: null };
 const page = market([quotes, quotes]);
 page.list.entries = [coin, stock, coin];
 page.r.mount(React.createElement(page.Probe));
 await page.settle();
 page.list.entries = [stock, coin];
 page.r.update();
 await page.settle();
 assert.equal(page.asked.length, 1);
});

test('Settings reads no records page, so the planning holdings are quoted there and only there', () => {
 const planning = [{ id: 'p' }], summary = [{ id: 's' }];
 assert.equal(quotedRecords('Settings', [], planning), planning, 'the PDF report keeps live quotes on a reloaded Settings');
 assert.equal(quotedRecords('Settings', summary, planning), summary, 'a summary already read stands');
 assert.deepEqual(quotedRecords('Budget', [], planning), [], 'other screens wait for their summary, so nothing is read twice');
});
