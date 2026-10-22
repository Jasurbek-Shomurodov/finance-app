import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, hostModule, stubs, text } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';

// Cash flow's Forecast view against stand-ins for the UI kit: it waits for its records, shows a failed read with Retry,
// warns before cash goes below zero and says when an amount has no rate (MONEY-008).
const r = createRenderer();
const ui = stubs();
const { depositToday } = loadTS('lib/deposit-interest.ts');
const { shiftDay } = loadTS('lib/calendar-days.ts');
const today = depositToday();
const modules = {
 ...ui.modules,
 'lucide-react': hostModule(), '@/components/charts-lazy': hostModule(), '@/components/display-money': { useDisplayMoney: () => ({ entered: amount => String(amount), enteredSigned: amount => String(amount) }) },
 ...Object.fromEntries(['category-icon', 'count', 'date-picker', 'drawer-link', 'empty-state', 'formatted-number-input', 'info-hint', 'inline-error', 'loading-placeholder', 'panel-title', 'segmented', 'stat-tile', 'rolling-text'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])),
 '@/components/presentation-foundation/tone': { signTone: value => value < 0 ? 'negative' : undefined },
 '@/components/ui/input': hostModule(), '@/components/ui/native-select': hostModule(),
};
const { CashForecastView } = r.load('components/cash-forecast.tsx', modules);
const cash = { id: 'cash', name: 'Checking', kind: 'Cash', currency: 'USD', amount: 100, quantity: 1, cost: 0, rate: 0, date: '2026-01-01', frequency: 'Once', notes: '' };
const rent = (extra = {}) => ({ id: 'rent', name: 'Rent', kind: 'Living expense', currency: 'USD', amount: 900, quantity: 1, cost: 0, rate: 0, date: shiftDay(today, 3), frequency: 'Monthly', notes: '', ...extra });
const data = records => ({ records, occurrences: [], debtPayments: [], goals: [], categories: [], activity: [] });
const view = props => { r.mount(React.createElement(CashForecastView, { owner: 'me', data: data([cash]), currency: 'USD', rates: { USD: 1 }, loading: false, error: '', onRetry() {}, ...props })); return r; };
const found = type => r.all(node => node.type === type);

test('the forecast waits for its records and shows a failed read with Retry', () => {
 view({ loading: true });
 assert.equal(found('PanelSkeleton').length, 1);
 let retried = 0;
 view({ error: 'Could not load records.', onRetry: () => retried++ });
 const error = found('InlineError')[0];
 assert.equal(error.props.message, 'Could not load records.');
 error.props.onRetry();
 assert.equal(retried, 1);
});

test('the forecast warns before total cash goes below zero', () => {
 view({ data: data([cash, rent()]) });
 assert.equal(found('StatTile').length, 3, 'cash today, the lowest balance and the end of the horizon');
 assert.match(text(r.tree ?? []), /Projected to go below zero/);
 view({});
 assert.doesNotMatch(text(r.tree ?? []), /Projected to go below zero/, 'no warning while cash stays above zero');
});

test('an amount no rate converts is left out of total cash and the view says so', () => {
 view({ data: data([cash, rent({ currency: 'EUR' })]) });
 assert.ok(r.all(node => node.type === 'p' && node.props.role === 'status').some(node => /could not be converted/.test(text(node))));
});
