import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { createRenderer } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';

const { sectionReads } = loadTS('lib/section-reads.ts');
const { budgetReadRange } = loadTS('lib/budget.ts');
const { periodDays } = loadTS('lib/transaction-list.ts');
const { readRange } = loadTS('lib/cash-flow-link.ts');
const { periodOf, readableRange, trendWindow } = loadTS('lib/business-report.ts');
const today = '2026-11-02', month = '2026-11';
const urls = section => sectionReads(section, today).map(read => read.url);
const source = file => fs.readFileSync(file, 'utf8');

test('each screen warms what it reads when it opens as it opens by default (PERF-013)', () => {
 const budget = budgetReadRange(month, 'month', []);
 assert.deepEqual(urls('Budget'), [`/api/planning?scope=budget&month=${budget.to}&from=${budget.from}`]);
 const days = periodDays('three_months', today);
 assert.deepEqual(urls('Transactions'), [`/api/planning?scope=budget&month=${days.to.slice(0, 7)}&from=${days.from.slice(0, 7)}`]);
 const flow = readRange(month, today);
 assert.deepEqual(urls('Income & expenses'), [`/api/planning?scope=budget&month=${flow.readTo}&from=${flow.first}`, '/api/goal-tools']);
 const report = readableRange(trendWindow(periodOf('month', today, today), 'month'));
 assert.deepEqual(urls('Reports'), [`/api/planning?scope=budget&month=${report.to.slice(0, 7)}&from=${report.from.slice(0, 7)}`]);
 assert.deepEqual(urls('Upcoming payments'), [], 'Recurring opens on the list, which reads nothing of its own');
 assert.deepEqual(sectionReads('Recently deleted', today), [{ url: '/api/deleted-items?page=1', session: true, revision: 0 }]);
 assert.deepEqual(urls('Overview'), ['/api/planning?scope=review&month=2026-11', '/api/portfolio-history', '/api/comparison-profile']);
 assert.deepEqual(sectionReads('Assistant', today), [], 'a screen with no read of its own warms nothing');
});

test('the screens still ask for those addresses, starting from those defaults', () => {
 const budget = source('components/workspace/screens/budget-screen.tsx');
 assert.match(budget, /useState\(thisMonth\)/); assert.match(budget, /useState<'month' \| 'year'>\('month'\)/);
 assert.match(budget, /`\/api\/planning\?scope=budget&month=\$\{range\.to\}&from=\$\{range\.from\}`, user, live && !budget\.loading, reload,/);
 const transactions = source('components/workspace/screens/transactions-screen.tsx');
 assert.match(transactions, /useState<TransactionPeriod \| 'custom'>\('three_months'\)/);
 assert.match(transactions, /`\/api\/planning\?scope=budget&month=\$\{range\.to\.slice\(0, 7\)\}&from=\$\{range\.from\.slice\(0, 7\)\}`, user, live, reload,/);
 assert.match(source('components/cash-flow-data.ts'), /`\/api\/planning\?scope=budget&month=\$\{readTo\}&from=\$\{first\}`, owner, live, revision,/);
 const reports = source('components/workspace/screens/reports-screen.tsx');
 assert.match(reports, /useState<Interval>\('month'\)/); assert.match(reports, /useState\(today\)/);
 assert.match(source('hooks/use-report-data.ts'), /`\/api\/planning\?scope=budget&month=\$\{read\.to\.slice\(0, 7\)\}&from=\$\{read\.from\.slice\(0, 7\)\}`, user, live && enabled, reload,/);
 assert.match(source('components/workspace/screens/upcoming-screen.tsx'), /useState<RecurringView>\('list'\)/);
 assert.match(source('components/workspace/screens/upcoming-screen.tsx'), /view === 'subscriptions'\)/, 'the Subscriptions read waits for its view');
 assert.match(source('components/recently-deleted.tsx'), /useSessionResource\('\/api\/deleted-items\?page='\+page,!demo,reload,/);
});

test('the warm-up reads under the owner and revision each card asks with, once per section and revision', () => {
 const r = createRenderer(), warmed = [];
 const { useSectionWarmup } = r.load('components/workspace/state/use-section-warmup.ts', { '@/hooks/use-owner-resource': { warmRead: (...args) => warmed.push(args) }, '@/lib/deposit-interest': { depositToday: () => today } });
 let props = { owner: 'me', demo: false, section: 'Budget', revision: 4 };
 const Probe = () => { useSectionWarmup(props.owner, props.demo, props.section, props.revision); return null; };
 r.mount(React.createElement(Probe));
 assert.deepEqual(warmed, [['me', urls('Budget')[0], 4]]);
 r.update();
 assert.equal(warmed.length, 1);
 props = { ...props, section: 'Recently deleted' }; r.update();
 assert.deepEqual(warmed.at(-1), ['session', '/api/deleted-items?page=1', 0], 'that screen counts its own revision from 0');
 warmed.length = 0;
 props = { ...props, demo: true, section: 'Reports', revision: 5 }; r.update();
 props = { ...props, demo: false, owner: null, section: 'Transactions', revision: 6 }; r.update();
 assert.deepEqual(warmed, [], 'the sample workspace and a signed-out visitor read nothing');
});
