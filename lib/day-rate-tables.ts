// A transaction counts in another currency at the official rates of its own day (migration 149). One request to the
// Central Bank of Uzbekistan archive gives every currency of a day; each past day is fetched once and kept in
// `exchange_rate_days` for every workspace, because the archive takes seconds per day.
import { datedRateRevalidate } from './dated-exchange-rate';
import { serviceDatabase, type ServiceDatabase } from './service-role';
import { happened, type DayTable } from './transaction-rates';

const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

/** A day's archive rows (UZS per `Nominal` units, effective on or before the day) as units of each currency per US dollar. */
export function cbuDayTable(rows: unknown, day: string): DayTable {
 if (!validDay(day) || !Array.isArray(rows)) throw Error('Historical exchange rates are unavailable.');
 const uzs: Record<string, number> = { UZS: 1 };
 for (const row of rows as Record<string, unknown>[]) {
  const effective = typeof row?.Date === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(row.Date) ? row.Date.split('.').reverse().join('-') : '';
  if (typeof row?.Ccy === 'string' && /^[A-Z]{3}$/.test(row.Ccy) && row.Ccy !== 'UZS' && validDay(effective) && effective <= day && positive(row.Rate) && positive(row.Nominal)) uzs[row.Ccy] = Number(row.Rate) / Number(row.Nominal);
 }
 if (!uzs.USD) throw Error('Historical exchange rates are unavailable.');
 return Object.fromEntries(Object.entries(uzs).map(([currency, value]) => [currency, currency === 'USD' ? 1 : uzs.USD / value]));
}

/** One day's rates from the archive; a past day is kept in the fetch cache for a month. */
async function fetchCbuDay(day: string, fetcher: typeof fetch = fetch): Promise<DayTable> {
 const response = await fetcher(`https://cbu.uz/ru/arkhiv-kursov-valyut/json/all/${day}/`, { next: { revalidate: datedRateRevalidate(day) }, signal: AbortSignal.timeout(8000) } as RequestInit);
 if (!response.ok) throw Error('Historical exchange rates are unavailable.');
 return cbuDayTable(await response.json(), day);
}

export type DayTableDeps = { db?: ServiceDatabase | null; fetchDay?: (day: string) => Promise<DayTable>; today: string; budgetMs?: number; concurrency?: number; later?: (work: () => Promise<void>) => void };
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

async function readKept(db: ServiceDatabase, days: string[]) {
 const kept = new Map<string, DayTable>();
 for (const part of chunk(days, 150)) {
  try {
   const rows = await db.read<{ day: string; rates: DayTable }[]>(`/rest/v1/exchange_rate_days?select=day,rates&day=in.(${part.join(',')})`);
   for (const row of rows) kept.set(row.day, row.rates);
  } catch { return kept; /* Before migration 149 nothing is kept; every day is fetched. */ }
 }
 return kept;
}

/** Fetches `days` a few at a time; a day still waiting when `deadline` passes is left for later. Each day found is kept. */
async function fetchDays(days: string[], deps: Required<Pick<DayTableDeps, 'fetchDay' | 'concurrency'>> & { db: ServiceDatabase | null; today: string }, deadline = Infinity) {
 const found = new Map<string, DayTable>(), queue = [...days];
 const worker = async () => {
  // The budget is checked before a day is taken, so a day not started stays in the queue for later.
  while (queue.length && Date.now() < deadline) {
   const day = queue.shift()!;
   try { found.set(day, await deps.fetchDay(day)); } catch { /* That day stays missing. */ }
  }
 };
 await Promise.all(Array.from({ length: Math.min(deps.concurrency, days.length) }, worker));
 // The archive publishes a day's rates before it starts, so today's are final too.
 const keep = [...found].filter(([day]) => day <= deps.today).map(([day, rates]) => ({ day, rates, source: 'CBU' }));
 if (deps.db && keep.length) {
  try { await deps.db.write('/rest/v1/exchange_rate_days?on_conflict=day', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(keep) }); } catch { /* Kept next time. */ }
 }
 return { found, left: queue };
}

/** The official rates of each day in `days` (today or earlier): kept days at once, the rest fetched within `budgetMs`.
 * A day not reached in time is missing from the answer and is fetched and kept after the response (`later`). */
