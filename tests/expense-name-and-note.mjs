import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTS } from './helpers/load-ts.mjs';

const save = loadTS('lib/record-save.ts');

test('a blank expense is named by its category, never by its note', () => {
  assert.equal(save.expenseName({ kind: 'Living expense', name: ' ', notes: 'Gas & Diesel.' }, 'Living expense', 'Living expense'), 'Living expense');
  assert.equal(save.expenseName({ kind: 'Living expense', name: '', notes: 'Javoxirga' }, undefined, 'Living expense'), 'Living expense');
  assert.equal(save.expenseName({ kind: 'Living expense', name: '', notes: 'Javoxirga' }, 'Pottery', 'Living expense'), 'Pottery');
});

test('a typed name is kept as typed, whatever the note says', () => {
  assert.equal(save.expenseName({ kind: 'Living expense', name: 'Fuel', notes: 'Gas & Diesel.' }, 'Living expense', 'Living expense'), 'Fuel');
});

test('income is never renamed from its note', () => {
  assert.equal(save.expenseName({ kind: 'Salary', name: '', notes: 'EPAM payslip' }, undefined, 'Salary'), '');
});

test('the transaction row shows the note under the name, outside the detail line', () => {
  const source = fs.readFileSync('components/workspace/records-table.tsx', 'utf8');
  assert.match(source, /const note = \(r: \(typeof visible\)\[number\]\) => \{[^}]*text !== detail\(r\)/, 'the note is its own rule');
  assert.match(source, /\{note\(r\)&&<small>\{note\(r\)\}<\/small>\}/, 'the note line renders under the name');
  assert.doesNotMatch(source, /: r\.notes && !r\.notes\.trim\(\)\.startsWith/, 'the note no longer replaces the detail line');
});

test('the note line is the comment, left out when it only repeats the name', () => {
  const names = loadTS('lib/record-names.ts');
  assert.equal(names.noteLine({ name: 'Living expense', notes: 'Gas & Diesel.' }), 'Gas & Diesel.');
  assert.equal(names.noteLine({ name: 'Javoxirga', notes: 'Javoxirga' }), null);
  assert.equal(names.noteLine({ name: 'Groceries', notes: '   ' }), null);
});

test('the Transactions screen shows the note under the name too', () => {
  const source = fs.readFileSync('components/workspace/screens/transactions-screen.tsx', 'utf8');
  assert.match(source, /\{noteLine\(record\) && <small>\{noteLine\(record\)\}<\/small>\}/, 'the note renders on the transaction row');
});
