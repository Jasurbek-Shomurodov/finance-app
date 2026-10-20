import { expenses, income } from './finance';

// The rates a transaction converts at. A figure that adds transactions converts each one at the official rates of its own
// day, never at today's (the user's rule, 20 October 2026). Balances, net worth and what is still to come stay at today's rates.

/** Units of each currency per US dollar on one day; USD is 1. The shape `convertAmount` and `convertMoney` read. */
export type DayTable = Record<string, number>;

/** What `ratesOf` reads from a transaction. The server attaches `day_rates` to every transaction dated today or earlier:
 * a table, or null when that day's rates could not be loaded. */
export type DatedRecord = { currency: string; date?: string | null; frequency?: string; day_rates?: DayTable | null; account_currency?: string | null; account_exchange_rate?: number | null };

const usable = (rate: unknown): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate > 0;

/** The rates to convert `record` with. Its own day's table when the server attached one; a record paid from an account in
 * another currency also keeps the exact rate it was paid at, so it adds what really left the account. A record the server
 * gave no table (a schedule, a sample record) converts at `current`, today's rates. A transaction whose day could not be
 * loaded (`day_rates: null`) gets no rates, so it counts as missing ("Exchange rate unavailable"), never at today's rate. */
export function ratesOf(record: DatedRecord | null | undefined, current?: Record<string, number> | number | null): Record<string, number> | undefined {
 // The older single rate is UZS per US dollar.
 const today = typeof current === 'number' ? { USD: 1, UZS: current } : current ?? undefined;
 if (!record) return today;
 const day = record.day_rates === undefined ? today : record.day_rates ?? undefined;
 const paid = record.account_currency, rate = record.account_exchange_rate;
 if (!paid || paid === record.currency || !usable(rate)) return day;
 // `rate` is units of the record's currency per unit of the account's currency.
 const table: DayTable = { ...day, USD: 1 };
 if (paid === 'USD') table[record.currency] = rate;
 else if (record.currency === 'USD') table[paid] = 1 / rate;
 else if (usable(table[paid])) table[record.currency] = table[paid] * rate;
 else if (usable(table[record.currency])) table[paid] = table[record.currency] / rate;
 else return day;
 return table;
}

/** `ratesOf` where the caller may pass a pair rate instead of a table: a pair rate is used as given. */
export function ratesOrPair<P extends (from: string, to: string) => number | null | undefined>(record: DatedRecord | null | undefined, current: Readonly<Record<string, number | null | undefined>> | P | null | undefined): Record<string, number> | P | undefined {
 return typeof current === 'function' ? current : ratesOf(record, current as Record<string, number> | null | undefined);
}

const flows = new Set<string>([...income, ...expenses]);
/** Income or spending that happened: once, today or earlier. These carry their day's rates; schedules, future entries
 * and holdings convert at today's. */
export const happened = (record: { kind: string; frequency?: string; date?: string | null }, today: string) => flows.has(record.kind) && record.frequency === 'Once' && !!record.date && record.date <= today;
