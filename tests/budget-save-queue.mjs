import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/hooks.mjs';
import { loadTS } from './helpers/load-ts.mjs';
const { emptyBudget, setBudgetAmount } = loadTS('lib/budget.ts');
const { repeatBudgetAmount } = loadTS('lib/budget-schedules.ts');
const { saveQueueKey } = loadTS('hooks/use-budget.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));

/** `useBudget` with the budget read stubbed and every POST held until the test settles it. */
function budgetHook() {
 const posts = [], invalidated = [];
 const saveOwnerResource = (url, action, data) => new Promise((resolve, reject) => posts.push({ action, data, resolve, reject }));
 const remote = { data: emptyBudget, initialLoading: false, error: '', retry() {}, update() {}, invalidate: () => invalidated.push(1) };
 const run = harness('hooks/use-budget.ts', 'useBudget', { emptyBudget, setBudgetAmount, repeatBudgetAmount, depositMonth: () => '2026-10', demoBudget: () => emptyBudget, saveOwnerResource, useOwnerResource: () => remote });
 return { hook: () => run('owner', false, 0), posts, invalidated };
}

test('CONC-009: two quick saves of one category go out one after the other, so the last typed figure lands last', async () => {
 const { hook, posts } = budgetHook();
 const first = hook().saveAmount('food', '2026-10', 300, 'USD', true);
 const second = hook().saveAmount('food', '2026-10', 350, 'USD', true);
 const other = hook().saveCategory({ category_key: 'rent', budget_type: 'fixed', rollover: false, rollover_start: null, excluded: false });
 await flush();
 assert.deepEqual(posts.map(post => [post.action, post.data.category_key, post.data.amount]), [['amount', 'food', 300], ['category', 'rent', undefined]], 'the second food save waits; another category does not');
 posts[0].resolve({}); await flush();
 assert.equal(posts.length, 3); assert.equal(posts[2].data.amount, 350, 'the later figure is sent only once the earlier one is confirmed');
 posts[1].resolve({}); posts[2].resolve({}); await Promise.all([first, second, other]);
});

test('a failed save in the queue reloads the stored budget and still lets the next save of that category run', async () => {
 const { hook, posts, invalidated } = budgetHook();
 const first = hook().saveAmount('food', '2026-10', 300, 'USD', false);
 const second = hook().saveAmount('food', '2026-10', 350, 'USD', false);
 await flush();
 posts[0].reject(new Error('Offline'));
 await assert.rejects(first, /Offline/);
 assert.equal(invalidated.length, 1);
 await flush();
 assert.equal(posts.length, 2, 'the queue moves on after the failure');
 posts[1].resolve({}); await second;
});

test('saveQueueKey: saves queue by category; budget-wide saves each keep their own queue', () => {
 assert.equal(saveQueueKey('amount', { category_key: 'food' }), 'category:food');
 assert.equal(saveQueueKey('category', { category_key: 'food' }), 'category:food');
 assert.equal(saveQueueKey('settings', { mode: 'flex' }), 'settings');
 assert.equal(saveQueueKey('amounts', { month: '2026-10', items: [] }), 'amounts');
});
