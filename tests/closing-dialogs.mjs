import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { loadTS } from './helpers/load-ts.mjs';
import { byType, createRenderer, event, hostModule, stubs, text } from './helpers/component-tree.mjs';

const { formatMoney } = loadTS('lib/format.ts');
const en = loadTS('lib/i18n.ts').dictionaries.en;
const h = React.createElement;
const r = createRenderer(), ui = stubs();
const today = '2026-11-23';
const ConfirmDialog = Object.assign(props => props.open ? h('aside', { 'data-busy': !!props.busy, 'data-deletes': !!props.deletes }, props.title, props.description, h('b', null, props.confirmLabel)) : null, { displayName: 'ConfirmDialog' });
const modules = {
 ...ui.modules,
 '@/components/presentation-foundation/segmented': hostModule(),
 '@/components/presentation-foundation/confirm-dialog': { ConfirmDialog },
 '@/lib/deposit-interest': { depositToday: () => today },
};
const { CloseRecordDialog, CloseAccountDialog, closeMeaning, deleteMeaning } = r.load('components/closing/close-dialogs.tsx', modules);
const { DeleteHeldDialog, DeleteAccountDialog } = r.load('components/closing/delete-dialogs.tsx', modules);
const record = (id, kind, amount, extra = {}) => ({ id, name: id, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date: '2026-01-01', frequency: 'Once', notes: '', ...extra });
const submit = () => r.fireAsync(r.find(byType('form')), 'onSubmit', event());
const closeButton = () => r.find(byType(ui.Button));
const footer = () => r.find(byType(ui.FormFooter));
const confirm = () => r.find(byType(ConfirmDialog));

test('closing an empty account asks only for the day, never a future one, and says what Close does', async () => {
 const saved = [], closed = [];
 r.mount(h(CloseRecordDialog, { record: record('Old wallet', 'Cash', 0), records: [], onClose: () => closed.push(true), onSave: async (...args) => { saved.push(args); } }));
 assert.match(text(r.tree), /Close Old wallet/);
 assert.equal(text(r.find(byType(ui.DialogDescription))), closeMeaning);
 assert.deepEqual([r.find(byType(ui.DatePicker)).props.value, r.find(byType(ui.DatePicker)).props.max], [today, today], 'today by default, and no later');
 assert.equal(r.all(byType(ui.NativeSelect)).length, 0, 'nothing left to move');
 assert.equal(footer().props.blocked, undefined);
 r.fire(r.find(byType(ui.DatePicker)), 'onChange', '2026-11-01');
 await submit();
 assert.deepEqual([saved, closed], [[['2026-11-01', null]], [true]]);
 // A sold-out holding closes the same way, whatever its last price.
 r.mount(h(CloseRecordDialog, { record: record('AAPL', 'Stock', 230, { quantity: 0 }), records: [], onClose() {}, onSave: async (...args) => { saved.push(args); } }));
 await submit();
 assert.deepEqual(saved.at(-1), [today, null]);
});