export async function dayTables(days: Iterable<string>, deps: DayTableDeps): Promise<Map<string, DayTable>> {
 const wanted = [...new Set(days)].filter(day => validDay(day) && day <= deps.today).sort().reverse();
 const db = deps.db === undefined ? serviceDatabase() : deps.db;
 const tables = db ? await readKept(db, wanted) : new Map<string, DayTable>();
 const missing = wanted.filter(day => !tables.has(day));
 if (!missing.length) return tables;
 const options = { db, today: deps.today, fetchDay: deps.fetchDay ?? (day => fetchCbuDay(day)), concurrency: deps.concurrency ?? 8 };
 const { found, left } = await fetchDays(missing, options, Date.now() + (deps.budgetMs ?? 6000));
 for (const [day, rates] of found) tables.set(day, rates);
 if (left.length && deps.later) deps.later(async () => { await fetchDays(left, options); });
 return tables;
}

type Dated = { kind: string; currency: string; date?: string | null; frequency?: string; account_currency?: string | null; day_rates?: DayTable | null };
/** A transfer, repayment or purchase: dated by its own day, or by its investment event's. */
type DayRow = { occurred_on?: string; investment_history?: { occurred_on: string } | null; day_rates?: DayTable | null };
const rowDay = (row: DayRow) => row.occurred_on ?? row.investment_history?.occurred_on;
type Dateable = { records: readonly Dated[]; activity?: readonly DayRow[]; movements?: readonly DayRow[]; investmentLinks?: readonly DayRow[] };

/** `data` with each transaction, transfer, repayment and purchase dated today or earlier carrying its day's rates
 * (`day_rates`), cut to the currencies it can be shown in: `currencies` (the viewer's preferred ones) and every currency of
 * its records. A day whose rates could not be loaded is attached as null, so its amounts count as missing. */
export async function withPlanningDayRates<D extends Dateable>(data: D, currencies: Iterable<string>, deps: DayTableDeps): Promise<D> {
 const rows = (['activity', 'movements', 'investmentLinks'] as const).flatMap(key => data[key] ?? []);
 // A transaction saved with its day's rates (migration 150) keeps them; only the others look their day up.
 const unsaved = (record: Dated) => happened(record, deps.today) && !record.day_rates;
 const days = [...data.records.filter(unsaved).map(record => record.date!), ...rows.map(rowDay).filter((day): day is string => !!day && day <= deps.today)];
 const tables = days.length ? await dayTables(days, deps) : new Map<string, DayTable>();
 const shown = new Set(['USD', ...currencies, ...data.records.flatMap(record => [record.currency, record.account_currency ?? record.currency])]);
 const cutTable = (table: DayTable) => Object.fromEntries(Object.entries(table).filter(([currency]) => shown.has(currency)));
 const cut = new Map([...tables].map(([day, table]) => [day, cutTable(table)]));
 const dated = <R extends DayRow>(row: R): R => { const day = rowDay(row); return day && day <= deps.today ? { ...row, day_rates: cut.get(day) ?? null } : row; };
 return {
  ...data,
  records: data.records.map(record => !happened(record, deps.today) ? record : { ...record, day_rates: record.day_rates ? cutTable(record.day_rates) : cut.get(record.date!) ?? null }),
  ...Object.fromEntries((['activity', 'movements', 'investmentLinks'] as const).filter(key => data[key]).map(key => [key, data[key]!.map(dated)])),
 };
}

/** `records` with each transaction's day rates attached, as `withPlanningDayRates` does. */
export async function withDayRates<T extends Dated>(records: readonly T[], currencies: Iterable<string>, deps: DayTableDeps): Promise<T[]> {
 return (await withPlanningDayRates({ records }, currencies, deps)).records as T[];
}

/** Keeps the official rates of `dates` (today or earlier) in exchange_rate_days before transactions on them are saved, so
 * the database saves each one with its day's rates (migration 150). A day the archive cannot give in time is skipped:
 * the transaction saves without rates and its day is looked up when it is read. Without the server-only key nothing can be
 * kept, so nothing is fetched. Never fails a save. */
export async function keepDayRates(dates: Iterable<string | null | undefined>, deps: DayTableDeps): Promise<void> {
 const db = deps.db === undefined ? serviceDatabase() : deps.db;
 if (!db) return;
 try { await dayTables([...dates].filter((day): day is string => !!day), { budgetMs: 8000, ...deps, db }); } catch { /* The save goes on. */ }
}
