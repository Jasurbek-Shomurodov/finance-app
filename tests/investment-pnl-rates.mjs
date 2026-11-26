import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer } from './helpers/component-tree.mjs';

// Investments' Profit & loss converts each payment at its own day's rate. The history read already brings those rates
// (`fx`), so the screen must not wait for that read and then ask the comparison feed for them again (PERF).
const today = '2026-11-26';
const r = createRenderer(), asked = [];
let history = null;
const rates = r.load('hooks/use-rate-history.ts', { '@/lib/refresh-read': { refreshRead: async () => { throw Error('not used'); } } });
const { useInvestmentPnl } = r.load('hooks/use-investment-pnl.ts', {
 '@/hooks/use-portfolio-history': { usePortfolioHistory: () => ({ history, error: false, retry: () => {} }) },
 '@/hooks/use-rate-history': { datedRate: rates.datedRate, useRateHistory: (start, end, demo) => { asked.push([start, end, demo]); return undefined; } },
 '@/lib/deposit-interest': { depositToday: () => today },
});
const event = { id: 'e', record_id: 'btc', event_type: 'baseline', amount: 0, occurred_on: '2025-02-01', created_at: '2025-02-01T10:00:00Z', balance: 100, ownership_percentage: 100, principal: 0, interest: 0, notes: '' };
const base = { records: [], events: [event], cashflows: [], movements: [], operations: [] };

test('the history\'s own day rates are used, and the comparison feed is not asked for them', () => {
 let result;
 const Probe = () => { result = useInvestmentPnl({ owner: 'me', demo: false, revision: 0, records: [], currency: 'UZS', market: null }); return null; };
 history = { ...base, fx: [{ date: '2025-01-28', rates: { USD: 1, UZS: 12800 } }] };
 r.mount(React.createElement(Probe));
 assert.deepEqual(asked.at(-1), [null, today, false], 'no rate read is started');
 assert.equal(result.rate('USD', 'UZS', '2025-03-01'), 12800);
 r.unmount();
});

test('a history without kept rates still asks the comparison feed from its first event', () => {
 let result;
 const Probe = () => { result = useInvestmentPnl({ owner: 'me', demo: false, revision: 0, records: [], currency: 'UZS', market: null }); return null; };
 history = { ...base, fx: [] };
 r.mount(React.createElement(Probe));
 assert.deepEqual(asked.at(-1), ['2025-02-01', today, false]);
 assert.equal(result.rate, undefined);
 r.unmount();
});