test('a cash account that still holds money asks where it goes: an open account in its own currency', async () => {
 const wallet = record('Wallet', 'Cash', 300), records = [wallet, record('Card', 'Cash', 5), record('Safe', 'Deposit', 90), record('Euro', 'Cash', 5, { currency: 'EUR' }), record('AAPL', 'Stock', 10)];
 const saved = [];
 r.mount(h(CloseRecordDialog, { record: wallet, records, onClose() {}, onSave: async (...args) => { saved.push(args); throw Error('This account has activity after that day. Choose a later closing day.'); } }));
 assert.ok(text(r.tree).includes('Balance' + formatMoney(300, 'USD', 'en-US')));
 const select = r.find(byType(ui.NativeSelect));
 assert.deepEqual(r.all(byType('option'), [select]).map(text), ['Card · ' + formatMoney(5, 'USD', 'en-US'), 'Safe · ' + formatMoney(90, 'USD', 'en-US')]);
 assert.equal(select.props.value, 'Card', 'the first one is ready');
 r.fire(select, 'onChange', { target: { value: 'Safe' } });
 await submit();
 assert.deepEqual(saved, [[today, 'Safe']]);
 // A refusal keeps the dialog open and says the database's own words.
 assert.equal(r.find(byType(ui.ErrorPopup)).props.message, 'This account has activity after that day. Choose a later closing day.');
 // With nowhere to send it, and for anything that is not a cash account, Close waits and says why in words.
 for (const [held, others] of [[wallet, [wallet, records[3]]], [record('Flat', 'Property', 90000), records], [record('AAPL', 'Stock', 10, { quantity: 3 }), records]]) {
  r.mount(h(CloseRecordDialog, { record: held, records: others, onClose() {}, onSave: async (...args) => { saved.push(args); } }));
  assert.equal(footer().props.blocked, 'Bring the balance to zero before closing.', held.name);
  assert.equal(closeButton().props.disabled, true);
  await submit();
 }
 assert.equal(saved.length, 1, 'a blocked form saves nothing');
});

test('an investment account closes by moving its holdings, or with them once every one is sold out', async () => {
 const account = { id: 'broker', name: 'Broker', kind: 'Stock', currency: 'USD' }, accounts = [account, { id: 'other', name: 'Other broker', kind: 'Stock', currency: 'USD' }, { id: 'coins', name: 'Wallet', kind: 'Crypto', currency: 'USD' }, { id: 'shut', name: 'Shut', kind: 'Stock', currency: 'USD', closed_on: '2026-01-01' }];
 const held = [record('AAPL', 'Stock', 10, { quantity: 3, holding_account_id: 'broker' }), record('MSFT', 'Stock', 10, { quantity: 0, holding_account_id: 'broker' })];
 const saved = [];
 const mount = records => r.mount(h(CloseAccountDialog, { account, records, accounts, onClose() {}, onSave: async (...args) => { saved.push(args); } }));
 mount(held);
 const choice = () => r.find(byType('Segmented'));
 assert.equal(choice().props.value, 'move', 'holdings with value move by default');
 assert.deepEqual(choice().props.options.map(option => option.label), ['Move to another account', 'Close them too']);
 // Only open accounts of its own kind, or no account at all.
 assert.deepEqual(r.all(byType('option')).map(text), ['Other broker', 'No account']);
 await submit();
 r.fire(r.find(byType(ui.NativeSelect)), 'onChange', { target: { value: '' } });
 await submit();
 assert.deepEqual(saved, [[today, 'other', false], [today, null, false]]);
 // Closing them too waits while one still has value.
 r.fire(choice(), 'onChange', 'close');
 assert.equal(footer().props.blocked, 'Bring the balance to zero before closing.');
 assert.equal(r.all(byType(ui.NativeSelect)).length, 0);
 await submit();
 assert.equal(saved.length, 2);
 // All sold out: closing them with the account is the default. An empty account asks nothing.
 mount([held[1]]);
 assert.equal(choice().props.value, 'close');
 await submit();
 mount([]);
 assert.equal(r.all(byType('Segmented')).length, 0);
 await submit();
 assert.deepEqual(saved.slice(2), [[today, null, true], [today, null, true]]);
});

