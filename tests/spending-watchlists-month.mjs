import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTS } from './helpers/load-ts.mjs';

// A watchlist tracks this calendar month, while Cash flow's planning read follows the month picker.
const list = { id: 'w', name: 'Food', query: '', category: '', currency: 'USD', target: 100 };
const spend = (id, date, amount) => ({ id, name: id, kind: 'Living expense', frequency: 'Once', date, amount, currency: 'USD', notes: '', quantity: 1, cost: 0, rate: 0 });
const preferences = { data: { preferences: [{ key: 'watchlists', data: { items: [list] } }] }, loading: false, error: '', retry() {}, save: async () => {} };
function render(props, reply = { records: [spend('nov', '2026-11-01', 40)] }, state = {}) {
 const asked = [];
 const { SpendingWatchlists } = loadTS('components/spending-watchlists.tsx', {
  '@/components/language-provider': { useLanguage: () => ({ locale: 'en-US', t: (text, values = {}) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? key) }) },
  '@/hooks/use-owner-resource': { useOwnerResource: (url, owner, enabled) => { asked.push([url, enabled]); return { data: { categories: [], ...reply }, error: '', initialLoading: false, retry() {}, ...state }; } },
 });
 const html = renderToStaticMarkup(React.createElement(SpendingWatchlists, { data: { records: [spend('oct', '2026-10-20', 70)], categories: [] }, splits: [], today: '2026-11-02', currency: 'USD', currencies: ['USD'], market: { rates: { USD: 1 }, quotes: {} }, preferences, ...props }));
 return { html, asked };
}

test('on a past month a watchlist reads this month for itself', () => {
 const { html, asked } = render({ owner: 'owner', month: '2026-10' });
 assert.deepEqual(asked, [['/api/planning?scope=review&month=2026-11', true]]);
 assert.match(html, /\$40 \/ \$100/); assert.doesNotMatch(html, /\$70/);
});

test('on this month, and in the sample workspace, the page\'s records stand in', () => {
 const current = render({ owner: 'owner', month: '2026-11', data: { records: [spend('nov', '2026-11-01', 25)], categories: [] } });
 assert.equal(current.asked[0][1], false); assert.match(current.html, /\$25 \/ \$100/);
 assert.equal(render({ owner: null, demo: true, month: '2026-10' }).asked[0][1], false);
});

test('a failed read shows the error, never a month with nothing spent', () => {
 const { html } = render({ owner: 'owner', month: '2026-10' }, { records: [] }, { error: 'Offline' });
 assert.match(html, /Offline/); assert.doesNotMatch(html, /\$0 \/ \$100/);
});
