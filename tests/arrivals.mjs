import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalLimit, arrivedRows } from '../lib/arrivals.ts';

// Just enough of an element: the tag or class it matches, its parent's children, and whether it sits in a skipped area.
function list(count, kind = 'li') {
 const parent = { children: [] };
 for (let index = 0; index < count; index++) parent.children.push(element(kind, parent));
 return parent;
}
function element(kind, parent, skipped = false) {
 return { kind, parentElement: parent, matches: selector => selector.split(',').includes(kind), closest: () => skipped ? {} : null };
}
const add = (parent, kind = 'li', skipped = false) => { const row = element(kind, parent, skipped); parent.children.push(row); return row; };

test('a row or two joining a list already on screen arrive', () => {
 const rows = list(5);
 const saved = add(rows);
 assert.deepEqual(arrivedRows([saved]), [saved]);
 const card = add(list(2, '.asset-card'), '.asset-card');
 assert.deepEqual(arrivedRows([card]), [card], 'a holding card in its grid');
});

test('a whole new list, a page of rows, a non-row, a loading placeholder and table headings never arrive', () => {
 const fresh = list(2);
 assert.deepEqual(arrivedRows(fresh.children), [], 'every row in the list is new: the list itself just appeared');
 const page = list(3);
 const many = Array.from({ length: arrivalLimit + 1 }, () => add(page));
 assert.deepEqual(arrivedRows(many), []);
 assert.deepEqual(arrivedRows([add(list(3), 'div')]), [], 'a panel or wrapper is not a row');
 assert.deepEqual(arrivedRows([add(list(3), 'li', true)]), [], 'inside a skeleton, a thead or an opted-out area');
});

test('the workspace watcher marks rows only after a press or a submit, leaves moves alone, and clears the mark', async () => {
 const { loadTS } = await import('./helpers/load-ts.mjs');
 class FakeElement { constructor(kind, parent) { Object.assign(this, element(kind, parent)); this.attributes = new Map(); }
  setAttribute(name, value) { this.attributes.set(name, value); } removeAttribute(name) { this.attributes.delete(name); } }
 const listeners = new Map();
 let observed = null, disconnected = false;
 const saved = { Element: globalThis.Element, MutationObserver: globalThis.MutationObserver, document: globalThis.document };
 Object.assign(globalThis, {
  Element: FakeElement,
  MutationObserver: class { constructor(callback) { observed = callback; } observe() {} disconnect() { disconnected = true; } },
  document: { addEventListener: (type, handler) => listeners.set(type, handler), removeEventListener: type => listeners.delete(type) },
 });
 try {
  const { useArrivalMarks } = loadTS('hooks/use-arrivals.ts', { react: { useCallback: callback => callback } });
  const attach = useArrivalMarks();
  assert.equal(attach(null), undefined, 'nothing to watch before the workspace renders');
  const detach = attach({});
  const parent = { children: [] };
  parent.children.push(new FakeElement('li', parent));
  const insert = () => { const row = new FakeElement('li', parent); parent.children.push(row); return row; };
  const quiet = insert();
  observed([{ addedNodes: [quiet], removedNodes: [] }]);
  assert.equal(quiet.attributes.has('data-arrived'), false, 'a background refresh is not an arrival');
  listeners.get('click')({ type: 'click', target: { closest: () => null } });
  const stray = insert();
  observed([{ addedNodes: [stray], removedNodes: [] }]);
  assert.equal(stray.attributes.has('data-arrived'), false, 'a click on nothing pressable causes nothing');
  listeners.get('submit')({ type: 'submit', target: null });
  const row = insert(), moved = insert();
  observed([{ addedNodes: [row, moved], removedNodes: [moved] }]);
  assert.equal(row.attributes.has('data-arrived'), true);
  assert.equal(moved.attributes.has('data-arrived'), false, 'a row that moved did not arrive');
  await new Promise(resolve => setTimeout(resolve, 1850));
  assert.equal(row.attributes.has('data-arrived'), false, 'the mark goes once the motion has played');
  detach();
  assert.ok(disconnected && !listeners.size);
 } finally { Object.assign(globalThis, saved); }
});
