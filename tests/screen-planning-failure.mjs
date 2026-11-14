import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, stubs } from './helpers/component-tree.mjs';

const h = React.createElement;
const ui = stubs();
const part = name => () => h('div', { 'data-part': name });
const Segmented = ({ onChange, options }) => h('nav', null, options.map(option => h('button', { key: option.value, 'data-tab': option.value, onClick: () => onChange(option.value) }, option.label)));
function screen(file, name, tab, planning) {
 const r = createRenderer(), retries = { count: 0 };
 const workspace = { user: 'me', demo: false, rows: [], summary: [], current: [], currency: 'USD', market: null, preferencesData: { currencies: ['USD'] }, excludedCurrencies: [], workspacePreferences: {}, reload: 0, workspaceLoading: false, tableLoading: false, error: '', refreshRecords: () => retries.count++, planning };
 const { [name]: Screen } = r.load(file, {
  ...ui.modules,
  '@/components/workspace/workspace-provider': { useWorkspace: () => workspace },
  '@/components/presentation-foundation/segmented': { Segmented },
  '@/components/presentation-foundation/page-header': { PageHeader: ({ children, tabs }) => h('header', null, tabs, children) },
  '@/components/presentation-foundation/inline-error': { InlineError: ({ message, onRetry }) => h('p', { role: 'alert', 'data-retry': !!onRetry }, message) },
  '@/components/presentation-foundation/loading-placeholder': { PanelSkeleton: part('skeleton') },
  '@/components/presentation-foundation/screen-skeletons': { InvestmentsSkeleton: part('skeleton'), LoansSkeleton: part('skeleton') },
  '@/components/asset-dashboard': { AssetDashboard: part('dashboard') },
  '@/components/planning/add-asset-dialog': { AddAssetDialog: () => null },
  '@/components/portfolio-allocation-plan': { PortfolioAllocationPlan: part('plan') },
  '@/components/planning/debt-payoff-panel': { DebtPayoffPanel: part('plan') },
  '@/components/loans/loans-overview': { LoansOverview: part('overview') },
  '@/hooks/use-property-totals': { usePropertyTotals: () => null },
 });
 r.mount(h(Screen));
 r.find(element => element.props?.['data-tab'] === tab).props.onClick();
 r.update();
 return { html: r.html(), retries };
}
const failed = { loading: false, error: 'Could not load planning data.', data: { records: [] } };
const loaded = { loading: false, error: '', data: { records: [] } };
for (const [file, name, tab] of [['components/workspace/screens/assets-screen.tsx', 'AssetsScreen', 'allocation'], ['components/workspace/screens/loans-debts-screen.tsx', 'LoansDebtsScreen', 'payoff']]) {
 test(`${name}: a failed planning read says so on the ${tab} tab, with a retry, and never renders an empty page`, () => {
  const { html } = screen(file, name, tab, failed);
  assert.match(html, /role="alert" data-retry="true">Could not load planning data\./);
  assert.doesNotMatch(html, /data-part="plan"/);
  assert.match(screen(file, name, tab, loaded).html, /data-part="plan"/);
  assert.doesNotMatch(screen(file, name, tab, loaded).html, /role="alert"/);
 });
}
