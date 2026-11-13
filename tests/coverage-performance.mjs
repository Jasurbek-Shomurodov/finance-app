import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, hostModule, stubs, text } from './helpers/component-tree.mjs';

const { depositToday } = loadTS('lib/deposit-interest.ts');
const { shiftDay } = loadTS('lib/calendar-days.ts');
const today = depositToday(), ago = days => shiftDay(today, -days);
const record = (id, kind, amount, extra = {}) => ({ id, name: id, kind, amount, currency: 'USD', quantity: 1, cost: 0, rate: 0, date: ago(400), frequency: 'Once', notes: '', ...extra });
const event = (id, record_id, event_type, amount, occurred_on, balance = null) => ({ id, record_id, event_type, amount, occurred_on, created_at: occurred_on + 'T10:00:00Z', balance, ownership_percentage: 100, principal: 0, interest: 0, notes: '' });

const r = createRenderer(), ui = stubs();
const errors = [], reads = [];
let rate, fetched = { ok: true, fx: [{ date: ago(500), rates: { UZS: 10000 } }] };
const foundation = Object.fromEntries(['empty-state', 'inline-error', 'loading-placeholder', 'panel-title', 'stat-tile', 'segmented', 'count', 'category-icon', 'record-icon', 'delete-button', 'drawer-link'].map(name => ['@/components/presentation-foundation/' + name, hostModule()]));
const base = {
 ...ui.modules, ...foundation, 'lucide-react': hostModule(), recharts: hostModule(),
 '@/components/presentation-foundation/chart': hostModule({ chartHeight: { compact: 220 }, chartColors: { income: 'green', loss: 'red' }, leadArea: id => ({ fill: id }), moneyTick: () => value => 'M' + value, monthTick: () => month => 'T' + month, monthLabel: () => month => 'L' + month }),
 '@/components/presentation-foundation/tone': { signTone: value => value > 0 ? 'positive' : value < 0 ? 'negative' : undefined },
 '@/lib/feedback': { showError: message => errors.push(message) },
 '@/lib/refresh-read': { refreshRead: async url => { reads.push(url); if (fetched.fail) throw Error('offline'); return { ok: fetched.ok, json: async () => ({ fx: fetched.fx }) }; } },
 '@/components/charts-lazy': hostModule(),
 'next/dynamic': { __esModule: true, default: (load, options) => Object.assign(function Lazy() { void load(); return options.loading(); }, { load }) },
};
const lazy = r.load('components/performance/performance-charts-lazy.tsx', base);
const charts = r.load('components/performance/performance-charts.tsx', base);
const { PerformanceView } = r.load('components/performance/performance-view.tsx', { ...base, '@/components/performance/performance-charts-lazy': charts, '@/hooks/use-rate-history': { useRateHistory: () => rate } });

const market = { rates: { USD: 1, UZS: 12000 }, quotes: { 'Crypto:BTC': { usd: 50000, source: 'test', fetchedAt: today } }, errors: {}, fx: null, stocksConfigured: false };
const records = [
 record('home', 'Property', 120000), record('BTC', 'Crypto', 50000, { quantity: 1.5, cost: 40000, holding_account_id: 'wallet' }),
 record('KO', 'Stock', 60, { quantity: 10, cost: 50 }), record('ring', 'Valuables', 900),
];
const events = [
 event('home-open', 'home', 'baseline', 0, ago(380), 120000), event('rent-1', 'home', 'income', 6000, ago(200)), event('fix', 'home', 'expense', 2400, ago(100)),
 event('ko-open', 'KO', 'baseline', 0, ago(300), 500), event('ko-1', 'KO', 'income', 10, ago(190)), event('ko-2', 'KO', 'income', 12, ago(100)), event('ko-3', 'KO', 'income', 12, ago(10)),
 event('ring-buy', 'ring', 'contribution', 1000, ago(300), 1000), event('ring-sell', 'ring', 'withdrawal', 300, ago(40), 900), event('ring-old', 'ring', 'withdrawal', 100, ago(700), 900),
 event('btc-open', 'BTC', 'baseline', 0, ago(300), 60000),
];
const movements = [{ id: 'm1', kind: 'buy', source_id: 'cash', target_id: 'BTC', sent: 25000, received: .5, source_value: 25000, target_value: 25000, fee: 0, occurred_on: ago(50), notes: '' }];
const saved = [];
const preferences = (items, fail) => ({ data: { preferences: items ? [{ key: 'price_alerts', data: { items } }] : [] }, save: async preference => { if (fail) throw fail === true ? 'no' : Error(fail); saved.push(preference); } });
const history = { records, events, movements, cashflows: [] };
const open = (props = {}) => r.mount(React.createElement(PerformanceView, { history, error: false, onRetry() {}, currency: 'USD', market, accounts: [{ id: 'wallet', name: 'Cold wallet', kind: 'Crypto', currency: 'USD' }], preferences: preferences(), demo: false, ...props }));
const panel = title => r.find(node => node.type === 'section' && text(r.all(byType('PanelTitle'), node)[0]?.props.title ?? '').includes(title));
const named = name => node => node.type?.displayName === name;
const tile = label => r.find(node => node.type === 'StatTile' && node.props.label === label).props;

