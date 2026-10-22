import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTS } from './helpers/load-ts.mjs';

const language = { '@/components/language-provider': { useLanguage: () => ({ locale: 'en-US', t: (text, values = {}) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? key) }) } };

test('the dashboard board opens one column with its lead, ahead of the cards and not one of them', () => {
 const { DashboardBoard } = loadTS('components/dashboard-board.tsx', language);
 const { defaultDashboardLayout } = loadTS('lib/dashboard-layout.ts');
 const cards = { net_worth: React.createElement('section', null, 'NW'), goals: React.createElement('section', null, 'GO'), spending: null };
 const html = renderToStaticMarkup(React.createElement(DashboardBoard, { layout: defaultDashboardLayout, cards, lead: { column: 'right', node: React.createElement('b', null, 'FIGURES') }, onChange() {} }));
 const [left, right] = html.split('data-column=').slice(1);
 assert.ok(left.includes('NW') && !left.includes('FIGURES'));
 assert.match(right, /<div class="dashboard-lead"><b>FIGURES<\/b><\/div>.*GO/, 'the figures, then the column\'s cards');
 assert.equal(html.match(/dashboard-card/g).length, 2, 'the lead is no card: only net worth and goals are placed');
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(DashboardBoard, { layout: defaultDashboardLayout, cards, onChange() {} })), /dashboard-lead/);
});

test('spending against last month is a difference only when there is something to compare', () => {
 const { paceDifference } = loadTS('components/spending-pace-card.tsx', { ...language, '@/components/charts-lazy': { SpendingPaceChart: () => null }, '@/hooks/use-owner-resource': { useOwnerResource: () => ({}) } });
 const pace = (spent, previousToDate, extra = {}) => ({ pace: { spent, previousToDate, missing: false, empty: false, ...extra }, loading: false });
 assert.equal(paceDifference(pace(3871, 5508)), -1637);
 assert.equal(paceDifference(pace(200, 171)), 29);
 assert.equal(paceDifference(pace(0, 0)), null, 'nothing spent either month');
 assert.equal(paceDifference(pace(10, 5, { missing: true })), null, 'a rate is missing');
 assert.equal(paceDifference({ ...pace(10, 5), loading: true }), null, 'still loading');
});