test('the delete confirmation says what Close and Delete each do, and offers Delete only when nothing points at the record', () => {
 const calls = [];
 const mount = props => r.mount(h(DeleteHeldDialog, { record: record('Wallet', 'Cash', 0), blockers: [], checking: false, busy: false, error: '', onClose: () => calls.push('keep'), onDelete: () => calls.push('delete'), onCloseInstead: () => calls.push('close'), ...props }));
 mount();
 let shown = text(r.tree);
 assert.ok(shown.includes('Move Wallet to Recently deleted?') && shown.includes(closeMeaning) && shown.includes(deleteMeaning));
 assert.ok(en[closeMeaning] && en[deleteMeaning], 'both sentences are translated');
 assert.deepEqual([confirm().props.deletes, confirm().props.confirmLabel, confirm().props.busy], [true, 'Delete record', false]);
 confirm().props.onConfirm();
 // Something still points at it: named in the dialog's own words, with Close offered in place of Delete.
 mount({ blockers: ['transactions', 'goals'] });
 shown = text(r.tree);
 assert.ok(shown.includes('Still linked to it: transactions, goals.') && shown.includes('This record still has linked items. Delete or move them first, or close it instead.'), shown);
 assert.ok(!shown.includes('Move Wallet to Recently deleted?'));
 assert.deepEqual([confirm().props.deletes, confirm().props.confirmLabel], [false, 'Close instead']);
 confirm().props.onConfirm();
 assert.deepEqual(calls, ['delete', 'close']);
 // While the database is asked, neither button answers; with no record there is no dialog.
 mount({ checking: true });
 assert.equal(confirm().props.busy, true);
 mount({ record: null });
 assert.equal(r.all(byType('aside')).length, 0);
});

test('an empty investment account is deleted after one question, and a refusal stays in the dialog', async () => {
 const closed = [];
 const account = { id: 'broker', name: 'Broker', kind: 'Stock', currency: 'USD' };
 r.mount(h(DeleteAccountDialog, { account, onClose: () => closed.push(true), onDelete: async () => {} }));
 assert.ok(text(r.tree).includes('Delete this account?') && text(r.tree).includes('Broker') && text(r.tree).includes('It has no holdings, so nothing else changes.'));
 assert.equal(confirm().props.confirmLabel, 'Delete account');
 await confirm().props.onConfirm();
 assert.deepEqual(closed, [true]);
 r.mount(h(DeleteAccountDialog, { account, onClose: () => closed.push(true), onDelete: async () => { throw Error('This account still has holdings. Move or delete them first, or close the account instead.'); } }));
 await confirm().props.onConfirm();
 await r.flush();
 assert.equal(closed.length, 1);
 assert.equal(confirm().props.error, 'This account still has holdings. Move or delete them first, or close the account instead.');
});

// The host any screen opens these through.
function host(workspace, asked = { data: { blockers: [] }, loading: false, error: '' }) {
 const view = createRenderer(), reads = [];
 const part = name => Object.assign(() => h('div', { 'data-part': name }), { displayName: name });
 const parts = { CloseRecordDialog: part('CloseRecordDialog'), CloseAccountDialog: part('CloseAccountDialog'), DeleteHeldDialog: part('DeleteHeldDialog'), DeleteAccountDialog: part('DeleteAccountDialog') };
 const { ClosingDialogs, deletesHeld } = view.load('components/workspace/closing-dialogs.tsx', {
  '@/components/closing/close-dialogs': parts, '@/components/closing/delete-dialogs': parts,
  '@/components/workspace/workspace-provider': { useWorkspace: () => workspace },
  '@/hooks/use-owner-resource': { useOwnerResource: (url, owner, enabled, revision, empty) => { reads.push({ url, owner, enabled }); return enabled ? asked : { data: empty, loading: false, error: '' }; } },
 });
 view.mount(h(ClosingDialogs));
 return { view, reads, parts, deletesHeld, props: name => view.find(byType(parts[name])).props };
}
const workspaceOf = extra => {
 const calls = [];
 const wallet = record('wallet', 'Cash', 0), lunch = record('lunch', 'Living expense', 5, { account_id: 'wallet' });
 return { calls, wallet, lunch, workspace: { user: 'me', demo: false, reload: 3, busy: false, error: '', deleting: null, closing: null,
  planning: { data: { records: [wallet, lunch], goals: [], activity: [], movements: [], investmentLinks: [], holdingAccounts: [{ id: 'broker' }] } },
  closeDeleting: () => calls.push(['closeDeleting']), remove: async () => { calls.push(['remove']); }, requestClose: item => calls.push(['requestClose', item.id]), endClosing: () => calls.push(['endClosing']),
  closeRecord: async (...args) => { calls.push(['closeRecord', args[0].id, args[1], args[2]]); }, closeAccount: async (...args) => { calls.push(['closeAccount', args[0].id, ...args.slice(1)]); }, deleteAccount: async item => { calls.push(['deleteAccount', item.id]); }, ...extra } };
};

