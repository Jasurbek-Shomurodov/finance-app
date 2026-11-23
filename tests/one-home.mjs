import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadTS } from './helpers/load-ts.mjs';

// One home per feature (docs/product-map.md): a feature is built on one screen, and every other screen links to it.
const read = file => fs.readFileSync(file, 'utf8');
const links = loadTS('lib/add-links.ts');
const walk = folder => fs.readdirSync(folder).flatMap(name => { const file = path.join(folder, name); return fs.statSync(file).isDirectory() ? walk(file) : /\.tsx?$/.test(name) ? [file] : []; });
const screens = 'components/workspace/screens/';
const importing = (pattern, files = walk('components')) => files.filter(file => pattern.test(read(file))).map(file => file.split(path.sep).join('/')).sort();

test('every link to a feature\'s home is one constant, and the home answers it', () => {
 assert.deepEqual({ ...links, transferRequested: undefined }, {
  transferLink: '/accounts#transfer', transferRequested: undefined,
  flowHash: '#flow', flowLink: '/income-expenses#flow',
  rulesHash: '#rules', rulesLink: '/transactions#rules',
  watchlistsLink: '/budget#watchlists', benchmarksLink: '/settings#benchmarks',
  allPeriodsLink: '/reports?tab=cash_flow&view=trends', reportFlowLink: '/reports?tab=cash_flow&view=sankey', taxPrepLink: '/reports?tab=tax',
 });
 assert.match(read(screens + 'cash-flow-screen.tsx'), /useHashRequest\(flowHash, \(\) => \{ setTab\('Overview'\); setFlowView\('sankey'\); \}\)/);
 assert.match(read(screens + 'transactions-screen.tsx'), /useHashRequest\(rulesHash, \(\) => setRulesOpen\(true\)\)/);
 assert.match(read(screens + 'budget-screen.tsx'), /id="watchlists"/, 'the anchor the watchlists link lands on');
 const { sectionOf } = loadTS('components/settings-layout.tsx', { '@/components/language-provider': {}, '@/components/presentation-foundation/page-header': {}, 'lucide-react': new Proxy({}, { get: () => () => null }) });
 assert.equal(sectionOf('benchmarks'), 'benchmarks', '/settings#benchmarks opens the benchmarks section');
 assert.equal(sectionOf('nowhere'), 'preferences');
});

test('the money flow diagram is drawn on Cash flow and Reports; Budget and Recurring link to it', () => {
 // The surplus dialog draws how one estimate is made up, not the month's money flow.
 assert.deepEqual(importing(/@\/components\/cash-flow-sankey'/), ['components/cash-flow-drill-lazy.tsx', 'components/cash-flow-report.tsx', 'components/flow-dialog.tsx'].sort());
 assert.deepEqual(importing(/\bFlowDialog\b/).filter(file => !/flow-dialog|cash-flow-drill-lazy/.test(file)), ['components/surplus-breakdown.tsx']);
 assert.match(read(screens + 'budget-screen.tsx'), /href=\{view === 'year' \? reportFlowLink : flowLink\}/);
 assert.match(read('components/planning/upcoming-page.tsx'), /<DrawerLink href=\{flowLink\}/);
 for (const file of ['budget-screen.tsx', 'upcoming-screen.tsx']) assert.doesNotMatch(read(screens + file), /Sankey/, file + ' draws no diagram of its own');
});

test('Cash flow keeps the recent months and sends every other period to Reports', () => {
 const report = read('components/cash-flow-report.tsx');
 assert.match(report, /const recentMonths = 6;/);
 assert.match(report, /<DrawerLink href=\{allPeriodsLink\}>\{t\('See all periods'\)\}<\/DrawerLink>/);
 assert.match(report, /<ReferenceLine y=\{totals\.average\} \{\.\.\.referenceLine\}\/>\}\s*<Line dataKey="net"/, 'each month\'s net as a line over the average');
 assert.doesNotMatch(report, /'quarter'|'year'/, 'quarters and years are Reports\' periods');
});

test('rules are edited on Transactions, review suggestions on Recurring, payouts and alerts on their own Investments tab', () => {
 assert.deepEqual(importing(/RulesDialog|rules-list/).filter(file => !file.startsWith('components/transactions/')), [screens + 'transactions-screen.tsx']);
 assert.match(read(screens + 'settings-screen.tsx'), /<DrawerLink href=\{rulesLink\}>/);
 assert.deepEqual(importing(/\bTransactionInsights\b/, walk(screens)), [screens + 'upcoming-screen.tsx']);
 const assets = read(screens + 'assets-screen.tsx');
 assert.match(assets, /\{ value: 'payouts', label: t\('Payouts & alerts'\) \}/);
 assert.match(assets, /view === 'payouts' &&[^\n]*<PayoutsAlertsView /);
 assert.doesNotMatch(read('components/performance/performance-view.tsx'), /PayoutCalendar|PriceAlerts/, 'Profit & loss no longer carries them');
 const payouts = read('components/performance/payouts-alerts-view.tsx');
 assert.match(payouts, /PayoutCalendar/);
 assert.match(payouts, /PriceAlerts/);
});

test('a business starts from Add asset, and tax prep is always listed', () => {
 assert.match(read(screens + 'assets-screen.tsx'), /onBusinessSetup=\{readOnly \? undefined : \(\) => setSettingUpBusinesses\(true\)\}/);
 assert.match(read('components/planning/add-asset-dialog.tsx'), /onOpenChange\(false\); onBusinessSetup\(\);[^\n]*t\(tracksBusinesses \? 'Add business' : 'Set up business tracking'\)/);
 const { reportTabs } = loadTS('lib/report-view.ts');
 assert.ok(reportTabs.includes('tax'));
 assert.match(read(screens + 'reports-screen.tsx'), /shownTab === 'tax' \? \(businessList\.length \? <TaxTab [^\n]*\n\s*: <section className="panel"><EmptyState icon=\{<Briefcase\/>\} title=\{t\('No businesses yet\.'\)\}/);
});

test('benchmarks are chosen in Settings, and the net worth chart they are drawn on links there', () => {
 const chart = read('components/investment-comparison.tsx');
 assert.match(chart, /<details className="overview-details">[\s\S]*<DrawerLink href=\{benchmarksLink\}>\{t\('Investment benchmarks'\)\}<\/DrawerLink>[\s\S]*<\/details>/);
 assert.deepEqual(importing(/InvestmentComparisonSettings\b/, walk(screens)), [screens + 'settings-screen.tsx']);
});

test('spending watchlists live on Budget; Cash flow only links to them', () => {
 assert.deepEqual(importing(/<SpendingWatchlists\b/, walk(screens)), [screens + 'budget-screen.tsx']);
 assert.match(read(screens + 'cash-flow-screen.tsx'), /<DrawerLink href=\{watchlistsLink\}>\{t\('Open in Budget'\)\}<\/DrawerLink>/);
});

test('helpers used by one file are not exported from it', () => {
 for (const [file, name] of [['components/business-reports.tsx', 'largestFirst'], ['components/asset-allocation-list.tsx', 'allocationFoldPercent'], ['components/settings/country-combobox.tsx', 'matchingCountries'], ['components/deleted-items/deleted-row.tsx', 'deletedMeta'], ['components/planning/recurring-calendar.tsx', 'toneLabels']]) {
  const source = read(file);
  assert.match(source, new RegExp(`(const|function) ${name}\\b`), `${name} is still in ${file}`);
  assert.doesNotMatch(source, new RegExp(`export (const|function) ${name}\\b`));
 }
});
