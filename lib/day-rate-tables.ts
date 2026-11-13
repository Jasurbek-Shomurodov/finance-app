// A transaction counts in another currency at the official rates of its own day (migration 149). Every day's rates are
// kept in `exchange_rate_days` for every workspace and read from there alone; only the daily Vercel job downloads them
// (lib/exchange-rate-service.ts).
import { shiftDay } from './calendar-days';
import { readAllPages } from './owner-rows';
import { serviceDatabase, type ServiceDatabase } from './service-role';
import { happened, type DayTable } from './transaction-rates';
import type { DayRate } from './day-rates';

const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

/** Every kept day from `from` through `to`, oldest first: the days alone, since years of tables are megabytes. */
export async function keptDaysBetween(from: string, to: string, db: ServiceDatabase | null = serviceDatabase()): Promise<string[]> {
 if (!db || !validDay(from) || !validDay(to)) return [];
 try { return (await readAllPages<{ day: string }>(range => db.read(`/rest/v1/exchange_rate_days?select=day&day=gte.${from}&day=lte.${to}&order=day.asc&${range}`))).map(row => row.day); }
 catch { return []; /* Nothing kept reads as nothing kept. */ }
}

/** One kept day's rates and where they came from. */
export async function keptDay(day: string, db: ServiceDatabase | null = serviceDatabase()): Promise<{ rates: DayTable; source: string } | undefined> {
 if (!db || !validDay(day)) return undefined;
 try { return (await db.read<{ rates: DayTable; source: string }[]>(`/rest/v1/exchange_rate_days?select=rates,source&day=eq.${day}`))[0]; }
 catch { return undefined; }
}

export type DayTableDeps = { db?: ServiceDatabase | null; today: string };
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

/** The official rates of each day in `days` (today or earlier) that is kept; a day not kept is missing from the answer. */
export async function dayTables(days: Iterable<string>, deps: DayTableDeps): Promise<Map<string, DayTable>> {
 const wanted = [...new Set(days)].filter(day => validDay(day) && day <= deps.today);
 const db = deps.db === undefined ? serviceDatabase() : deps.db;
 const kept = new Map<string, DayTable>();
 if (!db) return kept;
 for (const part of chunk(wanted, 150)) {
  try {
   const rows = await db.read<{ day: string; rates: DayTable }[]>(`/rest/v1/exchange_rate_days?select=day,rates&day=in.(${part.join(',')})`);
   for (const row of rows) kept.set(row.day, row.rates);
  } catch { return kept; }
 }
 return kept;
}

/** A published rate stays in force until the next one: a day that is not kept is answered by the latest kept day at most
 * this many days before it. Today is such a day until the daily download has run, and so is a day the provider skipped. */
export const inForceDays = 7;

/** `dayTables`, with each day that is not kept answered by the rates in force on it (`inForceDays`). Once the day itself
 * is kept, the next read answers with its own table. A day with nothing kept that close before it stays missing. */
export async function inForceDayTables(days: Iterable<string>, deps: DayTableDeps): Promise<Map<string, DayTable>> {
 const wanted = [...new Set(days)].filter(day => validDay(day) && day <= deps.today);
 const tables = await dayTables(wanted, deps);
 const missing = wanted.filter(day => !tables.has(day)).sort();
 const db = deps.db === undefined ? serviceDatabase() : deps.db;
 if (!missing.length || !db) return tables;
 // One list of kept days per run of missing days whose weeks touch: usually today alone.
 const spans: Array<{ from: string; to: string }> = [];
 for (const day of missing) {
  const from = shiftDay(day, -inForceDays), last = spans.at(-1);
  if (last && from <= last.to) last.to = day; else spans.push({ from, to: day });
 }
 const kept = (await Promise.all(spans.map(span => keptDaysBetween(span.from, span.to, db)))).flat();
 const standIn = new Map(missing.map(day => [day, kept.findLast(other => other < day && other >= shiftDay(day, -inForceDays))]));
 const earlier = await dayTables([...standIn.values()].filter((day): day is string => !!day), deps);
 for (const [day, other] of standIn) { const table = other && earlier.get(other); if (table) tables.set(day, table); }
 return tables;
}

/** A day's official rate (units of `to` for one `from`) from the kept day tables, the same ones each transaction converts
 * at. A pair or day the tables cannot answer goes to `fallback`. */
export function keptDayRate(deps: DayTableDeps, fallback?: DayRate): DayRate {
 const days = new Map<string, Promise<DayTable | undefined>>();
 return async (from, to, date) => {
  if (!days.has(date)) days.set(date, dayTables([date], deps).then(tables => tables.get(date), () => undefined));
  const table = await days.get(date), a = table?.[from], b = table?.[to];
  if (positive(a) && positive(b)) return Number(b) / Number(a);
  if (fallback) return fallback(from, to, date);
  throw Error('Historical exchange rates are unavailable.');
 };
}

type Dated = { kind: string; currency: string; date?: string | null; frequency?: string; account_currency?: string | null; day_rates?: DayTable | null };
/** A transfer, repayment or purchase: dated by its own day, or by its investment event's. */
type DayRow = { occurred_on?: string; investment_history?: { occurred_on: string } | null; day_rates?: DayTable | null };
const rowDay = (row: DayRow) => row.occurred_on ?? row.investment_history?.occurred_on;
type Dateable = { records: readonly Dated[]; activity?: readonly DayRow[]; movements?: readonly DayRow[]; investmentLinks?: readonly DayRow[] };

/** `data` with each transaction, transfer, repayment and purchase dated today or earlier carrying its day's rates
 * (`day_rates`; the rates in force on a day not kept yet, `inForceDayTables`), cut to the currencies it can be shown in: `currencies` (the viewer's preferred ones) and every currency of
 * its records. A day with no rates in force is attached as null, so its amounts count as missing. */
export async function withPlanningDayRates<D extends Dateable>(data: D, currencies: Iterable<string>, deps: DayTableDeps): Promise<D> {
 const rows = (['activity', 'movements', 'investmentLinks'] as const).flatMap(key => data[key] ?? []);
 // A transaction saved with its day's rates (migration 150) keeps them; only the others look their day up.
 const unsaved = (record: Dated) => happened(record, deps.today) && !record.day_rates;
 const days = [...data.records.filter(unsaved).map(record => record.date!), ...rows.map(rowDay).filter((day): day is string => !!day && day <= deps.today)];
 const tables = days.length ? await inForceDayTables(days, deps) : new Map<string, DayTable>();
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
