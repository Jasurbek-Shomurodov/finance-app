import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalLimit, freshIds } from '../lib/arrivals.ts';

test('a handful of new rows in a list that was showing are arrivals', () => {
 assert.deepEqual(freshIds(new Set(['a', 'b']), ['c', 'a', 'b']), ['c']);
 assert.deepEqual(freshIds(new Set(['a', 'b', 'c']), ['d', 'a', 'b']), ['d'], 'a row pushed off the end is not an arrival');
});

test('a first render, an empty list before, a removal and a new page are not arrivals', () => {
 assert.deepEqual(freshIds(null, ['a', 'b']), []);
 assert.deepEqual(freshIds(new Set(), ['a']), []);
 assert.deepEqual(freshIds(new Set(['a', 'b']), ['a']), []);
 const page = Array.from({ length: arrivalLimit + 1 }, (_, index) => 'n' + index);
 assert.deepEqual(freshIds(new Set(['a']), page), []);
 assert.deepEqual(freshIds(new Set(['a']), page.slice(0, arrivalLimit)), page.slice(0, arrivalLimit));
});