test('the view waits for history, reports a failed read, and says when nothing is held', () => {
 open({ history: null });
 assert.equal(r.find(byType('PanelSkeleton')).props.label, 'Loading history…');
 let retried = false;
 open({ history: null, error: true, onRetry: () => { retried = true; } });
 r.find(byType('InlineError')).props.onRetry();assert.ok(retried);
 open({ history: { records: [], events: [] } });
 assert.equal(r.find(byType('EmptyState')).props.title, 'No performance yet');
});

test('the headline adds up its lines, and the currency line shows only with dated rates', () => {
 rate = undefined;open();
 const hero = text(r.find(node => node.props?.className === 'panel performance-hero'));
 assert.match(hero, /Profit & loss/);assert.match(hero, /Value today\$196,500/);
 assert.doesNotMatch(hero, /Currency effect/);
 assert.equal(tile('Simple return').tone, 'positive');assert.match(String(tile('Money-weighted return').value), /a year|—/);
 assert.equal(r.all(node => node.type === 'p' && text(node).includes('left out')).length, 0);
 rate = () => 1;open({ history: { ...history, records: [...records, record('lira', 'Valuables', 5, { currency: 'TRY' })] } });
 assert.match(text(r.find(node => node.props?.className === 'performance-lines')), /Currency effect/);
 assert.ok(r.all(node => node.type === 'p' && text(node).includes('Some holdings or payments are left out')).length);
 rate = undefined;
});

test('the breakdown lists holdings, then classes and accounts with their counts', () => {
 open();
 const table = () => text(r.find(node => node.type === 'tbody'));
 assert.match(table(), /BTCCrypto/);assert.match(table(), /\+\$15,000/);
 const group = () => r.find(node => node.type === 'Segmented' && node.props.label === 'Group profit and loss by');
 r.fire(group(), 'onChange', 'class');
 assert.match(table(), /Property1 holding/);assert.equal(r.all(node => node.type === 'tr', r.find(node => node.type === 'tbody')).length, 4);
 r.fire(group(), 'onChange', 'account');
 assert.match(table(), /Cold wallet1 holding/);assert.match(table(), /No account3 holdings/);
});

test('realized gains show a year, switch years and download that year\'s rows', async () => {
 open();
 const section = () => panel('Realized gains');
 assert.match(text(section()), /Sold for \$300/);
 const years = r.find(node => node.type === 'Segmented' && node.props.label === 'Year');
 assert.equal(years.props.options.length, 2);
 const made = [];
 globalThis.document = { createElement: () => ({ click() { made.push(this.download); }, remove() {} }), body: { appendChild() {} } };
 const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
 URL.createObjectURL = () => 'blob:x';URL.revokeObjectURL = () => {};
 try { r.find(node => named('Button')(node) && text(node).includes('Download CSV'), section()).props.onClick(); } finally { URL.createObjectURL = create;URL.revokeObjectURL = revoke;delete globalThis.document; }
 assert.deepEqual(made, [`realized-gains-${ago(40).slice(0, 4)}.csv`]);
 r.fire(years, 'onChange', years.props.options[1].value);
 assert.match(text(section()), /Sold for \$100/);
 open({ history: { ...history, events: events.filter(item => item.event_type !== 'withdrawal') } });
 assert.match(r.find(byType('EmptyState'), section()).props.description, /Nothing sold yet/);
});

