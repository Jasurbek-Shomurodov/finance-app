import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTS } from './helpers/load-ts.mjs';
const { incomeStillExpected, billsStillDue, monthOutlook } = loadTS('lib/cash-flow-outlook.ts');

const same = amount => amount;
const card = (amount, receivedAmount, extra = {}) => ({ amount, receivedAmount, excluded: false, missing: 0, entry: { currency: 'USD' }, ...extra });
const due = (kind, amount, date, extra = {}) => ({ key: kind + date, record: { kind, currency: 'USD' }, date, amount, overdue: false, type: 'scheduled', ...extra });

test('income still expected is every source’s shortfall: a source ahead of its estimate never lowers another’s', () => {
 assert.equal(incomeStillExpected([card(1000, 0), card(500, 200), card(300, 450)], same), 1300);
 assert.equal(incomeStillExpected([card(1000, 0), card(700, 700, { excluded: true })], same), 1000, 'income outside a schedule expects nothing');
 // Each source converts from its own currency; one no rate converts leaves the total unknown, never too low.
 const convert = (amount, currency) => currency === 'USD' ? amount : currency === 'EUR' ? amount * 2 : null;
 assert.equal(incomeStillExpected([card(1000, 0), card(100, 40, { entry: { currency: 'EUR' } })], convert), 1120);
 assert.equal(incomeStillExpected([card(1000, 0), card(100, 0, { entry: { currency: 'GBP' } })], convert), null);
 assert.equal(incomeStillExpected([card(1000, 0, { missing: 1 })], same), null, 'a payment without a rate leaves what was received unknown');
});

test('bills still due are this month’s open scheduled bills; loan payments and income are not spending', () => {
 const items = [due('Living expense', 120, '2026-11-20'), due('Other expense', 30, '2026-11-28'), due('Salary', 5000, '2026-11-25'),
  due('Living expense', 99, '2026-10-20'), due('Living expense', 77, '2026-12-01'), due('Mortgage', 1480, '2026-11-11', { type: 'installment' })];
 assert.equal(billsStillDue(items, '2026-11', same), 150);
 assert.equal(billsStillDue(items, '2026-11', () => null), null);
 assert.equal(billsStillDue([], '2026-11', same), 0);
});

test('the outlook adds what is still to come to what the month has brought, for the running month only', () => {
 const base = { month: '2026-11', today: '2026-11-14', received: 4000, spent: 3000, incomeExpected: 6000, billsDue: 500, spendingEstimate: 5000 };
 assert.deepEqual(monthOutlook(base), { day: 14, days: 30, through: '2026-11-30', income: 6000, bills: 500, other: 1500, surplus: 5000, rate: 50 });
 assert.equal(monthOutlook({ ...base, month: '2026-10' }), null, 'a past month has nothing still to come');
 // Spending already past its estimate: nothing more is expected beyond the bills, which are owed whatever the estimate says.
 const over = monthOutlook({ ...base, spent: 5200 });
 assert.deepEqual([over.other, over.surplus], [0, 4000 - 5200 + 6000 - 500]);
 // An unknown estimate or an unconverted amount leaves the surplus unknown, never a partial figure.
 const unknown = monthOutlook({ ...base, spendingEstimate: null });
 assert.deepEqual([unknown.income, unknown.bills, unknown.other, unknown.surplus, unknown.rate], [6000, 500, null, null, null]);
 assert.equal(monthOutlook({ ...base, received: null, spent: null }).surplus, null);
 assert.equal(monthOutlook({ ...base, received: 0, incomeExpected: 0 }).rate, null, 'no income, no rate');
});

test('the closing card and the month bar read whole amounts, written dates and a dash for what is unknown', () => {
 const language = { useLanguage: () => ({ locale: 'en-US', t: (text, values = {}) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? key) }) };
 const plain = tag => function Plain({ children, ...props }) { return React.createElement(tag, Object.fromEntries(Object.entries(props).filter(([key]) => ['className', 'href', 'disabled', 'aria-label'].includes(key))), children); };
 const modules = { '@/components/language-provider': language, '@/components/presentation-foundation/drawer-link': { DrawerLink: plain('a') }, '@/components/ui/button': { Button: plain('button') },
  '@/components/presentation-foundation/date-picker': { DatePicker: function DatePicker({ value }) { return React.createElement('time', null, value); } }, '@/lib/deposit-interest': { depositToday: () => '2026-11-14' } };
 const { StillToCome } = loadTS('components/cash-flow/still-to-come.tsx', modules);
 const outlook = { day: 14, days: 30, through: '2026-11-30', income: 6000.4, bills: 500, other: 1500, surplus: 5000.4, rate: 50 };
 const card = renderToStaticMarkup(React.createElement(StillToCome, { outlook, month: '2026-11', currency: 'USD' }));
 assert.match(card, /Still to come <span class="panel-figure">November 2026<\/span>/);
 assert.match(card, /Income expected<\/dt><dd class="positive">\+\$6,000</);
 assert.match(card, /Bills due<\/dt><dd>\$500</);
 assert.match(card, /Projected net cash flow<\/dt><dd class="positive">\+\$5,000</);
 assert.doesNotMatch(card, /\$[\d,]+\.\d/, 'no decimal tails');
 const unknown = renderToStaticMarkup(React.createElement(StillToCome, { outlook: { ...outlook, other: null, surplus: null }, month: '2026-11', currency: 'USD' }));
 assert.match(unknown, /Other expected spending<\/dt><dd>—</);
 assert.match(unknown, /Projected net cash flow<\/dt><dd>—</);
 const { CashFlowMonthBar } = loadTS('components/cash-flow/month-bar.tsx', modules);
 const bar = (month, shown) => renderToStaticMarkup(React.createElement(CashFlowMonthBar, { month, onChange() {}, outlook: shown, currency: 'USD' }));
 assert.match(bar('2026-11', outlook), /Day 14 of 30/);
 assert.match(bar('2026-11', outlook), /\$6,000 income still expected/);
 assert.match(bar('2026-11', outlook), /aria-label="Next month" disabled=""/, 'no month after the running one');
 assert.doesNotMatch(bar('2026-10', null), /Day \d|still expected|aria-label="Next month" disabled/);
});
