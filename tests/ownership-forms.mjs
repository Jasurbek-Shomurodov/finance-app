import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

const base = { currency: 'USD', quantity: 1, cost: 0, rate: 0, date: '2026-01-01', frequency: 'Once', notes: '', ownership_percentage: 100 };
const entry = (id, kind, amount, extra = {}) => ({ ...base, id, name: id, kind, amount, ...extra });

test('a business\'s or property\'s page opens the normal forms with it chosen', () => {
 const { assetEntryStart } = loadTS('lib/linked-asset.ts');
 assert.deepEqual(assetEntryStart({ id: 'club', kind: 'Business' }, 'income'), { kind: 'Business income', preset: { business_id: 'club' } });
 assert.deepEqual(assetEntryStart({ id: 'club', kind: 'Business' }, 'expense'), { kind: 'Other expense', preset: { business_id: 'club' } });
 assert.deepEqual(assetEntryStart({ id: 'flat', kind: 'Property', business_id: 'rentals' }, 'income'), { kind: 'Rent income', preset: { income_source_id: 'flat' } });
 assert.deepEqual(assetEntryStart({ id: 'flat', kind: 'Property', business_id: 'rentals' }, 'expense'), { kind: 'Other expense', preset: { property_id: 'flat', business_id: 'rentals' } });
 assert.deepEqual(assetEntryStart({ id: 'flat', kind: 'Property' }, 'expense').preset, { property_id: 'flat', business_id: null });
 assert.equal(assetEntryStart({ id: 'car', kind: 'Vehicle' }, 'income'), null);
});

test('the sample workspace keeps a transaction\'s share the way the database does', () => {
 const { demoBusinessShare } = loadTS('lib/record-save.ts');
 const club = entry('club', 'Business', 40000, { ownership_percentage: 60 }), sheep = entry('sheep', 'Business', 80000, { ownership_percentage: 50 });
 const sale = entry('sale', 'Business income', 1000, { business_id: 'club', amount_basis: 'whole' });
 assert.deepEqual(demoBusinessShare(sale, [club, sheep]), { business_share: 60, amount_basis: 'whole' });
 // Ownership changed since: the saved transaction keeps its share; moved to another business it takes that one's.
 const stored = { ...sale, business_share: 60 };
 assert.equal(demoBusinessShare(sale, [{ ...club, ownership_percentage: 75 }, sheep], stored).business_share, 60);
 assert.equal(demoBusinessShare({ ...sale, business_id: 'sheep' }, [club, sheep], stored).business_share, 50);
 assert.deepEqual(demoBusinessShare({ ...sale, business_id: null }, [club]), { business_share: null, amount_basis: 'mine' });
 assert.deepEqual(demoBusinessShare(entry('till', 'Cash', 5, { business_id: 'club', amount_basis: 'whole' }), [club]), { business_share: null, amount_basis: 'mine' });
 assert.deepEqual(demoBusinessShare(entry('x', 'Other expense', 5, { business_id: 'club' }), [club]), { business_share: 60, amount_basis: 'mine' });
});