test('payouts are grouped by month in the display currency, or explain how to get them', () => {
 open();
 const section = panel('Expected payouts');
 assert.match(text(section), /KO/);assert.match(text(section), /\+\$12/);
 assert.equal(r.find(byType('DrawerLink'), section).props.href, '/income-expenses');
 open({ history: { ...history, records: records.map(item => item.id === 'KO' ? { ...item, currency: 'TRY' } : item) } });
 assert.match(text(r.find(byType('PanelTitle'), panel('Expected payouts')).props.title), /Expected payouts —/);
 open({ history: { ...history, events: events.filter(item => item.event_type !== 'income') } });
 assert.match(r.find(byType('EmptyState'), panel('Expected payouts')).props.description, /No payouts expected yet/);
});

test('a property shows its yield and cap rate, and Bitcoin its ladder and a DCA plan', () => {
 open();
 assert.match(text(panel('Rental yield')), /Gross yield5%Cap rate3%/);
 const bitcoin = panel('Bitcoin');
 assert.equal(r.all(node => node.props?.className === 'ladder-lot', bitcoin).length, 2);
 assert.match(text(bitcoin), /Earlier purchases/);assert.match(text(bitcoin), /New average buy price/);
 const inputs = r.all(named('FormattedNumberInput'), bitcoin);
 r.fire(inputs[0], 'onValueChange', 0);
 assert.match(text(panel('Bitcoin')), /Enter an amount and a number of buys\./);
 r.fire(r.all(named('FormattedNumberInput'), panel('Bitcoin'))[0], 'onValueChange', 500);r.fire(r.all(named('FormattedNumberInput'), panel('Bitcoin'))[1], 'onValueChange', 3.7);r.fire(r.all(named('FormattedNumberInput'), panel('Bitcoin'))[2], 'onValueChange', 5);
 assert.equal(r.all(named('FormattedNumberInput'), panel('Bitcoin'))[1].props.value, 3);
 // No units or no price: nothing to draw.
 open({ history: { ...history, records: records.map(item => item.id === 'BTC' ? { ...item, cost: 0 } : item) } });
 assert.equal(r.all(node => node.props?.className === 'ladder-track').length, 0);
});

