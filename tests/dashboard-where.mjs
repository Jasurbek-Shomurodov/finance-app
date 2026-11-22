import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTS } from './helpers/load-ts.mjs';

const { formatDate, formatMonthYear } = loadTS('lib/format.ts');
const t = (message, values = {}) => message.replace(/\{(\w+)\}/g, (_, key) => String(values[key]));
const where = loadTS('components/dashboard-where.tsx', {
 '@/components/language-provider': { useLanguage: () => ({ locale: 'en-US', t }) },
 '@/components/presentation-foundation/drawer-link': { DrawerLink: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
 '@/components/presentation-foundation/category-icon': { CategoryIcon: ({ kind }) => React.createElement('i', { 'data-icon': kind }) },
 '@/components/presentation-foundation/loading-placeholder': { LoadingPlaceholder: ({ label }) => React.createElement('p', { 'data-loading': label }) },
 '@/components/presentation-foundation/inline-error': { InlineError: ({ message }) => React.createElement('p', { role: 'alert' }, message) },
 '@/components/presentation-foundation/empty-state': { EmptyState: ({ description }) => React.createElement('p', { 'data-empty': '' }, description) },
 '@/components/presentation-foundation/panel-title': { PanelTitle: ({ title, children }) => React.createElement('header', null, title, children) },
});
const plain = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const spending = (current, previous, extra = {}) => ({ loading: false, error: '', retry() {}, pace: { month: '2026-11' }, month: { categories: current, missing: false }, before: { categories: previous, missing: false }, ...extra });
const budget = (over = [], extra = {}) => ({ loading: false, error: '', missing: false, over, ...extra });
const figures = (extra = {}) => ({ overdue: [], forecast: null, ...extra });
const categories = [{ id: 'Living expense', name: 'Living expense' }, { id: 'gym', name: 'Gym' }];
const render = props => renderToStaticMarkup(React.createElement(where.WhereCard, { categories, currency: 'USD', ...props }));

test('the card ranks this month\'s categories with their share and change, flags the biggest increase and links each to Transactions', () => {
 const state = spending([{ id: 'Living expense', amount: 600 }, { id: 'gym', amount: 200 }, { id: 'Rent expense', amount: 0 }], [{ id: 'Living expense', amount: 400 }, { id: 'gym', amount: 250 }]);
 const glance = where.dashboardGlance({ spending: state, budget: budget(), figures: figures() });
 assert.deepEqual(glance.where.rows.map(row => row.key), ['Living expense', 'gym'], 'largest first, nothing for a category with no spending');
 const html = render({ spending: state, glance });
 const text = plain(html);
 assert.match(text, new RegExp(`Where it is going ${formatMonthYear('2026-11', 'en-US')}`));
 assert.match(text, /Living expense Biggest increase 75% · \+\$200 \$600/);
 assert.match(text, /Gym 25% · −\$50 \$200|Gym 25% · -\$50 \$200/);
 assert.match(html, /aria-label="Living expense: \$600, 75%. \$200 more than last month by this day"/, 'the change is said in words, not colour alone');
 assert.match(html, /aria-label="Gym: \$200, 25%. \$50 less than last month by this day"/);
 assert.match(html, /href="\/transactions\?[^"]*category=gym/, 'a row opens that category\'s spending');
 assert.match(html, /data-icon="Gym"/);
 // The mover is not over budget here, so What to improve names it.
 assert.match(text, /What to improve Living expense is up \$200 on last month/);
});

test('What to improve leads with an overdue payment and the day cash runs out, and leaves out a mover already over budget', () => {
 const state = spending([{ id: 'gym', amount: 300 }], [{ id: 'gym', amount: 100 }]);
 const overdue = [{ record: { id: 'car', name: 'Car loan' }, date: '2026-11-02' }];
 const forecast = { missing: 0, totals: [{ belowZero: '2026-11-28' }] };
 const one = where.dashboardGlance({ spending: state, budget: budget([{ key: 'gym', amount: 40 }]), figures: figures({ overdue, forecast }) });
 assert.deepEqual(one.improve.map(line => line.kind), ['overdue', 'below_zero', 'over_budget'], 'three at most, and the mover is the category already over');
 const text = plain(render({ spending: state, glance: one }));
 assert.match(text, /Car loan is overdue/);
 assert.match(text, new RegExp(`Cash goes below zero on ${formatDate('2026-11-28', 'en-US')}`));
 assert.match(text, /Gym is \$40 over budget/);
 const html = render({ spending: state, glance: one });
 assert.match(html, /href="\/upcoming#pay=/, 'one late payment opens its own Record payment');
 assert.match(html, /href="\/income-expenses#forecast"/);
 assert.match(html, /href="\/budget"/);
 const several = where.dashboardGlance({ spending: state, budget: budget(), figures: figures({ overdue: [...overdue, { record: { id: 'rent', name: 'Rent' }, date: '2026-11-05' }] }) });
 const many = render({ spending: state, glance: several });
 assert.match(plain(many), /2 payments are overdue/);
 assert.match(many, /href="\/upcoming"/, 'several open the list they are in');
 // A budget that is still loading, failed or unconverted says nothing about being over.
 for (const state2 of [{ loading: true }, { error: 'down' }, { missing: true }]) {
  assert.ok(!where.dashboardGlance({ spending: state, budget: budget([{ key: 'gym', amount: 40 }], state2), figures: figures() }).improve.some(line => line.kind === 'over_budget'));
 }
});

test('loading, a failed read, an unconverted month and an empty month each say so, and nothing to improve draws nothing', () => {
 const empty = spending([], []);
 const quiet = where.dashboardGlance({ spending: empty, budget: budget(), figures: figures() });
 assert.deepEqual(quiet.improve, []);
 const html = render({ spending: empty, glance: quiet });
 assert.match(html, /data-empty/);
 assert.match(plain(html), /Nothing recorded in this period/);
 assert.doesNotMatch(html, /What to improve/);
 const loading = spending([], [], { loading: true });
 assert.equal(where.dashboardGlance({ spending: loading, budget: budget(), figures: figures() }).where, null, 'nothing is ranked while loading');
 assert.match(render({ spending: loading, glance: { where: null, improve: [] } }), /data-loading="Loading records…"/);
 assert.match(render({ spending: spending([], [], { error: 'Could not load' }), glance: { where: null, improve: [] } }), /role="alert">Could not load/);
 const missing = spending([{ id: 'gym', amount: 10 }], [], { before: { categories: [], missing: true } });
 const unconverted = where.dashboardGlance({ spending: missing, budget: budget(), figures: figures() });
 assert.equal(unconverted.where, null, 'a month holding an amount no rate converts ranks nothing');
 assert.match(plain(render({ spending: missing, glance: unconverted })), /Some transactions could not be converted/);
});
