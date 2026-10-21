import type { Entry } from './finance';

/** A borrower group as it groups loans: spaces trimmed, case ignored. No name is no group. */
export const borrowerKey = (name: string | null | undefined) => name?.trim().toLocaleLowerCase() || null;

/** The borrower groups money lent already names, each once (first spelling wins), in alphabetical order. */
export function borrowers(records: readonly Entry[]): string[] {
 const names = new Map<string, string>();
 for (const record of records) {
  const key = record.kind === 'Money lent' ? borrowerKey(record.borrower_group) : null;
  if (key && !names.has(key)) names.set(key, record.borrower_group!.trim());
 }
 return [...names.values()].sort((a, b) => a.localeCompare(b));
}

export type LendingItem<T> = { row: T } | { borrower: string; rows: T[] };

/** A list with money lent of the same borrower group gathered under one heading, placed where the group's first loan
 * was. A group with one loan, a loan without a group and every other record stay rows of their own. */
export function lendingSequence<T>(rows: readonly T[], entryOf: (row: T) => Entry): LendingItem<T>[] {
 const keyOf = (row: T) => { const entry = entryOf(row); return entry.kind === 'Money lent' ? borrowerKey(entry.borrower_group) : null; };
 const counts = new Map<string, number>();
 for (const row of rows) { const key = keyOf(row); if (key) counts.set(key, (counts.get(key) ?? 0) + 1); }
 const groups = new Map<string, { borrower: string; rows: T[] }>(), items: LendingItem<T>[] = [];
 for (const row of rows) {
  const key = keyOf(row);
  if (!key || counts.get(key)! < 2) { items.push({ row }); continue; }
  let group = groups.get(key);
  if (!group) { group = { borrower: entryOf(row).borrower_group!.trim(), rows: [] }; groups.set(key, group); items.push(group); }
  group.rows.push(row);
 }
 return items;
}
