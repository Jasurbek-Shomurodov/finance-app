import type { RecurringItem } from './recurring';

type Kind = 'income' | 'total' | 'expense' | 'savings' | 'untraced';
export type RecurringFlows = { nodes: { name: string; kind: Kind }[]; links: { source: number; target: number; value: number }[]; missing: number };

// A side keeps its largest schedules by name; the rest share one "Other" node, so a long month stays readable.
const largest = (sums: Map<string, number>, keep: number, other: string) => {
 const sorted = [...sums].filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]);
 const rest = sorted.slice(keep).reduce((sum, [, amount]) => sum + amount, 0);
 return [...sorted.slice(0, keep), ...(rest > 0 ? [[other, rest] as [string, number]] : [])];
};

/** The month's schedules as a Sankey: each income into one total, out to each bill and what is left. Amounts count as the
 * summary bars do: a paid one what was recorded, the rest what is due; skipped ones and ones no rate converts are left out. */
export function recurringFlows(items: readonly RecurringItem[], convert: (amount: number, currency: string) => number | null, label: (key: string) => string, keep = 8): RecurringFlows {
 const sums = { income: new Map<string, number>(), expense: new Map<string, number>() };
 let missing = 0;
 for (const item of items) {
  if (item.status === 'skipped') continue;
  const value = item.recorded === null ? null : convert(item.status === 'paid' ? item.recorded ?? item.amount : item.amount, item.record.currency);
  if (value === null) { missing++; continue; }
  const name = item.record.name.trim() || label(item.record.kind);
  sums[item.direction].set(name, (sums[item.direction].get(name) ?? 0) + value);
 }
 const incoming = largest(sums.income, keep, label('Other'));
 const outgoing = largest(sums.expense, keep, label('Other'));
 const totalIn = incoming.reduce((sum, [, amount]) => sum + amount, 0), totalOut = outgoing.reduce((sum, [, amount]) => sum + amount, 0);
 const left = totalIn - totalOut;
 const sources: [string, number, Kind][] = [...incoming.map(([name, amount]) => [name, amount, 'income'] as [string, number, Kind]), ...(left < 0 ? [[label('Shortfall'), -left, 'untraced'] as [string, number, Kind]] : [])];
 const targets: [string, number, Kind][] = [...outgoing.map(([name, amount]) => [name, amount, 'expense'] as [string, number, Kind]), ...(left > 0 ? [[label('Left after expenses'), left, 'savings'] as [string, number, Kind]] : [])];
 if (!sources.length || !targets.length) return { nodes: [], links: [], missing };
 const total = sources.length;
 return {
  nodes: [...sources.map(([name, , kind]) => ({ name, kind })), { name: label('Recurring'), kind: 'total' }, ...targets.map(([name, , kind]) => ({ name, kind }))],
  links: [...sources.map(([, value], index) => ({ source: index, target: total, value })), ...targets.map(([, value], index) => ({ source: total, target: total + 1 + index, value }))],
  missing,
 };
}
