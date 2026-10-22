import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, hostModule, language } from './helpers/component-tree.mjs';

// The user's rule, 22 October 2026: a tapped Transactions row shows that transaction's details (amount as entered,
// date, account, category, notes, Edit and Delete), never a Sankey.
const r = createRenderer();
const viewed = [], drilled = [], sankeys = [];
const market = { id: 'm', name: 'Market', kind: 'Living expense', currency: 'USD', amount: 40, quantity: 1, cost: 0, rate: 0, date: new Date().toISOString().slice(0, 10), frequency: 'Once', notes: 'Weekly shop', account_id: 'card' };
const card = { ...market, id: 'card', name: 'Card', kind: 'Cash', amount: 500, frequency: 'Monthly', account_id: undefined, notes: '' };
const planning = { data: { records: [card, market], categories: [], goals: [], occurrences: [], activity: [] }, loading: false, error: '' };
const workspace = {
 user: null, demo: true, reload: 0, currency: 'USD', market: null, planning, transactionTools: { data: { splits: [] } }, workspaceLoading: false, addCashFlow() {},
 setViewing: record => viewed.push(record.id), setDrilling: record => drilled.push(record.id), setSankey: request => sankeys.push(request), storedRecord: record => record,
 categorize: async () => 0, assignTransactionsBusiness: async () => 0, businessList: [], tags: { data: { tags: [], links: [] }, change: async () => 0, save: async () => {} },
 attachments: { counts: new Map() }, refreshRecords() {}, household: { state: null }, readOnly: false, assignRecordOwner: async () => {}, removedCategories: { kinds: [] }, reviewRecurring() {},
};
const modules = {
 'lucide-react': hostModule(), '@/components/language-provider': language('en-US'),
 '@/components/display-money': { useDisplayMoney: () => ({ enteredSigned: (amount, currency) => `${amount} ${currency}`, entered: (amount, currency) => `${amount} ${currency}` }) },
 ...Object.fromEntries(['category-icon', 'empty-state', 'inline-error', 'screen-skeletons', 'date-range-picker', 'page-header', 'pagination', 'panel-title', 'segmented', 'business-filter', 'owner-filter', 'tag-chip', 'rolling-text'].map(name => ['@/components/presentation-foundation/' + name, hostModule()])),
 '@/components/transactions/bulk-edit': hostModule(), '@/components/transactions/rule-dialog': hostModule(), '@/components/transactions/rules-list': hostModule(), '@/components/transactions/tags': hostModule(),
 '@/components/transactions/pickers': hostModule({ useChoiceName: () => () => 'Groceries' }),
 '@/components/transactions/transaction-row': hostModule({ transactionRowLabel: action => action }),
 '@/components/transaction-insights': hostModule(), '@/components/ui/button': hostModule(), '@/components/ui/dropdown-menu': hostModule(), '@/components/ui/input': hostModule(), '@/components/ui/native-select': hostModule(),
 '@/components/workspace/workspace-provider': { useWorkspace: () => workspace },
 '@/hooks/use-owner-resource': { useOwnerResource: () => ({ data: { records: [], categories: [] }, initialLoading: false, error: '' }) },
 '@/hooks/use-transaction-rules': { useTransactionRules: () => ({ rules: [], save: async () => 0, remove: async () => {} }) },
 '@/hooks/use-location-search': { useLocationSearch: () => '', queryList: () => [] },
 '@/lib/feedback': { showAction() {}, showError() {}, showNotice() {} },
};
const { TransactionsScreen } = r.load('components/workspace/screens/transactions-screen.tsx', modules);
const row = () => r.find(node => node.type === 'li' && node.props.className === 'transaction-row');
const inside = (target = { closest: () => null }) => ({ target, currentTarget: { contains: () => true }, preventDefault() {} });

test('tapping a Transactions row opens that transaction\'s details, not its Sankey', () => {
 r.mount(React.createElement(TransactionsScreen));
 assert.equal(row().props['aria-label'], 'View details for Market');
 r.fire(row(), 'onClick', inside());
 assert.deepEqual(viewed, ['m'], 'a click opens the details dialog');
 r.fire(row(), 'onKeyDown', { ...inside(), key: 'Enter' });
 assert.deepEqual(viewed, ['m', 'm'], 'Enter opens it too');
 r.fire(row(), 'onKeyDown', { ...inside(), key: 'a' });
 r.fire(row(), 'onClick', inside({ closest: () => ({}) }));
 assert.deepEqual(viewed, ['m', 'm'], 'other keys and the row\'s own pickers open nothing');
 assert.deepEqual([drilled, sankeys], [[], []], 'no Sankey opens from a row');
});
