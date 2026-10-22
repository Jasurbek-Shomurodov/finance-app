import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

const { netWorthPoints, netWorthTrend } = loadTS('lib/net-worth-series.ts');
const { shiftDay } = loadTS('lib/calendar-days.ts');
const today = '2026-10-22';
const entry = (id, kind, amount, extra = {}) => ({ id, name: id, kind, amount, currency: 'USD', frequency: 'One time', date: '2025-01-01', notes: '', quantity: 1, cost: 0, rate: 0, ...extra });

test('net worth points end on today\'s figure from the records', () => {
 const entries = [entry('cash', 'Cash', 5000), entry('card', 'Debt', 1200)];
 const { net, points } = netWorthPoints(null, entries, 'USD', undefined, today);
 assert.equal(net, 3800);
 assert.deepEqual(points.at(-1), { date: today, assets: 5000, debt: 1200, net: 3800 });
});

test('the trend covers the last year, says when the history is shorter, and gives no change for partial points', () => {
 const year = [{ date: '2025-01-10', assets: 100, debt: 0, net: 100 }, { date: '2026-03-01', assets: 150, debt: 0, net: 150 }, { date: today, assets: 200, debt: 0, net: 200 }];
 const full = netWorthTrend(year, 200, today);
 assert.equal(full.values[0], 100, 'the point before the window starts the year');
 assert.equal(full.change, 100);
 assert.equal(full.percent, 100, '+100 on a starting 100');
 assert.ok(full.fullYear);
 const short = netWorthTrend(year.slice(1), 200, today);
 assert.equal(short.change, 50);
 assert.equal(short.fullYear, false);
 assert.equal(netWorthTrend([{ ...year[0], date: shiftDay(today, -10), partial: true }, year[2]], 200, today).change, null);
});
