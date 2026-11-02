// The official rate of one day between two currencies, for a payment or a record saved in another currency. Read from
// the kept day tables (`exchange_rate_days`) alone, so nobody waits for a rate: the daily jobs download them
// (lib/exchange-rate-service.ts). Each table is units per US dollar, so every pair goes through the dollar.
import { shiftDay } from './calendar-days';
import { dayTables, keptDaysBetween, type DayTableDeps } from './day-rate-tables';
import { depositToday } from './deposit-interest';

export type DatedExchangeRate = { from: string; to: string; date: string; effective_date: string; rate: number; source: 'CBU' };

/** A published rate stays in force until the next one: when a day is not kept yet, the latest kept day this close before it answers, named as its effective date. */
const inForceDays = 7;

export async function loadOfficialRate(from: string, to: string, date: string, deps: Partial<DayTableDeps> = {}): Promise<DatedExchangeRate> {
 const options = { db: deps.db, today: deps.today ?? depositToday() };
 let day = date, table = (await dayTables([date], options)).get(date);
 if (!table) {
  day = (await keptDaysBetween(shiftDay(date, -inForceDays), date, deps.db)).at(-1) ?? date;
  table = day === date ? undefined : (await dayTables([day], options)).get(day);
 }
 const rate = Number(table?.[to]) / Number(table?.[from]);
 if (!Number.isFinite(rate) || rate <= 0) throw Error('Historical exchange rates are unavailable.');
 return { from, to, date, effective_date: day, rate, source: 'CBU' };
}
