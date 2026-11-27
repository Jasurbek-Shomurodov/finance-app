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
 const shell = ['/api/database-status'];
 const budget = budgetReadRange(month, 'month', []), budgetUrl = `/api/planning?scope=budget&month=${budget.to}&from=${budget.from}`;
 assert.deepEqual(urls('Budget'), [budgetUrl, '/api/planning?scope=insights', ...shell], 'Age of Money reads its history beside the month');
 const days = periodDays('three_months', today);
 assert.deepEqual(urls('Transactions'), [`/api/planning?scope=budget&month=${days.to.slice(0, 7)}&from=${days.from.slice(0, 7)}`, ...shell]);
 const flow = readRange(month, today);
 assert.deepEqual(urls('Income & expenses'), [`/api/planning?scope=budget&month=${flow.readTo}&from=${flow.first}`, '/api/goal-tools', '/api/portfolio-history', ...shell], 'the forecast\'s payouts come from the history');
 const report = readableRange(trendWindow(periodOf('month', today, today), 'month'));
 assert.deepEqual(urls('Reports'), [`/api/planning?scope=budget&month=${report.to.slice(0, 7)}&from=${report.from.slice(0, 7)}`, ...shell]);
 assert.deepEqual(urls('Upcoming payments'), shell, 'Recurring opens on the list, which reads nothing of its own');
 assert.deepEqual(sectionReads('Recently deleted', today), [{ url: '/api/deleted-items?page=1', session: true, revision: 0 }, { url: '/api/planning?scope=review&month=2026-11' }, { url: '/api/database-status', revision: 0 }]);
 assert.deepEqual(urls('Overview'), ['/api/planning?scope=review&month=2026-11', '/api/portfolio-history', '/api/comparison-profile', budgetUrl, '/api/telegram', ...shell], 'the Budget card no longer waits for the saved budget before asking');
 assert.deepEqual(urls('Assets & investments'), ['/api/portfolio-history', ...shell], 'Investments starts its history beside the workspace reads');
 assert.deepEqual(urls('Accounts'), ['/api/planning?scope=account-activity', '/api/portfolio-history', ...shell], 'Accounts no longer waits for the planning read before asking');
 assert.deepEqual(urls('Loans & debts'), ['/api/portfolio-history', ...shell]);
 assert.deepEqual(urls('Savings goals'), ['/api/goal-tools', ...shell]);
 assert.deepEqual(sectionReads('Settings', today), [{ url: '/api/telegram', session: true, revision: 0 }, { url: '/api/account-access', session: true, revision: 0 }, { url: '/api/comparison-profile', session: true, revision: 0 }, { url: '/api/import' }, { url: '/api/database-status', revision: 0 }], 'Settings panels no longer wait for preferences before asking');
 assert.deepEqual(sectionReads('Assistant', today), [{ url: '/api/database-status', revision: 0 }], 'a screen with no read of its own warms only the shell\'s');
});

