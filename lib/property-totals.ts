import { expenses, type Entry } from './finance';
import { amountIn, type PairRate, type RateTable } from './money';

/** A property's actual income and costs over a period, in one currency; `missing` counts payments no rate converts. */
export type PropertyTotals = { income: number; costs: number; missing: number };

/** The property a one-time payment belongs to, by ids only: rent names it as its income source and an expense as its
 * property, directly or through the schedule it pays (migration 148). */
export function paymentProperty(entry: Entry, byId: ReadonlyMap<string, Entry>): string | null {
 const schedule = entry.occurrence_record_id ? byId.get(entry.occurrence_record_id) : undefined;
 if (entry.kind === 'Rent income') return entry.income_source_id ?? schedule?.income_source_id ?? null;
 if (expenses.includes(entry.kind)) return entry.property_id ?? schedule?.property_id ?? null;
 return null;
}

/** The name of the property a payment belongs to, for its details; undefined when it names none we know. */
export function propertyNameOf(entry: Entry, records: readonly Entry[]): string | undefined {
 const byId = new Map(records.map(record => [record.id, record]));
 const id = paymentProperty(entry, byId);
 const property = id ? byId.get(id) : undefined;
 return property?.kind === 'Property' ? property.name : undefined;
}

/** Rent received and costs paid for each property from `from` through `to`, in `currency`. Only recorded one-time
 * payments count, never schedules or estimates; a link to a property that is not in `records` adds nothing. */
export function propertyTotals(records: readonly Entry[], from: string, to: string, currency: string, rates?: RateTable | PairRate | null): Map<string, PropertyTotals> {
 const byId = new Map(records.map(record => [record.id, record]));
 const totals = new Map<string, PropertyTotals>(records.filter(record => record.kind === 'Property').map(record => [record.id, { income: 0, costs: 0, missing: 0 }]));
 for (const entry of records) {
  if (entry.frequency !== 'Once' || !entry.date || entry.date < from || entry.date > to) continue;
  const property = paymentProperty(entry, byId);
  const total = property ? totals.get(property) : undefined;
  if (!total) continue;
  const amount = amountIn({ amount: entry.amount, currency: entry.currency }, currency, rates);
  if (amount === null) total.missing += 1;
  else if (entry.kind === 'Rent income') total.income += amount;
  else total.costs += amount;
 }
 return totals;
}
