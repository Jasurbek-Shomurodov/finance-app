import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {periodGrowth}=loadTS('lib/period-growth.ts');

test('a period splits into the money put in and what the investments earned beyond it',()=>{
 const points=[{date:'2026-09-17',actual:400000,contributed:400000,invested:400000},{date:'2026-10-01',actual:405000,contributed:405000,invested:402000},{date:'2026-10-21',actual:414000,contributed:420000,invested:410000}];
 assert.deepEqual(periodGrowth(points),{invested:10000,returns:4000});
 // A loss shows as negative returns, even while money keeps going in.
 assert.deepEqual(periodGrowth([points[0],{...points[2],actual:405000}]),{invested:10000,returns:-5000});
});

test('without a value or the money put in at either end there is no split',()=>{
 assert.equal(periodGrowth([]),null);
 assert.equal(periodGrowth([{date:'2026-09-17',actual:null,contributed:0,invested:0},{date:'2026-09-18',actual:1,contributed:0,invested:0}]),null);
 assert.equal(periodGrowth([{date:'2026-09-17',actual:1,contributed:0},{date:'2026-09-18',actual:1,contributed:0}]),null);
});
