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
export function matchingNames(rows: Entry[], entry: Pick<Entry, 'id' | 'kind' | 'name'>, original?: Entry) {
  const query = normalizeName(entry.name);
  if (!query) return [];
  const groups = new Map<string, { name: string; count: number; exact: boolean }>();
  for (const row of rows) {
    if (row.kind !== entry.kind) continue;
    const containsCurrent = row.record_count === undefined ? row.id === entry.id : !!original && row.kind === original.kind && row.currency === original.currency && row.frequency === original.frequency && normalizeName(row.name) === normalizeName(original.name);
    const count = (row.record_count ?? 1) - (containsCurrent ? 1 : 0);
    if (count <= 0) continue;
    const key = normalizeName(row.name);
    if (!key.includes(query)) continue;
    const group = groups.get(key);
    if (group) group.count += count;
    else groups.set(key, { name: row.name.trim().replace(/\s+/g, ' '), count, exact: key === query });
  }
  return [...groups.values()].sort((a,b) => Number(b.exact) - Number(a.exact) || a.name.localeCompare(b.name));
}
/** A note as a row's line of context: left out when it already names the record or only repeats the name. */
export function noteLine(record: Named, categoryName?: string) {
  const note = record.notes?.trim();
  return note && !noteTitle(record, categoryName) && !note.startsWith(record.name.trim()) ? note : null;
}