test('the screens still ask for those addresses, starting from those defaults', () => {
 const budget = source('components/workspace/screens/budget-screen.tsx');
 assert.match(budget, /useState\(thisMonth\)/); assert.match(budget, /useState<'month' \| 'year'>\('month'\)/);
 assert.match(budget, /`\/api\/planning\?scope=budget&month=\$\{range\.to\}&from=\$\{range\.from\}`, user, live && !budget\.loading, reload,/);
 const transactions = source('components/workspace/screens/transactions-screen.tsx');
 assert.match(transactions, /useState<TransactionPeriod \| 'custom'>\('three_months'\)/);
 assert.match(transactions, /`\/api\/planning\?scope=budget&month=\$\{range\.to\.slice\(0, 7\)\}&from=\$\{range\.from\.slice\(0, 7\)\}`, user, live, reload,/);
 assert.match(source('components/cash-flow-data.ts'), /`\/api\/planning\?scope=budget&month=\$\{readTo\}&from=\$\{first\}`, owner, live && !ready, revision,/);
 const reports = source('components/workspace/screens/reports-screen.tsx');
 assert.match(reports, /useState<Interval>\('month'\)/); assert.match(reports, /useState\(today\)/);
 assert.match(source('hooks/use-report-data.ts'), /`\/api\/planning\?scope=budget&month=\$\{read\.to\.slice\(0, 7\)\}&from=\$\{read\.from\.slice\(0, 7\)\}`, user, live && enabled, reload,/);
 assert.match(source('components/workspace/screens/upcoming-screen.tsx'), /useState<RecurringView>\('list'\)/);
 assert.match(source('components/planning/accounts/use-account-story.ts'), /useOwnerResource\('\/api\/planning\?scope=account-activity', owner, live, revision,/);
 assert.match(source('components/loans/loans-overview.tsx'), /usePortfolioHistory\(user, demo, reload\)/);
 assert.match(source('components/planning/goals-page.tsx'), /useOwnerResource\('\/api\/goal-tools',owner,/);
 assert.match(source('components/workspace/screens/upcoming-screen.tsx'), /view === 'subscriptions'\)/, 'the Subscriptions read waits for its view');
 assert.match(source('components/recently-deleted.tsx'), /useSessionResource\('\/api\/deleted-items\?page='\+page\+narrowed,!demo,reload,/);
 // The other warmed reads, each under the owner and revision its card asks with.
 assert.match(source('components/database-status.tsx'), /useOwnerResource\('\/api\/database-status',owner,!demo,0,/);
 assert.match(source('components/workspace/workspace-shell.tsx'), /<DatabaseStatus owner=\{user\} demo=\{demo\}\/>/);
 assert.match(source('hooks/use-telegram-link.ts'), /useOwnerResource\('\/api\/telegram','session',!demo,0,/);
 assert.match(source('components/account-access-panel.tsx'), /useSessionResource\('\/api\/account-access',true,0,/);
 assert.match(source('components/investment-comparison-settings.tsx'), /useSessionResource\('\/api\/comparison-profile',!demo,0,/);
 assert.match(source('components/import-history.tsx'), /useOwnerResource\('\/api\/import',owner,!demo,revision,/);
 assert.match(source('components/workspace/screens/settings-screen.tsx'), /<ImportHistory owner=\{user\} demo=\{demo\} revision=\{reload\}/);
 assert.match(source('hooks/use-subscriptions.ts'), /useOwnerResource\('\/api\/planning\?scope=insights', owner, !!owner && !demo && enabled, revision,/);
 assert.match(budget, /useInsightHistory\(user, demo, reload, planning\.data\.records, view === 'month'\)/);
 assert.match(source('components/deleted-items/use-restore-preview.ts'), /useOwnerResource\('\/api\/planning\?scope=review&month=' \+ month, demo \? null : user, !demo && !!user, reload,/);
 assert.match(source('components/dashboard-cards.tsx'), /const range = budgetReadRange\(month, 'month', /);
 assert.match(source('components/workspace/screens/overview-screen.tsx'), /useMonthBudget\(\{ owner: user, demo, revision: reload,/);
 assert.match(source('components/workspace/screens/cash-flow-screen.tsx'), /useExpectedPayouts\(user, demo, reload, rows\)/);
 // The whole bin (no tab, no search) adds nothing to the address, so it is the one the warm-up read.
 assert.match(source('components/recently-deleted.tsx'), /const narrowed=\(type\?'&type='\+type:''\)\+\(term\?'&q='\+encodeURIComponent\(term\):''\);/);
});

test('the warm-up reads under the owner and revision each card asks with, once per section and revision', () => {
 const r = createRenderer(), warmed = [];
 const { useSectionWarmup } = r.load('components/workspace/state/use-section-warmup.ts', { '@/hooks/use-owner-resource': { warmRead: (...args) => warmed.push(args) }, '@/lib/deposit-interest': { depositToday: () => today } });
 let props = { owner: 'me', demo: false, section: 'Budget', revision: 4 };
 const Probe = () => { useSectionWarmup(props.owner, props.demo, props.section, props.revision); return null; };
 r.mount(React.createElement(Probe));
 assert.deepEqual(warmed, [['me', urls('Budget')[0], 4], ['me', '/api/planning?scope=insights', 4], ['me', '/api/database-status', 0]]);
 r.update();
 assert.equal(warmed.length, 3);
 props = { ...props, section: 'Recently deleted' }; r.update();
 assert.deepEqual(warmed.slice(3), [['session', '/api/deleted-items?page=1', 0], ['me', '/api/planning?scope=review&month=2026-11', 4], ['me', '/api/database-status', 0]], 'the bin counts its own revision from 0, the restore preview the workspace\'s');
 warmed.length = 0;
 props = { ...props, demo: true, section: 'Reports', revision: 5 }; r.update();
 props = { ...props, demo: false, owner: null, section: 'Transactions', revision: 6 }; r.update();
 assert.deepEqual(warmed, [], 'the sample workspace and a signed-out visitor read nothing');
});
