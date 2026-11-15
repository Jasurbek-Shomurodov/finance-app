import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Rule (docs/agents/interface.md, Shimmer follows the screen): a screen's loading shimmer shows the loaded page's blocks
// in the same order and classes, so nothing jumps when records arrive. Change a screen, change its shimmer with it.
const read = path => fs.readFileSync(path, 'utf8');
const skeletons = read('components/presentation-foundation/screen-skeletons.tsx');
const placeholders = read('components/presentation-foundation/loading-placeholder.tsx');
const screen = read('components/workspace/screens/cash-flow-screen.tsx');
const preview = read('components/cashflow-preview.tsx');
const report = read('components/cash-flow-report.tsx');

const body = (source, name) => {
 const start = source.indexOf(`export function ${name}`);
 assert.ok(start >= 0, `${name} is defined`);
 const end = source.indexOf('\nexport ', start + 1);
 return source.slice(start, end < 0 ? undefined : end);
};
const inOrder = (source, marks, what) => {
 const at = marks.map(mark => source.indexOf(mark));
 at.forEach((position, index) => assert.ok(position >= 0, `${what}: ${marks[index]} is drawn`));
 at.forEach((position, index) => index && assert.ok(position > at[index - 1], `${what}: ${marks[index]} comes after ${marks[index - 1]}`));
};

test('Cash flow shimmer draws the Overview blocks in the page order', () => {
 inOrder(screen, ['<CashFlowMonthBar', '<MonthlyReview', '<CashFlowReport', '<CashflowPreview', '<RecordsTable'], 'the screen');
 inOrder(body(skeletons, 'CashFlowSkeleton'), ['cashflow-month-bar', 'cashflow-summary', '<CashFlowReportSkeleton', '<CashflowPreviewSkeleton', 'panel records'], 'the shimmer');
 assert.match(skeletons, /'\/income-expenses': label => <CashFlowSkeleton label=\{label\} monthBar\/>/, 'the drawer shimmer includes the month bar the screen draws first');
 assert.match(screen, /<CashFlowSkeleton label=\{t\("Loading your workspace…"\)\}\/>/, 'inside the screen the real month bar is already there');
});

test('the report shimmer is the Period switch, then the bars beside Where the month went', () => {
 inOrder(report.slice(report.indexOf('export function CashFlowReport')), ['cash-flow-report-tools', 'cash-flow-report-grid', '<TrendPanel', '<WherePanel'], 'the report');
 assert.match(report, /remote\.initialLoading\) return <CashFlowReportSkeleton/);
 inOrder(body(placeholders, 'CashFlowReportSkeleton'), ['cash-flow-report-tools', 'cash-flow-report-grid', 'cash-flow-trend', 'cash-flow-where'], 'the report shimmer');
});

test('the preview shimmer is the income table beside Still to come, Budget and mortgages, then the watchlists', () => {
 inOrder(preview, ['cashflow-income-preview', 'cashflow-spending-preview">{closing}{budget}{mortgages}', '{watchlists}'], 'the preview');
 inOrder(body(placeholders, 'CashflowPreviewSkeleton'), ['cashflow-income-preview', 'cashflow-spending-preview', 'cashflow-still-to-come', 'dashboard-budget', 'monthly-mortgage-payments', 'tools-panel'], 'the preview shimmer');
});

test('Still to come opens Recurring at its real route', () => {
 const routes = read('components/workspace/navigation.ts');
 assert.match(routes, /label: 'Recurring'.*path: '\/upcoming'/);
 assert.match(read('components/cash-flow/still-to-come.tsx'), /<DrawerLink href="\/upcoming">/);
});
