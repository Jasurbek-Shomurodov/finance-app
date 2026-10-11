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

const names = loadTS('lib/record-names.ts');
const ru = key => ({ 'Living expense': 'Расходы на жизнь' }[key] ?? key);

test('a transaction named only by its category takes its note as its title', () => {
  assert.equal(names.shownName({ name: 'Living expense', kind: 'Living expense', notes: 'Gas & Diesel.' }, ru), 'Gas & Diesel.');
  assert.equal(names.shownName({ name: 'Pottery', kind: 'Living expense', notes: 'Clay' }, ru, 'Pottery'), 'Clay', 'a custom category stands in too');
  assert.equal(names.shownName({ name: '', kind: 'Living expense', notes: 'First line\nsecond line' }, ru), 'First line', 'one line, never the whole note');
  assert.equal(names.shownName({ name: 'Living expense', kind: 'Living expense', notes: '  ' }, ru), 'Расходы на жизнь', 'no note: the category, translated');
});

test('a typed name stays the title, whatever the note says', () => {
  assert.equal(names.shownName({ name: 'Javoxirga', kind: 'Other expense', notes: 'Javoxirga' }, ru), 'Javoxirga');
  assert.equal(names.shownName({ name: 'Solar Panel', kind: 'Business income', notes: 'Kechikib pul tushdi' }, ru), 'Solar Panel');
});

test('a note is context under a typed name, never a repeat of the title', () => {
  assert.equal(names.noteLine({ name: 'Solar Panel', kind: 'Business income', notes: 'Kechikib pul tushdi' }), 'Kechikib pul tushdi');
  assert.equal(names.noteLine({ name: 'Living expense', kind: 'Living expense', notes: 'Gas & Diesel.' }), null, 'already the title');
  assert.equal(names.noteLine({ name: 'Javoxirga', notes: 'Javoxirga' }), null);
});

test('transaction rows read name then account, with the category stand-in recognised', () => {
  const screen = fs.readFileSync('components/workspace/screens/transactions-screen.tsx', 'utf8');
  assert.doesNotMatch(screen, /noteLine/, 'no third line on the Transactions page');
  assert.doesNotMatch(screen, /shownName\(record, t\)/, 'every title knows the custom category');
  const table = fs.readFileSync('components/workspace/records-table.tsx', 'utf8');
  assert.match(table, /: noteLine\(r, categoryOf\(r\)\);/, 'the table keeps one line of context');
  assert.doesNotMatch(table, /shownName\(r, t\)/);
});

test('a one-time expense can be named, and a category stand-in reads as no name yet', () => {
  assert.equal(names.isStandInName({ name: 'Living expense', kind: 'Living expense' }), true);
  assert.equal(names.isStandInName({ name: 'pottery', kind: 'Living expense' }, 'Pottery'), true, 'a custom category stands in too');
  assert.equal(names.isStandInName({ name: '', kind: 'Living expense' }), true);
  assert.equal(names.isStandInName({ name: 'Fuel', kind: 'Living expense' }), false);
  const form = fs.readFileSync('components/record-dialog/expense-form.tsx', 'utf8');
  assert.match(form, /mode==='expense'&&<RecordNameInput optional label=\{t\('Name \(optional\)'\)\} entry=\{isStandInName\(editing,categoryName\)\?\{\.\.\.editing,name:''\}:editing\}/);
  assert.match(fs.readFileSync('components/record-name-input.tsx', 'utf8'), /required=\{!optional\}/, 'only a schedule must be named');
});
