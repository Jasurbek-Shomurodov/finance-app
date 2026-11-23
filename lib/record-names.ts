import { expenses, income, type Entry } from './finance';
const categoryKeys = new Set([...income, ...expenses]);
const generatedNames = new Set(['Transaction fee', 'Transfer fee']);
type Named = Pick<Entry, 'name'> & Partial<Pick<Entry, 'movement_id' | 'operation_id' | 'notes' | 'kind'>>;
/** A transaction saved without a name stands in with its category (its key, its kind or its custom category's name);
 * when it has a note, the note is what the person wrote about it, so the note is its title. */
function noteTitle(record: Named, categoryName?: string) {
  const note = record.notes?.trim().split('\n')[0].trim().slice(0, 120);
  return note && isStandInName(record, categoryName) ? note : null;
}
/** Whether a record's name is only its category standing in for a name nobody typed. */
export function isStandInName(record: Named, categoryName?: string) {
  const name = (record.name ?? '').trim().toLowerCase();
  const standIns = [record.kind ?? '', categoryName ?? ''].map(value => value.trim().toLowerCase()).filter(Boolean);
  return !name || categoryKeys.has((record.name ?? '').trim()) || standIns.includes(name);
}
/** The name to show. A transaction saved without a name keeps its category's key, and transfer fees are named by the app;
 * both read in the current language, unless the transaction has a note, which then names it. A name the person typed is
 * shown as typed. Pass the custom category's name where it is known, so a stand-in under it is recognised too. */
export function shownName(record: Named, translate: (key: string) => string, categoryName?: string) {
  const titled = noteTitle(record, categoryName);
  if (titled) return titled;
  const name = record.name.trim();
  return categoryKeys.has(name) || (generatedNames.has(name) && !!(record.movement_id || record.operation_id)) ? translate(name) : record.name;
}
const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
/** A name used before: how many records carry it and the latest single one, which a chosen suggestion fills from. */
export type NameMatch = { name: string; count: number; exact: boolean; last?: Entry };
/** How many records a row stands for, leaving out the one being edited (a summary row counts it among its own). */
function otherRecords(row: Entry, entry: Pick<Entry, 'id'>, original?: Entry) {
  const containsCurrent = row.record_count === undefined ? row.id === entry.id : !!original && row.kind === original.kind && row.currency === original.currency && row.frequency === original.frequency && normalizeName(row.name) === normalizeName(original.name);
  return (row.record_count ?? 1) - (containsCurrent ? 1 : 0);
}
/** The later of two records; a summary row adds several records up, so it has no last amount to offer. */
function laterRecord(last: Entry | undefined, row: Entry) {
  if ((row.record_count ?? 1) !== 1) return last;
  return !last || (row.date ?? '') > (last.date ?? '') ? row : last;
}
/** Past names containing what was typed, an exact match first. `kinds` widens the search beyond the record's own kind:
 * the expense form looks through every expense category, so a name finds its category. */
export function matchingNames(rows: Entry[], entry: Pick<Entry, 'id' | 'kind' | 'name'>, original?: Entry, kinds: readonly string[] = [entry.kind]): NameMatch[] {
  const query = normalizeName(entry.name);
  if (!query) return [];
  const groups = new Map<string, NameMatch>();
  for (const row of rows) {
    // A category standing in for a name nobody typed is not a name to offer.
    if (!kinds.includes(row.kind) || categoryKeys.has(row.name.trim())) continue;
    const count = otherRecords(row, entry, original);
    const key = normalizeName(row.name);
    if (count <= 0 || !key.includes(query)) continue;
    const group = groups.get(key) ?? { name: row.name.trim().replace(/\s+/g, ' '), count: 0, exact: key === query };
    groups.set(key, { ...group, count: group.count + count, last: laterRecord(group.last, row) });
  }
  return [...groups.values()].sort((a,b) => Number(b.exact) - Number(a.exact) || a.name.localeCompare(b.name));
}
/** A note as a row's line of context: left out when it already names the record or only repeats the name. */
export function noteLine(record: Named, categoryName?: string) {
  const note = record.notes?.trim();
  return note && !noteTitle(record, categoryName) && !note.startsWith(record.name.trim()) ? note : null;
}

/** The example name a new record's field shows, by kind; income and expense plans have their own. */
const namePlaceholders: Record<string, string> = {
 'Rent income': 'e.g. Apartment rent', 'Business income': 'e.g. Monthly business payout', Salary: 'e.g. Monthly salary', 'Other income': 'e.g. Monthly salary',
 'Money lent': 'e.g. Full name', Business: 'e.g. Solar panels, café, or game club', Property: 'e.g. Apartment or land', Valuables: 'e.g. Watch, jewellery or art',
 Vehicle: 'e.g. Family car or motorbike', 'Retirement account': 'e.g. Pension, 401(k) or IRA', Bond: 'e.g. 10-year government bond', 'Precious metals': 'e.g. Gold bars or coins',
 'Treasury bill': 'e.g. 6-month Treasury bill', Mortgage: 'e.g. Apartment mortgage', Loan: 'e.g. Car loan or credit card', Debt: 'e.g. Car loan or credit card',
};
export const namePlaceholder = (kind: string, cashFlow: boolean) => cashFlow && !income.includes(kind) ? 'e.g. Rent or internet subscription' : namePlaceholders[kind] ?? 'e.g. Savings account';