test('deleting an account asks the database what still points at it before Delete is offered', () => {
 const base = workspaceOf();
 // Nothing is being deleted: nothing is asked, and the confirmation stays shut.
 let page = host(base.workspace);
 assert.deepEqual(page.reads.at(-1), { url: '/api/closing?id=', owner: 'me', enabled: false });
 assert.equal(page.props('DeleteHeldDialog').record, null);
 // An account: the database's answer decides, also when the loaded data shows a link it does not name.
 page = host({ ...base.workspace, deleting: base.wallet }, { data: { blockers: ['statements'] }, loading: false, error: '' });
 assert.deepEqual(page.reads.at(-1), { url: '/api/closing?id=wallet', owner: 'me', enabled: true });
 assert.deepEqual([page.props('DeleteHeldDialog').blockers, page.props('DeleteHeldDialog').checking], [['statements'], false]);
 page.props('DeleteHeldDialog').onCloseInstead();
 page.props('DeleteHeldDialog').onDelete();
 assert.deepEqual(base.calls, [['closeDeleting'], ['requestClose', 'wallet'], ['remove']]);
 // While it is asked, and when it cannot be asked, the loaded data answers.
 page = host({ ...base.workspace, deleting: base.wallet }, { data: { blockers: [] }, loading: true, error: '' });
 assert.deepEqual([page.props('DeleteHeldDialog').blockers, page.props('DeleteHeldDialog').checking], [['transactions'], true]);
 page = host({ ...base.workspace, deleting: base.wallet }, { data: { blockers: [] }, loading: false, error: 'offline' });
 assert.deepEqual([page.props('DeleteHeldDialog').blockers, page.props('DeleteHeldDialog').checking], [['transactions'], false]);
 // The sample workspace has no database to ask. A transaction keeps the ordinary confirmation.
 page = host({ ...base.workspace, demo: true, deleting: base.wallet });
 assert.equal(page.reads.at(-1).enabled, false);assert.deepEqual(page.props('DeleteHeldDialog').blockers, ['transactions']);
 page = host({ ...base.workspace, deleting: base.lunch });
 assert.equal(page.props('DeleteHeldDialog').record, null);
 assert.equal(page.deletesHeld(base.lunch), false);assert.equal(page.deletesHeld(base.wallet), true);assert.equal(page.deletesHeld(null), false);
 assert.equal(page.deletesHeld({ ...base.wallet, history_event_id: 'e1' }), false, 'a transaction written by a larger action is undone, not deleted here');
});

test('Close opens on the record as it is now, and each dialog saves through the workspace', async () => {
 const base = workspaceOf();
 // The dialog was opened on a balance of 300; a transfer has since emptied the account.
 let page = host({ ...base.workspace, closing: { record: { ...base.wallet, amount: 300 } } });
 assert.equal(page.props('CloseRecordDialog').record.amount, 0);
 await page.props('CloseRecordDialog').onSave('2026-11-20', 'card');
 page.props('CloseRecordDialog').onClose();
 // A record that has left the lists is shown as it was opened.
 page = host({ ...base.workspace, closing: { record: record('gone', 'Cash', 7) } });
 assert.equal(page.props('CloseRecordDialog').record.amount, 7);
 page = host({ ...base.workspace, closing: { account: { id: 'broker', name: 'Broker' } } });
 assert.equal(page.props('CloseAccountDialog').accounts.length, 1);
 await page.props('CloseAccountDialog').onSave('2026-11-20', null, true);
 page = host({ ...base.workspace, closing: { remove: { id: 'broker', name: 'Broker' } } });
 await page.props('DeleteAccountDialog').onDelete();
 assert.deepEqual(base.calls, [['closeRecord', 'wallet', '2026-11-20', 'card'], ['endClosing'], ['closeAccount', 'broker', '2026-11-20', null, true], ['deleteAccount', 'broker']]);
});