test('price alerts are added, shown against the live price and deleted; the sample workspace keeps them on screen', async () => {
 const alert = { id: 'a1', record_id: 'BTC', direction: 'above', price: 45000, reached_on: null };
 open({ preferences: preferences([alert, { ...alert, id: 'a2', direction: 'below', price: 1 }, { ...alert, id: 'a3', record_id: 'gone' }]) });
 const section = () => panel('Price alerts');
 assert.match(text(section()), /Rises to \$45,000 · now \$50,000/);assert.match(text(section()), /Reached/);assert.match(text(section()), /Falls to \$1/);assert.match(text(section()), /Waiting/);
 await r.fireAsync(r.all(byType('DeleteButton'), section())[0], 'onClick');
 assert.deepEqual(saved.at(-1).data.items.map(item => item.id), ['a2', 'a3']);
 const form = () => r.find(node => node.type === 'form', section());
 const selects = () => r.all(named('NativeSelect'), form());
 r.fire(selects()[0], 'onChange', { target: { value: 'KO' } });r.fire(selects()[1], 'onChange', { target: { value: 'below' } });
 r.fire(r.find(named('FormattedNumberInput'), form()), 'onValueChange', 55);
 const submitted = { preventDefault() { this.prevented = true; } };
 await r.fireAsync(form(), 'onSubmit', submitted);
 assert.ok(submitted.prevented);
 assert.deepEqual([saved.at(-1).data.items.at(-1).record_id, saved.at(-1).data.items.at(-1).direction, saved.at(-1).data.items.at(-1).price], ['KO', 'below', 55]);
 // A price of zero adds nothing; a refused save says so.
 const count = saved.length;
 await r.fireAsync(form(), 'onSubmit', { preventDefault() {} });assert.equal(saved.length, count);
 open({ preferences: preferences([alert], 'Load saved preferences before making changes.') });
 await r.fireAsync(r.find(byType('DeleteButton'), section()), 'onClick');
 open({ preferences: preferences([alert], true) });
 await r.fireAsync(r.find(byType('DeleteButton'), section()), 'onClick');
 assert.deepEqual(errors, ['Load saved preferences before making changes.', 'Could not save changes.']);
 open({ demo: true });
 assert.equal(r.find(byType('EmptyState'), section()).props.description, 'No alerts yet.');
 r.fire(r.find(named('FormattedNumberInput'), form()), 'onValueChange', 70000);
 await r.fireAsync(form(), 'onSubmit', { preventDefault() {} });
 assert.match(text(section()), /Rises to \$70,000/);
 open({ history: { ...history, records: records.filter(item => !['BTC', 'KO'].includes(item.id)) } });
 assert.equal(r.all(node => node.type === 'section' && text(node).includes('Price alerts')).length, 0);
});

test('the charts draw each month and the fall from the peak, and load on demand', async () => {
 r.mount(React.createElement(charts.PerformanceCharts, { months: [{ month: '2026-10', pnl: -5 }, { month: '2026-11', pnl: 7 }], days: [{ date: '2026-11-01', value: 1, pnl: 0, index: 1, drawdown: -.1 }], currency: 'USD' }));
 assert.deepEqual(r.all(byType('Cell')).map(cell => cell.props.fill), ['red', 'green']);
 assert.equal(r.find(byType('AreaChart')).props.data[0].drawdown, -10);
 const [bars, area] = r.all(byType('Tooltip'));
 assert.deepEqual(bars.props.formatter(-5), ['−$5', 'Profit & loss']);assert.equal(bars.props.labelFormatter('2026-10'), 'L2026-10');
 assert.deepEqual(area.props.formatter(-10), ['−10%', 'Drawdown']);assert.equal(area.props.labelFormatter(Date.parse('2026-11-01T00:00:00Z')), '1 November 2026');
 assert.equal(r.all(byType('XAxis'))[1].props.tickFormatter(Date.parse('2026-11-01T00:00:00Z')), '1 November 2026');
 r.mount(React.createElement(lazy.PerformanceCharts, {}));
 assert.equal(r.find(byType('ChartSkeleton')).props.height, 220);
 assert.equal(typeof (await lazy.PerformanceCharts.load()), 'function');
});

test('dated rates are read once for the period and convert through the dollar; a failed read leaves today\'s rates', async () => {
 const hooks = r.load('hooks/use-rate-history.ts', base);
 const convert = hooks.datedRate([{ date: '2026-01-01', rates: { UZS: 10000, EUR: .8 } }]);
 assert.equal(convert('USD', 'UZS', '2026-02-01'), 10000);assert.equal(convert('UZS', 'EUR', '2026-02-01'), .8 / 10000);
 assert.equal(convert('UZS', 'TRY', '2026-02-01'), null);assert.equal(convert('UZS', 'USD', '2025-01-01'), null);
 let result;
 const Probe = ({ start, demo }) => { result = hooks.useRateHistory(start, today, demo);return null; };
 r.mount(React.createElement(Probe, { start: '2010-01-01', demo: false }));await r.flush();
 assert.equal(result('USD', 'UZS', today), 10000);assert.match(reads.at(-1), /start=2016-01-01&end=.*&benchmarks=depositUSD/);
 r.mount(React.createElement(Probe, { start: ago(30), demo: true }));await r.flush();
 assert.equal(reads.at(-1), '/api/benchmarks?demo=1');
 const before = reads.length;
 r.mount(React.createElement(Probe, { start: null, demo: false }));await r.flush();
 assert.equal(result, undefined);assert.equal(reads.length, before);
 fetched = { ok: false, fx: [] };r.mount(React.createElement(Probe, { start: ago(31), demo: false }));await r.flush();assert.equal(result, undefined);
 fetched = { fail: true };r.mount(React.createElement(Probe, { start: ago(32), demo: false }));await r.flush();assert.equal(result, undefined);
 r.unmount();
});