test('a Tracker value update of an owned asset: two numbers for a counted one, and a share that can change', () => {
 const owned = loadTS('components/investment-tracker-owned.tsx');
 const sheep = entry('sheep', 'Business', 85, { quantity: 1300, unit_label: 'sheep', ownership_percentage: 50 }), flat = entry('flat', 'Property', 90000), cash = entry('cash', 'Cash', 10);
 assert.deepEqual(owned.ownedDraftStart(sheep, 'valuation'), { quantity: 1300, unit_value: 85 });
 assert.deepEqual(owned.ownedDraftStart(sheep, 'contribution'), {});
 assert.deepEqual(owned.ownedDraftStart(flat, 'valuation'), {});
 const draft = extra => ({ type: 'valuation', balance: 0, ...extra });
 // The balance is the exact product of what was typed.
 assert.equal(owned.ownedBalance(sheep, draft({ quantity: 1400, unit_value: 90.5 }), true, 110500), 126700);
 assert.deepEqual(owned.ownedPayload(sheep, draft({ quantity: 1400, unit_value: 90.5 })), { quantity: 1400, unit_value: 90.5 });
 // A changed share alone keeps the value the asset has; a typed value wins.
 assert.equal(owned.ownedBalance(flat, draft({ ownership: 40 }), true, 90000), 90000);
 assert.equal(owned.ownedBalance(flat, draft({ ownership: 40, balance: 95000 }), false, 90000), 95000);
 assert.equal(owned.ownedBalance(flat, draft({}), true, 90000), 0, 'a blank value is never taken for the current one');
 assert.deepEqual(owned.ownedPayload(flat, draft({ ownership: 40 })), { ownership: 40 });
 assert.deepEqual(owned.ownedPayload(flat, draft({ ownership: 100 })), {}, 'the same share is not a change');
 assert.deepEqual(owned.ownedPayload(sheep, draft({ type: 'contribution', ownership: 10 })), {}, 'only a value update changes the share');
 assert.deepEqual(owned.ownedPayload(cash, draft({ ownership: 10 })), {});
 assert.equal(owned.ownedDraftReady(flat, draft({ ownership: 0 })), false);
 assert.equal(owned.ownedDraftReady(flat, draft({ ownership: 100.5 })), false);
 assert.equal(owned.ownedDraftReady(flat, draft({ ownership: 33.5 })), true);
 assert.equal(owned.ownedDraftReady(sheep, draft({ quantity: 1e13, unit_value: 1 })), false);
 assert.equal(owned.ownedDraftReady(sheep, draft({ quantity: 0, unit_value: 0 })), true, 'a herd can come to nothing');
 assert.equal(owned.ownedDraftReady(cash, draft({ ownership: 0 })), true, 'a share means nothing to a cash balance');
});

test('whole or mine is offered only for a one-time transaction of a part-owned business', () => {
 const { basisShare } = loadTS('components/record-dialog/business-basis-field.tsx');
 const club = entry('club', 'Business', 40000, { ownership_percentage: 60 }), solo = entry('solo', 'Business', 1000);
 const sale = entry('sale', 'Business income', 1000, { business_id: 'club' });
 assert.equal(basisShare(sale, [club, solo]), 60);
 assert.equal(basisShare({ ...sale, business_id: 'solo' }, [club, solo]), null, 'owned in full: nothing to choose');
 assert.equal(basisShare({ ...sale, business_id: null }, [club]), null);
 assert.equal(basisShare({ ...sale, frequency: 'Monthly' }, [club]), null, 'a schedule is the owner\'s own plan');
 // A saved transaction shows the share it kept, until it is moved to another business.
 assert.equal(basisShare({ ...sale, business_share: 45 }, [club], { business_id: 'club' }), 45);
 assert.equal(basisShare({ ...sale, business_share: 45 }, [club], { business_id: 'other' }), 60);
});

test('every new string is translated in all 29 languages with its placeholders', async () => {
 const fs = await import('node:fs');
 const keys = ['Counted in units', 'Unit name', 'e.g. sheep, hectares or machines', 'Total value: {amount}', 'You own {percent} · your share {amount}', 'Value per unit', '{quantity} {unit} × {value}', 'Amount is for', 'My share', 'Whole business', 'Figures shown', 'Your share', 'You own {percent}'];
 const files = fs.readdirSync('lib/locales').filter(name => name.endsWith('.json'));
 assert.equal(files.length, 29);
 const marks = text => (text.match(/\{\w+\}/g) ?? []).sort().join();
 for (const file of files) {
  const dictionary = JSON.parse(fs.readFileSync('lib/locales/' + file, 'utf8'));
  for (const key of keys) {
   assert.ok(dictionary[key], `${file}: ${key}`);
   assert.equal(marks(dictionary[key]), marks(key), `${file}: ${key}`);
   // Everything but the bare formula is a translation, not the English text.
   if (file !== 'en.json' && key !== '{quantity} {unit} × {value}') assert.notEqual(dictionary[key], key, `${file}: ${key}`);
  }
 }
});