test('Investments folds closed holdings and investment accounts under its cards, and keeps them out of the cards', () => {
 const view = createRenderer(), calls = [];
 const open = record('AAPL', 'Stock', 10), sold = record('TSLA', 'Stock', 10, { quantity: 0, closed_on: '2026-10-01' }), shutWallet = record('Old wallet', 'Cash', 0, { closed_on: '2026-09-01' }), lent = record('Lent', 'Money lent', 0, { closed_on: '2026-08-01' });
 const dashboards = [];
 const workspace = { user: 'me', demo: false, rows: [open, sold], currency: 'USD', market: null, preferencesData: { currencies: ['USD'] }, excludedCurrencies: [], workspacePreferences: {}, reload: 0, workspaceLoading: false, tableLoading: false, businessList: [], readOnly: false,
  planning: { loading: false, error: '', data: { records: [open], closed: [sold, shutWallet, lent], closedAccounts: [{ id: 'gone', name: 'Old broker', kind: 'Stock', currency: 'USD', closed_on: '2026-10-02' }], holdingAccounts: [] } },
  requestClose: item => calls.push(['close', item.id]), reopenRecord: item => calls.push(['reopen', item.id]), reopenAccount: item => calls.push(['reopenAccount', item.id]), requestDelete: item => calls.push(['delete', item.id]), setSettingUpBusinesses() {} };
 const { AssetsScreen } = view.load('components/workspace/screens/assets-screen.tsx', {
  ...ui.modules,
  '@/components/workspace/workspace-provider': { useWorkspace: () => workspace },
  '@/components/presentation-foundation/segmented': hostModule(), '@/components/presentation-foundation/page-header': hostModule(), '@/components/presentation-foundation/screen-skeletons': hostModule(),
  '@/components/presentation-foundation/category-icon': hostModule(), '@/components/presentation-foundation/count': hostModule(), '@/components/presentation-foundation/row-menu': hostModule(),
  '@/components/asset-dashboard': { AssetDashboard: props => { dashboards.push(props); return h('div', { 'data-part': 'dashboard' }); } },
  '@/components/planning/add-asset-dialog': { AddAssetDialog: () => null }, '@/components/workspace/screen-notices': hostModule(),
  '@/components/portfolio-allocation-plan': hostModule(), '@/components/performance/performance-lazy': hostModule(),
  '@/hooks/use-property-totals': { usePropertyTotals: () => null }, '@/hooks/use-investment-pnl': { useInvestmentPnl: () => ({ pnl: null }) }, '@/hooks/use-location-search': { useLocationSearch: () => '' },
  'lucide-react': hostModule(),
 });
 view.mount(h(AssetsScreen));
 assert.deepEqual(dashboards.at(-1).records.map(item => item.id), ['AAPL'], 'a closed holding has no card');
 dashboards.at(-1).onClose(open);
 const rows = view.all(node => node.type === 'li' && node.props.className === 'closed-row');
 // The closed investment account, then the closed holdings and accounts of the asset kinds; money lent belongs to Loans.
 assert.deepEqual(rows.map(row => text(view.find(node => node.type === 'strong', [row]))), ['Old broker', 'TSLA', 'Old wallet']);
 for (const row of rows) view.fire(view.find(node => node.type === ui.Button, [row]), 'onClick');
 assert.deepEqual(calls, [['close', 'AAPL'], ['reopenAccount', 'gone'], ['reopen', 'TSLA'], ['reopen', 'Old wallet']]);
});