test('expected payouts come from the shared history read, or the sample workspace\'s own', () => {
 let shared = null, built = 0;
 const hook = r.load('hooks/use-expected-payouts.ts', { ...base, '@/hooks/use-portfolio-history': { usePortfolioHistory: () => ({ history: shared }) }, '@/lib/demo-finance': { demoHistory: rows => { built++;return { records: rows, events }; } } });
 let result;
 const Probe = ({ demo }) => { result = hook.useExpectedPayouts('me', demo, 0, records);return null; };
 r.mount(React.createElement(Probe, { demo: false }));assert.deepEqual(result, []);
 shared = history;r.mount(React.createElement(Probe, { demo: false }));
 assert.ok(result.length >= 3 && result.every(item => item.recordId === 'KO' && item.date > today));
 r.mount(React.createElement(Probe, { demo: true }));assert.equal(built, 1);assert.ok(result.length);
});

test('the running total and the holdings reach the two charts kept from the first Profit & loss view', () => {
 open();
 const trend = r.find(byType('PnlTrendChart')).props.points, bars = r.find(byType('PnlHoldingBars')).props.rows;
 assert.equal(trend.at(-1).date, today);assert.ok(Math.abs(trend.at(-1).total - 18134) < 1);
 assert.deepEqual(bars.map(row => row.id).sort(), ['BTC', 'KO', 'home', 'ring']);
 const h = React.createElement;
 const pass = name => Object.assign(({ children }) => h('div', { 'data-part': name }, children), { displayName: name });
 const Cell = Object.assign(({ fill }) => h('span', { 'data-fill': fill }), { displayName: 'Cell' });
 const recharts = { ...Object.fromEntries(['ResponsiveContainer', 'AreaChart', 'BarChart', 'CartesianGrid', 'XAxis', 'YAxis', 'Tooltip', 'ReferenceLine', 'Area', 'Bar'].map(name => [name, pass(name)])), Cell };
 const { PnlTrendChart, PnlHoldingBars, pnlBarLimit } = r.load('components/investment-pnl/pnl-charts.tsx', { ...ui.modules, recharts });
 r.mount(h(PnlTrendChart, { points: [{ date: '2026-01-10', total: 0 }, { date: '2026-11-13', total: -50 }], currency: 'USD' }));
 assert.equal(r.find(byType(recharts.Area)).props.stroke, 'var(--negative)');
 const axis = r.find(byType(recharts.XAxis)), tip = r.find(byType(recharts.Tooltip));
 assert.equal(axis.props.tickFormatter(Date.parse('2026-03-05T00:00:00Z')), 'Mar');
 assert.equal(tip.props.labelFormatter(Date.parse('2026-03-05T00:00:00Z')), '5 March 2026');
 assert.deepEqual(tip.props.formatter(-50), ['−$50', 'Gain/loss']);
 const rows = Array.from({ length: 10 }, (_, index) => ({ id: 'r' + index, name: 'r' + index, kind: 'Stock', total: (index - 3) * 100 }));
 r.mount(h(PnlHoldingBars, { rows, currency: 'USD' }));
 const cells = r.all(byType(Cell));
 assert.equal(cells.length, pnlBarLimit);
 assert.deepEqual([cells[0].props.fill, cells.at(-1).props.fill], ['var(--positive)', 'var(--negative)']);
 assert.deepEqual(r.find(byType(recharts.Tooltip)).props.formatter(600), ['+$600', 'Gain/loss']);
});
