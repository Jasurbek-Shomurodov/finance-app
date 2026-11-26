import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

const { coOwnersOf, coOwnedPercent, unassignedPercent, ownershipParts, coOwnersProblem, newCoOwner, moveCoOwner, maxOwnPercent, isShared, savedCoOwners } = loadTS('lib/co-owners.ts');
const { recordSchema } = loadTS('lib/record-schema.ts');
const { changeRecordKind } = loadTS('lib/record-kind.ts');
const { recordSaveProblem } = loadTS('lib/record-save.ts');

const uuid = n => `17300000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const aziz = { id: uuid(1), name: 'Aziz', percentage: 30 }, dilshod = { id: uuid(2), name: 'Dilshod', percentage: 20 };
const cafe = (extra = {}) => ({ id: uuid(10), name: 'Zar Kebab Cafe', kind: 'Business', currency: 'USD', amount: 42000, quantity: 1, cost: 0, rate: 0, date: '2026-10-01', frequency: 'Once', notes: '', ownership_percentage: 50, co_owners: [aziz, dilshod], ...extra });

test('a 50 / 30 / 20 split: each slice of the whole value, the person first', () => {
 const parts = ownershipParts(cafe(), 42000);
 assert.deepEqual(parts.map(part => [part.role, part.name, part.percentage, part.value, part.color]), [['you', '', 50, 21000, 0], ['co-owner', 'Aziz', 30, 12600, 1], ['co-owner', 'Dilshod', 20, 8400, 2]]);
 assert.equal(coOwnedPercent(coOwnersOf(cafe())), 50);
 assert.equal(unassignedPercent(cafe()), 0);
 assert.equal(isShared(cafe()), true);
 assert.equal(coOwnersProblem(cafe()), '');
});

test('what nobody is named for is its own slice, and the whole value may be unknown', () => {
 const parts = ownershipParts(cafe({ co_owners: [aziz] }), null);
 assert.deepEqual(parts.map(part => [part.role, part.percentage, part.value]), [['you', 50, null], ['co-owner', 30, null], ['unassigned', 20, null]]);
 // Thirds that add up to 100 in decimals leave nothing over.
 assert.equal(unassignedPercent(cafe({ ownership_percentage: 33.34, co_owners: [{ ...aziz, percentage: 33.33 }, { ...dilshod, percentage: 33.33 }] })), 0);
 assert.equal(isShared(cafe({ ownership_percentage: 100, co_owners: [] })), false);
 assert.equal(isShared(cafe({ ownership_percentage: 60, co_owners: [] })), true);
});

test('only an asset valued by hand has co-owners', () => {
 assert.deepEqual(coOwnersOf({ kind: 'Stock', ownership_percentage: 100, co_owners: [aziz] }), []);
 assert.deepEqual(coOwnersOf({ kind: 'Property', ownership_percentage: 50 }), []);
 const stock = changeRecordKind(cafe(), 'Stock', '2026-11-26');
 assert.deepEqual(stock.co_owners, []);
 assert.equal(stock.ownership_percentage, 100);
 assert.deepEqual(changeRecordKind(cafe(), 'Property', '2026-11-26').co_owners, [aziz, dilshod]);
});

test('the form names what stops a save', () => {
 assert.equal(coOwnersProblem(cafe({ co_owners: [{ ...aziz, name: '  ' }] })), 'Enter a name for each co-owner.');
 assert.equal(coOwnersProblem(cafe({ co_owners: [{ ...aziz, percentage: 0 }] })), 'Enter a share above 0 for each co-owner.');
 assert.equal(coOwnersProblem(cafe({ ownership_percentage: 60 })), 'The shares add up to more than the whole asset.');
 assert.equal(coOwnersProblem(cafe({ co_owners: Array.from({ length: 13 }, (_, n) => ({ id: uuid(100 + n), name: 'P' + n, percentage: 1 })), ownership_percentage: 10 })), 'Name at most 12 co-owners.');
 assert.equal(recordSaveProblem(cafe({ ownership_percentage: 60 })), 'The shares add up to more than the whole asset.');
 assert.equal(recordSaveProblem(cafe()), '');
});

test('a new co-owner is offered what is left; the person\'s share can grow only into it', () => {
 const added = newCoOwner(cafe({ co_owners: [aziz] }));
 assert.equal(added.percentage, 20);
 assert.match(added.id, /^[0-9a-f-]{36}$/);
 assert.equal(newCoOwner(cafe()).percentage, 0);
 assert.equal(maxOwnPercent(cafe()), 50);
 assert.equal(maxOwnPercent(cafe({ co_owners: [] })), 100);
});

test('co-owners keep the order the person drags them into', () => {
 const third = { id: uuid(3), name: 'Malika', percentage: 5 };
 assert.deepEqual(moveCoOwner([aziz, dilshod, third], third.id, aziz.id).map(o => o.name), ['Malika', 'Aziz', 'Dilshod']);
 assert.deepEqual(moveCoOwner([aziz, dilshod], aziz.id, 'missing').map(o => o.name), ['Aziz', 'Dilshod']);
 assert.deepEqual(savedCoOwners([{ ...aziz, name: ' Aziz ' }]), [aziz]);
});

test('the server schema trims names and refuses a list that does not fit', () => {
 const parsed = recordSchema.safeParse(cafe({ co_owners: [{ ...aziz, name: ' Aziz ' }, dilshod] }));
 assert.ok(parsed.success);
 assert.deepEqual(parsed.data.co_owners, [aziz, dilshod]);
 const issue = record => recordSchema.safeParse(record).error?.issues.map(item => item.message);
 assert.deepEqual(issue(cafe({ ownership_percentage: 60 })), ['The shares add up to more than the whole asset.']);
 assert.deepEqual(issue(cafe({ co_owners: [aziz, { ...dilshod, id: aziz.id }] })), ['Check the record fields.']);
 assert.ok(issue(cafe({ co_owners: [{ ...aziz, percentage: 100 }], ownership_percentage: 1 })));
 assert.ok(issue(cafe({ co_owners: [{ ...aziz, email: 'x' }] })));
 assert.deepEqual(issue({ ...cafe(), kind: 'Stock', ownership_percentage: 100 }), ['Check the record fields.']);
 // A record without the field is untouched by it (the Telegram bot never sends it).
 assert.equal(recordSchema.parse(cafe({ co_owners: undefined })).co_owners, undefined);
});
