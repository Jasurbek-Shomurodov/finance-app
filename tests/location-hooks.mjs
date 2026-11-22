import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

/** Loads a hook with a React whose effects run at once, each render cleaning up the one before (an effect with no
 * dependency list runs after every render). */
function load(file, extra = {}) {
 let cleanup;
 const react = { useEffect(effect) { cleanup?.(); cleanup = effect(); }, ...extra.react };
 return loadTS(file, { react, 'next/navigation': extra.navigation ?? { useSearchParams() {} } });
}

/** A stand-in address bar: `hash`, `pathname`, `search`, replaceState and the listeners a hook adds. */
function fakeWindow({ pathname = '/transactions', search = '', hash = '' } = {}) {
 const listeners = new Map();
 const win = {
  location: { pathname, search, hash },
  history: { replaceState(_state, _title, url) { win.replaced.push(url); const [path, query = ''] = url.split('?'); Object.assign(win.location, { pathname: path, search: query ? '?' + query : '', hash: '' }); } },
  replaced: [],
  addEventListener(type, listener) { listeners.set(type, [...(listeners.get(type) ?? []), listener]); },
  removeEventListener(type, listener) { listeners.set(type, (listeners.get(type) ?? []).filter(item => item !== listener)); },
  fire(type) { for (const listener of listeners.get(type) ?? []) listener(); },
  count: type => (listeners.get(type) ?? []).length,
 };
 return win;
}

test('a link with the anchor opens its request once and clears the anchor, keeping the path and query', () => {
 globalThis.window = fakeWindow({ search: '?tag=food', hash: '#rules' });
 let opened = 0;
 const { useHashRequest } = load('hooks/use-hash-request.ts');
 useHashRequest('#rules', () => opened++);
 assert.equal(opened, 1);
 assert.deepEqual(window.replaced, ['/transactions?tag=food'], 'the anchor is cleared, so back or reload does not open it again');
 useHashRequest('#rules', () => opened++);
 assert.equal(opened, 1, 'a later render with the anchor gone opens nothing');
 assert.equal(window.count('hashchange'), 1, 'the previous listener is removed before a new one is added');
 delete globalThis.window;
});

test('an anchor arriving later opens it; another anchor, or a switched-off request, does not', () => {
 globalThis.window = fakeWindow();
 let opened = 0;
 const { useHashRequest } = load('hooks/use-hash-request.ts');
 useHashRequest('#forecast', () => opened++);
 assert.equal(opened, 0, 'nothing asked for yet');
 window.location.hash = '#flow';
 window.fire('hashchange');
 assert.equal(opened, 0, 'another anchor is left for its own request');
 window.location.hash = '#forecast';
 window.fire('hashchange');
 assert.equal(opened, 1, 'the router setting the anchor after the first render still opens it');
 const { useHashRequest: disabled } = load('hooks/use-hash-request.ts');
 window.location.hash = '#forecast';
 let ignored = 0;
 disabled('#forecast', () => ignored++, false);
 assert.equal(ignored, 0, 'a request that is switched off waits');
 assert.equal(window.location.hash, '#forecast', 'and leaves the anchor for when it is switched on');
 delete globalThis.window;
});

test('the query string is read from the address, empty on the server, and follows back and forward', () => {
 globalThis.window = fakeWindow({ search: '?business=shop&tag=a,b' });
 const stores = [];
 let read = 0;
 const { useLocationSearch } = load('hooks/use-location-search.ts', {
  navigation: { useSearchParams: () => { read++; } },
  react: { useSyncExternalStore: (subscribe, client, server) => { stores.push({ subscribe, server }); return client(); } },
 });
 assert.equal(useLocationSearch(), '?business=shop&tag=a,b');
 assert.equal(read, 1, 'the router\'s search params are read so a router change renders again');
 assert.equal(stores[0].server(), '', 'nothing is read while rendering on the server');
 let changes = 0;
 const unsubscribe = stores[0].subscribe(() => changes++);
 window.fire('popstate');
 assert.equal(changes, 1, 'back and forward render again');
 unsubscribe();
 window.fire('popstate');
 assert.equal(changes, 1, 'and stop once unsubscribed');
 delete globalThis.window;
});

test('a query list splits repeated and comma-joined values and drops empty ones', () => {
 const { queryList } = load('hooks/use-location-search.ts', { react: { useSyncExternalStore() {} } });
 assert.deepEqual(queryList('?tag=a,b&tag=c&tag=', 'tag'), ['a', 'b', 'c']);
 assert.deepEqual(queryList('', 'tag'), []);
});
