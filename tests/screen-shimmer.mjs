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
 inOrder(screen, ['<CashFlowMonthBar', '<MonthlyReview', '<CashFlowReport', '<CashflowPreview'], 'the screen');
 inOrder(body(skeletons, 'CashFlowSkeleton'), ['cashflow-month-bar', 'cashflow-summary', '<CashFlowReportSkeleton', '<CashflowPreviewSkeleton'], 'the shimmer');
 assert.match(skeletons, /'\/income-expenses': label => <CashFlowSkeleton label=\{label\} monthBar\/>/, 'the drawer shimmer includes the month bar the screen draws first');
 assert.match(screen, /<CashFlowSkeleton label=\{t\("Loading your workspace…"\)\}\/>/, 'inside the screen the real month bar is already there');
});

test('the report shimmer is the bars beside Where the month went, with no Period switch', () => {
 // Cash flow shows one month; every other period is on Reports (docs/product-map.md), so neither the report nor its
 // shimmer draws a Period switch above the grid.
 inOrder(report.slice(report.indexOf('export function CashFlowReport')), ['cash-flow-report-grid', '<TrendPanel', '<WherePanel'], 'the report');
 assert.match(report, /remote\.initialLoading\) return <CashFlowReportSkeleton/);
 inOrder(body(placeholders, 'CashFlowReportSkeleton'), ['cash-flow-report', 'cash-flow-report-grid', 'cash-flow-trend', 'cash-flow-where'], 'the report shimmer');
 assert.doesNotMatch(report, /cash-flow-report-tools/, 'the report has no Period switch');
 assert.doesNotMatch(body(placeholders, 'CashFlowReportSkeleton'), /cash-flow-report-tools/, 'so its shimmer draws none');
});

test('the preview shimmer is the income table beside Still to come; budget, mortgages and watchlists belong to Spending', () => {
 inOrder(preview, ['cashflow-income-preview', 'cashflow-spending-preview">{closing}</div>'], 'the preview');
 assert.doesNotMatch(preview, /\{budget\}|\{mortgages\}|\{watchlists\}/, 'Overview does not repeat the Spending tab');
 inOrder(body(placeholders, 'CashflowPreviewSkeleton'), ['cashflow-income-preview', 'cashflow-spending-preview', 'cashflow-still-to-come'], 'the preview shimmer');
 assert.doesNotMatch(body(placeholders, 'CashflowPreviewSkeleton'), /dashboard-budget|monthly-mortgage-payments|tools-panel/);
});

test('Still to come opens Recurring at its real route', () => {
 const routes = read('components/workspace/navigation.ts');
 assert.match(routes, /label: 'Recurring'.*path: '\/upcoming'/);
 assert.match(read('components/cash-flow/still-to-come.tsx'), /<DrawerLink href="\/upcoming">/);
});

test('Cash flow tabs other than Overview shimmer in their own layout, not a generic panel', () => {
 assert.match(screen, /<CashFlowTabSkeleton label=\{t\("Loading your workspace…"\)\} tab=\{tab\}\/>/);
 const tabs = body(skeletons, 'CashFlowTabSkeleton');
 inOrder(tabs, ['cashflow-summary', "tab === 'Spending'", '{summary}', 'monthly-mortgage-payments', 'dashboard-budget', 'tools-panel'], 'the Spending tab, as the screen draws mortgages, budget and watchlists');
 inOrder(screen, ["tab==='Spending'&&mortgages", "tab==='Spending'&&budgetCard", "tab==='Spending'&&watchlists"], 'the Spending tab');
});

test('the drawer shimmer draws the dashboard in the saved card order', async () => {
 const { savedDashboardColumns, defaultDashboardLayout } = await import('../lib/dashboard-layout.ts');
 assert.deepEqual(savedDashboardColumns([]), { left: [...defaultDashboardLayout.columns.left], right: [...defaultDashboardLayout.columns.right] });
 const saved = { columns: { left: [...defaultDashboardLayout.columns.right], right: [...defaultDashboardLayout.columns.left] }, hidden: [defaultDashboardLayout.columns.left[0]] };
 const columns = savedDashboardColumns([{ key: 'other', data: {} }, { key: 'dashboard', data: saved }]);
 assert.deepEqual(columns.left, saved.columns.left);
 assert.deepEqual(columns.right, saved.columns.right.filter(card => !saved.hidden.includes(card)), 'hidden cards are not drawn');
});

test('every drawer destination has its own shimmer, and each in-screen skeleton is the same component', () => {
 const routes = [...read('components/workspace/navigation.ts').matchAll(/path: '([^']+)'/g)].map(match => match[1]);
 for (const route of routes) assert.match(skeletons, new RegExp(`'${route}': \\(?label`), route);
 for (const [file, name] of [['transactions', 'TransactionsSkeleton'], ['reports', 'ReportsSkeleton'], ['budget', 'BudgetSkeleton'], ['upcoming', 'RecurringSkeleton'], ['goals', 'GoalsSkeleton'], ['assets', 'InvestmentsSkeleton'], ['loans-debts', 'LoansSkeleton'], ['cash-flow', 'CashFlowSkeleton']])
  assert.match(read(`components/workspace/screens/${file}-screen.tsx`), new RegExp(`<${name} `), `${file} loads in the drawer's shape`);
});
